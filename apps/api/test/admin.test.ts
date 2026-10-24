import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DAY, HOUR, MINUTE } from '../src/clock';
import { UA, adminAgent, device, makeApp, signup, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = makeApp();
});

describe('autorização', () => {
  it('sem sessão = 401; usuário comum = 403; admin = 200', async () => {
    expect((await request(t.app).get('/api/admin/overview')).status).toBe(401);
    const { agent } = await signup(t.app);
    const forbidden = await agent.get('/api/admin/users');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('forbidden');
    for (const path of ['/api/admin/overview', '/api/admin/access-logs', '/api/admin/access-logs.csv', '/api/admin/sessions']) {
      expect((await agent.get(path)).status).toBe(403);
    }
    const admin = await adminAgent(t);
    expect((await admin.get('/api/admin/overview')).status).toBe(200);
  });
});

describe('visão geral e usuários', () => {
  it('overview: contagens e logins por dia (14 dias, com zeros)', async () => {
    const admin = await adminAgent(t); // login de hoje
    await signup(t.app, { name: 'Ana Paula' });
    t.clock.advance(2 * DAY);
    await signup(t.app, { name: 'Beto Silva' });
    const res = await admin.get('/api/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ usersTotal: 3, usersActive: 3, adminsTotal: 1, activeSessions: 3, loginsToday: 1 });
    expect(res.body.loginsByDay).toHaveLength(14);
    const byDate = Object.fromEntries(res.body.loginsByDay.map((d: any) => [d.date, d.count]));
    expect(byDate['2026-10-23']).toBe(2); // admin + Ana
    expect(byDate['2026-10-25']).toBe(1); // Beto
    expect(byDate['2026-10-24']).toBe(0);
    expect(res.body.loginsByDay.at(-1).date).toBe('2026-10-25');
  });

  it('lista usuários com busca, paginação e contagens', async () => {
    const admin = await adminAgent(t);
    const ana = await signup(t.app, { name: 'Ana Paula', email: 'ana@x.com' });
    await ana.agent.post('/api/subjects').send({ name: 'Física', color: '#2563EB' });
    await signup(t.app, { name: 'Beto Silva', email: 'beto@x.com' });
    const all = await admin.get('/api/admin/users');
    expect(all.body.total).toBe(3);
    const row = all.body.items.find((u: any) => u.email === 'ana@x.com');
    expect(row).toMatchObject({ name: 'Ana Paula', role: 'user', isActive: true, activeSessions: 1, subjectsCount: 1 });
    expect(row).not.toHaveProperty('password_hash');
    expect((await admin.get('/api/admin/users?q=beto')).body.items.map((u: any) => u.email)).toEqual(['beto@x.com']);
    expect((await admin.get('/api/admin/users?q=%25')).body.total).toBe(0); // % é literal, não curinga
    const page = await admin.get('/api/admin/users?limit=2&offset=2');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(3);
  });
});

describe('gestão de usuários e salvaguardas', () => {
  it('promove a admin e bloqueia: sessões do alvo caem com motivo admin; desbloqueia', async () => {
    const admin = await adminAgent(t);
    const { agent, user, body } = await signup(t.app);
    t.clock.advance(10 * MINUTE);

    const promo = await admin.patch(`/api/admin/users/${user.id}`).send({ role: 'admin' });
    expect(promo.body.role).toBe('admin');
    expect((await agent.get('/api/admin/overview')).status).toBe(200);
    await admin.patch(`/api/admin/users/${user.id}`).send({ role: 'user' });

    const blocked = await admin.patch(`/api/admin/users/${user.id}`).send({ isActive: false });
    expect(blocked.status).toBe(200);
    expect(blocked.body).toMatchObject({ isActive: false, activeSessions: 0 });
    expect((await agent.get('/api/me')).status).toBe(401);
    const log = t.db.prepare('select * from access_logs where user_id = ?').get(user.id) as any;
    expect(log).toMatchObject({ logout_reason: 'admin', logout_at: '2026-10-23T15:10:00.000Z' });
    expect((await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password })).body.error.code).toBe('account_disabled');

    await admin.patch(`/api/admin/users/${user.id}`).send({ isActive: true });
    expect((await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password })).status).toBe(200);
  });

  it('ninguém rebaixa, bloqueia ou exclui a si mesmo (409) — sempre sobra um admin ativo', async () => {
    const admin = await adminAgent(t);
    const me = (await admin.get('/api/me')).body.user;
    for (const body of [{ role: 'user' }, { isActive: false }]) {
      const r = await admin.patch(`/api/admin/users/${me.id}`).send(body);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('cannot_modify_self');
    }
    const del = await admin.delete(`/api/admin/users/${me.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('cannot_modify_self');

    // Com dois admins, um pode rebaixar o outro; o que sobra continua sem poder se rebaixar.
    const other = await signup(t.app);
    await admin.patch(`/api/admin/users/${other.user.id}`).send({ role: 'admin' });
    expect((await other.agent.patch(`/api/admin/users/${me.id}`).send({ role: 'user' })).status).toBe(200);
    const last = await other.agent.patch(`/api/admin/users/${other.user.id}`).send({ role: 'user' });
    expect(last.status).toBe(409);
    expect((await other.agent.get('/api/admin/overview')).status).toBe(200);
    expect((await admin.get('/api/admin/overview')).status).toBe(403); // o primeiro já não é admin
  });

  it('exclui usuário: mantém o log de acessos (cópia de nome/e-mail) com logout admin', async () => {
    const admin = await adminAgent(t);
    const { user, agent } = await signup(t.app, { name: 'Ana Paula', email: 'ana@x.com' });
    t.clock.advance(HOUR);
    expect((await admin.delete(`/api/admin/users/${user.id}`)).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect((await admin.delete(`/api/admin/users/${user.id}`)).status).toBe(404);
    const log = t.db.prepare('select * from access_logs where user_email = ?').get('ana@x.com') as any;
    expect(log).toMatchObject({ user_id: null, user_name: 'Ana Paula', logout_reason: 'admin', logout_at: '2026-10-23T16:00:00.000Z' });
    expect(t.db.prepare('select count(*) c from sessions where user_id = ?').get(user.id)).toEqual({ c: 0 });
  });
});

describe('log de acessos e CSV', () => {
  async function scenario() {
    const admin = await adminAgent(t);
    const ana = await signup(t.app, { name: 'Ana Paula', email: 'ana@x.com' }, UA.chromeWin);
    t.clock.advance(HOUR);
    await ana.agent.post('/api/auth/logout');
    t.clock.advance(DAY);
    const phone = device(t.app, UA.safariIphone);
    await phone.post('/api/auth/login').send({ email: 'ana@x.com', password: ana.body.password });
    await signup(t.app, { name: '=cmd|calc', email: 'evil@x.com' });
    return { admin, ana };
  }

  it('filtra por usuário, texto e período; ordena do mais recente ao mais antigo', async () => {
    const { admin, ana } = await scenario();
    const all = await admin.get('/api/admin/access-logs');
    expect(all.body.total).toBe(4);
    expect(all.body.items[0].loginAt >= all.body.items[3].loginAt).toBe(true);
    const byUser = await admin.get(`/api/admin/access-logs?userId=${ana.user.id}`);
    expect(byUser.body.items.map((l: any) => l.device)).toEqual(['Safari · iPhone', 'Chrome · Windows']);
    expect((await admin.get('/api/admin/access-logs?q=ana@x')).body.total).toBe(2);
    expect((await admin.get('/api/admin/access-logs?from=2026-10-24')).body.total).toBe(2);
    expect((await admin.get('/api/admin/access-logs?to=2026-10-23')).body.total).toBe(2);
    expect((await admin.get('/api/admin/access-logs?from=2026-13-40')).status).toBe(422);
    const first = byUser.body.items[1];
    expect(first).toMatchObject({ userName: 'Ana Paula', logoutReason: 'manual', logoutAt: '2026-10-23T16:00:00.000Z' });
    expect(byUser.body.items[0].logoutAt).toBeNull(); // em andamento
  });

  it('CSV: BOM UTF-8, separador ;, fuso, anti-injeção e cabeçalho de download', async () => {
    const { admin } = await scenario();
    const res = await admin.get('/api/admin/access-logs.csv?tzOffsetMinutes=-180').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="acessos-2026-10-24\.csv"/);
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 3).toString('hex')).toBe('efbbbf'); // BOM
    const lines = buf.toString('utf8').slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Nome;E-mail;Data;Hora login;Hora logout;Duração (min);Dispositivo;Método;Motivo');
    const ana1 = lines.find((l) => l.includes('Chrome · Windows') && l.startsWith('Ana Paula'))!;
    // login 15:00 UTC = 12:00 em Brasília; logout 16:00 UTC; 60 min
    expect(ana1).toBe('Ana Paula;ana@x.com;23/10/2026;12:00:00;23/10/2026 13:00:00;60;Chrome · Windows;E-mail e senha;Saiu do app');
    const open = lines.find((l) => l.includes('Safari · iPhone'))!;
    expect(open.endsWith(';;;Safari · iPhone;E-mail e senha;Em andamento') || open.includes(';;;Safari')).toBe(true);
    expect(lines.some((l) => l.startsWith("'=cmd|calc;"))).toBe(true); // célula iniciada por = é neutralizada
    expect(lines.some((l) => l.startsWith('=cmd'))).toBe(false);
  });

  it('sessões ativas: lista e encerramento forçado pelo admin (motivo admin)', async () => {
    const { admin, ana } = await scenario();
    const list = await admin.get('/api/admin/sessions');
    expect(list.body.total).toBe(3); // admin + iPhone da Ana + evil (a do Chrome saiu)
    const item = list.body.items.find((s: any) => s.device === 'Safari · iPhone');
    expect(item).toMatchObject({ userName: 'Ana Paula', userEmail: 'ana@x.com', userId: ana.user.id });
    t.clock.advance(MINUTE);
    expect((await admin.delete(`/api/admin/sessions/${item.id}`)).status).toBe(204);
    expect((await admin.get('/api/admin/sessions')).body.total).toBe(2);
    const log = t.db.prepare("select * from access_logs where device = 'Safari · iPhone'").get() as any;
    expect(log.logout_reason).toBe('admin');
    expect((await admin.delete(`/api/admin/sessions/${item.id}`)).status).toBe(404);
  });
});
