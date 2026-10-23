import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DAY, MINUTE } from '../src/clock';
import { UA, device, makeApp, signup, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = makeApp();
});

const logs = (t: TestApp) => t.db.prepare('select * from access_logs order by id').all() as any[];
const sessions = (t: TestApp) => t.db.prepare('select * from sessions order by id').all() as any[];

describe('cadastro e login', () => {
  it('registra, devolve o usuário e grava cookie HttpOnly/SameSite=Strict', async () => {
    const res = await request(t.app).post('/api/auth/register').send({
      name: 'Gustavo Peixoto', email: ' Gustavo@Exemplo.com ', password: 'senha-forte-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Gustavo Peixoto', email: 'gustavo@exemplo.com', role: 'user', weeklyGoalMinutes: 600 });
    expect(res.body.user).not.toHaveProperty('password_hash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^edumind_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Max-Age=604800/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it('cookie Secure quando COOKIE_SECURE=true', async () => {
    const s = makeApp({ config: { cookieSecure: true } });
    const res = await request(s.app).post('/api/auth/register').send({ name: 'Ana Paula', email: 'ana@x.com', password: 'senha-forte-1' });
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/);
  });

  it('só o sha256 do token vai ao banco; senha com scrypt', async () => {
    const res = await request(t.app).post('/api/auth/register').send({ name: 'Ana Paula', email: 'ana@x.com', password: 'senha-forte-1' });
    const token = /edumind_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes em base64url
    const [s] = sessions(t);
    expect(s.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.token_hash).not.toContain(token);
    const user = t.db.prepare('select password_hash from users').get() as any;
    expect(user.password_hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(user.password_hash).not.toContain('senha-forte-1');
  });

  it('valida entradas com 422 e mensagem em português', async () => {
    const bad = await request(t.app).post('/api/auth/register').send({ name: 'Ana', email: 'nao-e-email', password: 'curta' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('validation_error');
    expect(bad.body.error.message).toMatch(/[Ee]-mail|senha/);
    const short = await request(t.app).post('/api/auth/register').send({ name: 'Ana', email: 'a@x.com', password: 'curta' });
    expect(short.body.error.message).toMatch(/pelo menos 8 caracteres/);
    const empty = await request(t.app).post('/api/auth/login').send({});
    expect(empty.status).toBe(422);
  });

  it('e-mail repetido = 409 (sem diferenciar caixa)', async () => {
    await signup(t.app, { email: 'dup@x.com' });
    const res = await request(t.app).post('/api/auth/register').send({ name: 'Outro', email: 'DUP@x.com', password: 'senha-forte-1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('login ok, senha errada = 401 genérico, conta inexistente = mesma resposta', async () => {
    const { body } = await signup(t.app, { email: 'ok@x.com' });
    const good = await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(good.status).toBe(200);
    const wrong = await request(t.app).post('/api/auth/login').send({ email: body.email, password: 'errada-123' });
    const ghost = await request(t.app).post('/api/auth/login').send({ email: 'ninguem@x.com', password: 'errada-123' });
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(wrong.body).toEqual(ghost.body);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('rota protegida sem sessão = 401; com sessão devolve o usuário', async () => {
    expect((await request(t.app).get('/api/me')).status).toBe(401);
    expect((await request(t.app).get('/api/subjects')).status).toBe(401);
    const { agent, user } = await signup(t.app);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
  });

  it('PATCH /me atualiza nome, nível e meta semanal', async () => {
    const { agent } = await signup(t.app);
    const res = await agent.patch('/api/me').send({ name: 'Novo Nome', level: 'concurso', weeklyGoalMinutes: 900 });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Novo Nome', level: 'concurso', weeklyGoalMinutes: 900 });
    expect((await agent.patch('/api/me').send({ weeklyGoalMinutes: 5 })).status).toBe(422);
  });
});

describe('limites e proteções', () => {
  it('10 falhas de login em 10 min → 429 com Retry-After; sucesso zera; janela expira', async () => {
    const { body } = await signup(t.app, { email: 'forca@x.com' });
    for (let i = 0; i < 10; i++) {
      const r = await request(t.app).post('/api/auth/login').send({ email: body.email, password: 'errada-123' });
      expect(r.status).toBe(401);
    }
    const blocked = await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    t.clock.advance(11 * MINUTE);
    const again = await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(again.status).toBe(200);
  });

  it('login bem-sucedido zera o contador de falhas', async () => {
    const { body } = await signup(t.app);
    for (let i = 0; i < 9; i++) await request(t.app).post('/api/auth/login').send({ email: body.email, password: 'errada-123' });
    expect((await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password })).status).toBe(200);
    for (let i = 0; i < 9; i++) {
      expect((await request(t.app).post('/api/auth/login').send({ email: body.email, password: 'errada-123' })).status).toBe(401);
    }
  });

  it('rejeita Origin de outro site em métodos que alteram estado; aceita o permitido', async () => {
    const evil = await request(t.app).post('/api/auth/login').set('Origin', 'http://evil.example').send({ email: 'a@x.com', password: 'x' });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('bad_origin');
    const ok = await request(t.app).post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email: 'a@x.com', password: 'x' });
    expect(ok.status).toBe(401); // passou do filtro de origem (credenciais é que não existem)
    expect((await request(t.app).get('/api/health').set('Origin', 'http://evil.example')).status).toBe(200); // GET não é bloqueado
  });

  it('cabeçalhos de segurança e 404 em JSON', async () => {
    const res = await request(t.app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('JSON inválido = 400', async () => {
    const res = await request(t.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });
});

describe('log de acesso e sessões por dispositivo', () => {
  it('cada login cria 1 sessão + 1 linha de log (login_at, sem logout)', async () => {
    const { user } = await signup(t.app, { name: 'Gustavo Peixoto' }, UA.chromeWin);
    expect(sessions(t)).toHaveLength(1);
    expect(logs(t)).toHaveLength(1);
    expect(logs(t)[0]).toMatchObject({
      user_id: user.id, user_name: 'Gustavo Peixoto', method: 'password', device: 'Chrome · Windows',
      login_at: '2026-10-23T15:00:00.000Z', logout_at: null, logout_reason: null,
    });
    expect(logs(t)[0].session_id).toBe(sessions(t)[0].id);
    expect((t.db.prepare('select last_login_at from users').get() as any).last_login_at).toBe('2026-10-23T15:00:00.000Z');
  });

  it('login falho não gera log', async () => {
    const { body } = await signup(t.app);
    await request(t.app).post('/api/auth/login').send({ email: body.email, password: 'errada-123' });
    expect(logs(t)).toHaveLength(1);
  });

  it('logout grava a hora de saída uma única vez (motivo manual) e invalida o cookie', async () => {
    const { agent } = await signup(t.app);
    t.clock.advance(45 * MINUTE);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/edumind_session=;/);
    expect(logs(t)[0]).toMatchObject({ logout_at: '2026-10-23T15:45:00.000Z', logout_reason: 'manual' });
    expect(sessions(t)[0].revoke_reason).toBe('manual');
    expect((await agent.get('/api/me')).status).toBe(401);

    // Segundo logout (idempotente) não altera o log.
    t.clock.advance(10 * MINUTE);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect(logs(t)[0].logout_at).toBe('2026-10-23T15:45:00.000Z');
  });

  it('o cookie antigo não funciona depois do logout, mesmo reenviado', async () => {
    const reg = await request(t.app).post('/api/auth/register').send({ name: 'Ana Paula', email: 'ana@x.com', password: 'senha-forte-1' });
    const cookie = String(reg.headers['set-cookie']).split(';')[0]!;
    expect((await request(t.app).get('/api/me').set('Cookie', cookie)).status).toBe(200);
    await request(t.app).post('/api/auth/logout').set('Cookie', cookie);
    expect((await request(t.app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('dois dispositivos = duas sessões e dois logs; cada um aparece em /me/sessions', async () => {
    const { agent: pc, body } = await signup(t.app, {}, UA.chromeWin);
    const phone = device(t.app, UA.safariIphone);
    expect((await phone.post('/api/auth/login').send({ email: body.email, password: body.password })).status).toBe(200);
    expect(sessions(t)).toHaveLength(2);
    expect(logs(t).map((l) => l.device)).toEqual(['Chrome · Windows', 'Safari · iPhone']);

    const list = await pc.get('/api/me/sessions');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((s: any) => s.current)).toHaveLength(1);
    expect(list.body.items.find((s: any) => s.current).device).toBe('Chrome · Windows');
    // Mesmos dados nos dois dispositivos (persistência na conta, não no aparelho).
    await pc.post('/api/subjects').send({ name: 'Física', color: '#2563EB' });
    expect((await phone.get('/api/subjects')).body.items.map((s: any) => s.name)).toEqual(['Física']);
  });

  it('desconectar outro dispositivo fecha o log dele com motivo revoked', async () => {
    const { agent: pc, body } = await signup(t.app, {}, UA.chromeWin);
    const phone = device(t.app, UA.chromeAndroid);
    await phone.post('/api/auth/login').send({ email: body.email, password: body.password });
    const phoneSession = (await pc.get('/api/me/sessions')).body.items.find((s: any) => !s.current);
    t.clock.advance(5 * MINUTE);

    expect((await pc.delete(`/api/me/sessions/${phoneSession.id}`)).status).toBe(204);
    expect((await phone.get('/api/me')).status).toBe(401);
    expect((await pc.get('/api/me')).status).toBe(200);
    const closed = logs(t).find((l) => l.device === 'Chrome · Android');
    expect(closed).toMatchObject({ logout_reason: 'revoked', logout_at: '2026-10-23T15:05:00.000Z' });
    expect((await pc.delete(`/api/me/sessions/${phoneSession.id}`)).status).toBe(404); // já encerrada
  });

  it('não é possível desconectar a sessão de outro usuário (404)', async () => {
    const a = await signup(t.app);
    const b = await signup(t.app);
    const aSession = (await a.agent.get('/api/me/sessions')).body.items[0];
    expect((await b.agent.delete(`/api/me/sessions/${aSession.id}`)).status).toBe(404);
    expect((await a.agent.get('/api/me')).status).toBe(200);
  });

  it('GET /me/access-log lista só os acessos do próprio usuário, mais recentes primeiro', async () => {
    const a = await signup(t.app, { name: 'Ana Paula' });
    t.clock.advance(MINUTE);
    await signup(t.app, { name: 'Outro Aluno' });
    t.clock.advance(MINUTE);
    const second = device(t.app, UA.chromeAndroid);
    await second.post('/api/auth/login').send({ email: a.body.email, password: a.body.password });
    const res = await a.agent.get('/api/me/access-log');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((l: any) => l.device)).toEqual(['Chrome · Android', 'Chrome · Windows']);
    expect(res.body.items.every((l: any) => l.userName === 'Ana Paula')).toBe(true);
    const page = await a.agent.get('/api/me/access-log?limit=1&offset=1');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(2);
  });

  it('sessão vencida (7 dias): fechamento preguiçoso grava logout = validade, motivo expired', async () => {
    const { agent } = await signup(t.app);
    t.clock.advance(7 * DAY - MINUTE);
    expect((await agent.get('/api/me')).status).toBe(200);
    t.clock.advance(2 * MINUTE);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect(logs(t)[0]).toMatchObject({ logout_at: '2026-10-30T15:00:00.000Z', logout_reason: 'expired' });
    expect(sessions(t)[0]).toMatchObject({ revoke_reason: 'expired', revoked_at: '2026-10-30T15:00:00.000Z' });
  });

  it('varredura fecha logs de sessões vencidas que ninguém tocou', async () => {
    await signup(t.app);
    await signup(t.app);
    t.clock.advance(8 * DAY);
    expect(t.services.sweepExpired()).toBe(2);
    expect(logs(t).every((l) => l.logout_reason === 'expired' && l.logout_at === '2026-10-30T15:00:00.000Z')).toBe(true);
    expect(t.services.sweepExpired()).toBe(0); // idempotente
  });

  it('conta bloqueada: login = 403 account_disabled e sessões abertas caem', async () => {
    const { agent, body, user } = await signup(t.app);
    t.db.prepare('update users set is_active = 0 where id = ?').run(user.id);
    expect((await agent.get('/api/me')).status).toBe(401); // sessão existente deixa de valer
    const res = await request(t.app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_disabled');
    expect(logs(t)).toHaveLength(1); // login negado não vira log
  });

  it('X-Forwarded-For só vale com TRUST_PROXY=true', async () => {
    const plain = makeApp();
    await request(plain.app).post('/api/auth/register').set('X-Forwarded-For', '203.0.113.9').send({ name: 'Ana Paula', email: 'a@x.com', password: 'senha-forte-1' });
    expect((plain.db.prepare('select ip from access_logs').get() as any).ip).not.toBe('203.0.113.9');
    const proxied = makeApp({ config: { trustProxy: true } });
    await request(proxied.app).post('/api/auth/register').set('X-Forwarded-For', '203.0.113.9').send({ name: 'Ana Paula', email: 'a@x.com', password: 'senha-forte-1' });
    expect((proxied.db.prepare('select ip from access_logs').get() as any).ip).toBe('203.0.113.9');
  });
});
