import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db/db';
import { DemoLlm } from '../src/modules/chat/demo';
import { seedDemo } from '../src/seed/demo';

const NOW = new Date('2026-10-23T15:00:00.000Z'); // sexta-feira
const admin = { email: 'admin@edumind.local', password: 'admin12345', name: 'Administrador' };

const counts = (db: ReturnType<typeof openDb>) =>
  Object.fromEntries(
    ['users', 'sessions', 'access_logs', 'subjects', 'topics', 'daily_goals', 'study_sessions', 'chat_threads', 'chat_messages', 'lessons', 'assignments'].map(
      (t) => [t, (db.prepare(`select count(*) c from ${t}`).get() as any).c],
    ),
  );

describe('seed de demonstração', () => {
  it('é idempotente e cria admin, alunos e dados coerentes com o protótipo', async () => {
    const db = openDb(':memory:');
    const first = await seedDemo(db, { now: NOW, admin });
    expect(first.admin).toBe('created');
    expect(first.usersCreated).toEqual(['aluno@edumind.local', 'tales@edumind.local', 'lorenzo@edumind.local', 'eduardo@edumind.local', 'visitante@edumind.local']);
    const snapshot = counts(db);
    const second = await seedDemo(db, { now: NOW, admin });
    expect(second).toEqual({ admin: 'unchanged', usersCreated: [], demoDataCreated: false });
    expect(counts(db)).toEqual(snapshot);

    const app = createApp({ db, config: { ...loadConfig({}), dbPath: ':memory:' }, clock: () => NOW, llm: new DemoLlm({ delayMs: 0 }), scrape: async () => { throw new Error('não usado'); } });
    const aluno = request.agent(app);
    expect((await aluno.post('/api/auth/login').send({ email: 'aluno@edumind.local', password: 'aluno12345' })).body.user.name).toBe('Gustavo Peixoto');

    const subjects = (await aluno.get('/api/subjects')).body.items;
    expect(subjects.map((s: any) => s.name)).toEqual(['Banco de Dados', 'Desenvolvimento de Dispositivos Móveis', 'Engenharia de Software', 'Inteligência Artificial']);
    const pct = (name: string) => { const s = subjects.find((x: any) => x.name === name); return Math.round((s.doneCount / s.topicCount) * 100); };
    expect(pct('Desenvolvimento de Dispositivos Móveis')).toBe(80);
    expect(pct('Inteligência Artificial')).toBe(45);
    expect(subjects.find((s: any) => s.name === 'Desenvolvimento de Dispositivos Móveis')).toMatchObject({ professor: 'Prof. João', room: 'Sala 311 · Prédio 01' });

    const week = (await aluno.get('/api/stats/week?today=2026-10-23')).body;
    expect(week.totalMinutes).toBe(14 * 60); // ~14 h na semana corrente, como no protótipo
    expect(week.byDay.slice(0, 5).every((d: any) => d.minutes > 0)).toBe(true);
    expect(week.byDay.slice(5).every((d: any) => d.minutes === 0)).toBe(true);
    expect(week).toMatchObject({ goalsToday: 4, goalsTodayDone: 1, subjectsTotal: 4, subjectsCompleted: 1, weeklyGoalMinutes: 1200 });

    expect((await aluno.get('/api/goals?date=2026-10-23')).body.items).toHaveLength(4);
    expect((await aluno.get('/api/chats')).body.items).toHaveLength(2);
    expect((await aluno.get('/api/lessons?from=2026-10-23')).body.items.length).toBeGreaterThan(3);
    expect((await aluno.get('/api/assignments')).body.items.length).toBe(4);

    // Log de acessos variado: abertos, fechados, vários dispositivos e motivos.
    const log = (await aluno.get('/api/me/access-log?limit=200')).body;
    expect(log.total).toBeGreaterThanOrEqual(12);
    expect(log.items.filter((l: any) => l.logoutAt === null).length).toBeGreaterThanOrEqual(2);
    // (o login feito pelo próprio teste, sem User-Agent, também entra no log como "Dispositivo desconhecido")
    const seeded = log.items.filter((l: any) => l.device !== 'Dispositivo desconhecido');
    expect(new Set(seeded.map((l: any) => l.device))).toEqual(new Set(['Chrome · Windows', 'Safari · iPhone', 'Chrome · Android']));
    expect(new Set(log.items.map((l: any) => l.logoutReason))).toEqual(new Set([null, 'manual', 'revoked', 'admin', 'expired']));
    expect(new Set(log.items.map((l: any) => l.method))).toEqual(new Set(['password', 'google']));
    expect((await aluno.get('/api/me/sessions')).body.items.length).toBeGreaterThanOrEqual(2);

    // Admin enxerga todos os usuários (um deles bloqueado) e o log geral.
    const adm = request.agent(app);
    expect((await adm.post('/api/auth/login').send({ email: admin.email, password: admin.password })).status).toBe(200);
    const users = (await adm.get('/api/admin/users')).body;
    expect(users.total).toBe(6);
    expect(users.items.find((u: any) => u.email === 'visitante@edumind.local').isActive).toBe(false);
    expect((await adm.get('/api/admin/access-logs')).body.total).toBeGreaterThanOrEqual(23);
    expect((await adm.get('/api/admin/overview')).body.loginsByDay).toHaveLength(14);
    // Aluno bloqueado do seed não consegue entrar.
    expect((await request(app).post('/api/auth/login').send({ email: 'visitante@edumind.local', password: 'aluno12345' })).body.error.code).toBe('account_disabled');
  });

  it('promove um usuário existente a admin sem trocar a senha', async () => {
    const db = openDb(':memory:');
    db.prepare("insert into users (email, name, password_hash, created_at) values ('admin@edumind.local', 'Já Existia', 'scrypt$1$1$1$AA==$AA==', ?)").run(NOW.toISOString());
    expect((await seedDemo(db, { now: NOW, admin })).admin).toBe('promoted');
    expect(db.prepare("select role, password_hash from users where email = 'admin@edumind.local'").get()).toEqual({ role: 'admin', password_hash: 'scrypt$1$1$1$AA==$AA==' });
  });
});
