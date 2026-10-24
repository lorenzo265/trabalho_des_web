import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DAY } from '../src/clock';
import { makeApp, signup, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = makeApp();
});

const blue = '#2563EB';

describe('disciplinas', () => {
  it('CRUD completo com professor, sala e cor; contagens de tópicos', async () => {
    const { agent } = await signup(t.app);
    const created = await agent.post('/api/subjects').send({
      name: 'Desenvolvimento Móvel', professor: 'Prof. João', room: 'Sala 311 · Prédio 01', color: blue,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Desenvolvimento Móvel', professor: 'Prof. João', room: 'Sala 311 · Prédio 01', color: blue,
      source: 'manual', topicCount: 0, doneCount: 0,
    });
    const id = created.body.id;
    expect((await agent.get(`/api/subjects/${id}`)).body.name).toBe('Desenvolvimento Móvel');

    const patched = await agent.patch(`/api/subjects/${id}`).send({ professor: null, color: '#D97706' });
    expect(patched.body).toMatchObject({ professor: null, room: 'Sala 311 · Prédio 01', color: '#D97706' });
    expect((await agent.patch(`/api/subjects/${id}`).send({ room: '' })).body.room).toBeNull();

    expect((await agent.delete(`/api/subjects/${id}`)).status).toBe(204);
    expect((await agent.get(`/api/subjects/${id}`)).status).toBe(404);
    expect((await agent.get('/api/subjects')).body.items).toEqual([]);
  });

  it('nome repetido por usuário = 409 name_taken (sem diferenciar caixa), inclusive ao renomear', async () => {
    const a = await signup(t.app);
    const b = await signup(t.app);
    await a.agent.post('/api/subjects').send({ name: 'Física', color: blue });
    const dup = await a.agent.post('/api/subjects').send({ name: 'FÍSICA'.replace('Í', 'í'), color: blue });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('name_taken');
    expect((await b.agent.post('/api/subjects').send({ name: 'Física', color: blue })).status).toBe(201); // outro usuário pode
    const other = await a.agent.post('/api/subjects').send({ name: 'Química', color: blue });
    expect((await a.agent.patch(`/api/subjects/${other.body.id}`).send({ name: 'física' })).status).toBe(409);
    expect((await a.agent.patch(`/api/subjects/${other.body.id}`).send({ name: 'Química' })).status).toBe(200); // mesmo nome dela
  });

  it('valida nome e cor (422)', async () => {
    const { agent } = await signup(t.app);
    expect((await agent.post('/api/subjects').send({ name: '  ', color: blue })).status).toBe(422);
    expect((await agent.post('/api/subjects').send({ name: 'X', color: 'azul' })).status).toBe(422);
    expect((await agent.post('/api/subjects').send({ name: 'X', color: blue, professor: 'p'.repeat(81) })).status).toBe(422);
  });

  it('lista em ordem alfabética em português (acentos e caixa)', async () => {
    const { agent } = await signup(t.app);
    for (const name of ['Química', 'banco de dados', 'Álgebra', 'Ética']) await agent.post('/api/subjects').send({ name, color: blue });
    const names = (await agent.get('/api/subjects')).body.items.map((s: any) => s.name);
    expect(names).toEqual(['Álgebra', 'banco de dados', 'Ética', 'Química']);
  });

  it('unicidade ignora caixa também com acentos', async () => {
    const { agent } = await signup(t.app);
    await agent.post('/api/subjects').send({ name: 'Álgebra Linear', color: blue });
    const dup = await agent.post('/api/subjects').send({ name: '  álgebra linear ', color: blue });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('name_taken');
  });
});

describe('isolamento entre usuários', () => {
  it('recurso de outro usuário = 404 em todos os módulos', async () => {
    const a = await signup(t.app);
    const b = await signup(t.app);
    const subject = (await a.agent.post('/api/subjects').send({ name: 'Física', color: blue })).body;
    const topic = (await a.agent.post(`/api/subjects/${subject.id}/topics`).send({ title: 'Cinemática' })).body;
    const goal = (await a.agent.post('/api/goals').send({ subjectId: subject.id, goalDate: '2026-10-23', description: 'Ler' })).body;
    const thread = (await a.agent.post('/api/chats').send({ subjectId: subject.id })).body;

    const checks: (() => request.Test)[] = [
      () => b.agent.get(`/api/subjects/${subject.id}`),
      () => b.agent.patch(`/api/subjects/${subject.id}`).send({ name: 'Hack' }),
      () => b.agent.delete(`/api/subjects/${subject.id}`),
      () => b.agent.get(`/api/subjects/${subject.id}/topics`),
      () => b.agent.post(`/api/subjects/${subject.id}/topics`).send({ title: 'X' }),
      () => b.agent.patch(`/api/topics/${topic.id}`).send({ status: 'concluido' }),
      () => b.agent.delete(`/api/topics/${topic.id}`),
      () => b.agent.patch(`/api/goals/${goal.id}`).send({ done: true }),
      () => b.agent.delete(`/api/goals/${goal.id}`),
      () => b.agent.post('/api/goals').send({ subjectId: subject.id, goalDate: '2026-10-23', description: 'Roubo' }),
      () => b.agent.post('/api/study-sessions').send({ subjectId: subject.id, startedAt: '2026-10-23T10:00:00.000Z', day: '2026-10-23', minutes: 30 }),
      () => b.agent.post('/api/chats').send({ subjectId: subject.id }),
      () => b.agent.get(`/api/chats/${thread.id}/messages`),
      () => b.agent.delete(`/api/chats/${thread.id}`),
      () => b.agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'oi' }),
    ];
    for (const check of checks) expect((await check()).status).toBe(404);

    expect((await b.agent.get('/api/subjects')).body.items).toEqual([]);
    expect((await b.agent.get('/api/goals?date=2026-10-23')).body.items).toEqual([]);
    expect((await b.agent.get('/api/chats')).body.items).toEqual([]);
    // Nada foi alterado para o dono.
    expect((await a.agent.get(`/api/subjects/${subject.id}`)).body.name).toBe('Física');
    expect((await a.agent.get(`/api/subjects/${subject.id}/topics`)).body.items[0].status).toBe('pendente');
  });

  it('ids malformados = 404', async () => {
    const { agent } = await signup(t.app);
    expect((await agent.get('/api/subjects/abc')).status).toBe(404);
    expect((await agent.get('/api/subjects/0')).status).toBe(404);
    expect((await agent.get('/api/subjects/99999999999999999999')).status).toBe(404);
  });
});

describe('tópicos e progresso', () => {
  it('cria no fim, atualiza status com done_at coerente e reflete no progresso da disciplina', async () => {
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'IA', color: blue })).body;
    const t1 = (await agent.post(`/api/subjects/${s.id}/topics`).send({ title: 'Busca', dueDate: '2026-11-01' })).body;
    const t2 = (await agent.post(`/api/subjects/${s.id}/topics`).send({ title: 'Lógica', notes: 'cap. 7' })).body;
    expect([t1.position, t2.position]).toEqual([0, 1]);
    expect(t1).toMatchObject({ status: 'pendente', dueDate: '2026-11-01', doneAt: null });
    expect(t2.notes).toBe('cap. 7');

    const done = await agent.patch(`/api/topics/${t1.id}`).send({ status: 'concluido' });
    expect(done.body).toMatchObject({ status: 'concluido', doneAt: '2026-10-23T15:00:00.000Z' });
    t.clock.advance(DAY);
    expect((await agent.patch(`/api/topics/${t1.id}`).send({ title: 'Busca A*' })).body.doneAt).toBe('2026-10-23T15:00:00.000Z'); // não muda
    let subject = (await agent.get(`/api/subjects/${s.id}`)).body;
    expect(subject).toMatchObject({ topicCount: 2, doneCount: 1 });

    const reopened = await agent.patch(`/api/topics/${t1.id}`).send({ status: 'estudando', dueDate: null });
    expect(reopened.body).toMatchObject({ status: 'estudando', doneAt: null, dueDate: null });
    subject = (await agent.get(`/api/subjects/${s.id}`)).body;
    expect(subject.doneCount).toBe(0);

    expect((await agent.get(`/api/subjects/${s.id}/topics`)).body.items.map((x: any) => x.title)).toEqual(['Busca A*', 'Lógica']);
    expect((await agent.delete(`/api/topics/${t2.id}`)).status).toBe(204);
    expect((await agent.get(`/api/subjects/${s.id}`)).body.topicCount).toBe(1);
  });

  it('valida título, status e prazo', async () => {
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'IA', color: blue })).body;
    expect((await agent.post(`/api/subjects/${s.id}/topics`).send({ title: '' })).status).toBe(422);
    expect((await agent.post(`/api/subjects/${s.id}/topics`).send({ title: 'x', dueDate: '2026-02-30' })).status).toBe(422);
    const tp = (await agent.post(`/api/subjects/${s.id}/topics`).send({ title: 'x' })).body;
    expect((await agent.patch(`/api/topics/${tp.id}`).send({ status: 'feito' })).status).toBe(422);
  });
});

describe('metas diárias', () => {
  it('checklist do dia: cria, marca/desmarca, filtra por data, exige data na consulta', async () => {
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'Móvel', color: '#D97706' })).body;
    const g = (await agent.post('/api/goals').send({ subjectId: s.id, goalDate: '2026-10-23', description: 'Estudar requisitos', targetMinutes: 45 })).body;
    await agent.post('/api/goals').send({ subjectId: s.id, goalDate: '2026-10-24', description: 'Outro dia' });
    expect(g).toMatchObject({ subjectName: 'Móvel', subjectColor: '#D97706', targetMinutes: 45, done: false, doneAt: null });

    expect((await agent.get('/api/goals?date=2026-10-23')).body.items).toHaveLength(1);
    const checked = await agent.patch(`/api/goals/${g.id}`).send({ done: true });
    expect(checked.body).toMatchObject({ done: true, doneAt: '2026-10-23T15:00:00.000Z' });
    expect((await agent.patch(`/api/goals/${g.id}`).send({ done: false })).body).toMatchObject({ done: false, doneAt: null });
    expect((await agent.get('/api/goals')).status).toBe(422);
    expect((await agent.get('/api/goals?date=hoje')).status).toBe(422);
    expect((await agent.post('/api/goals').send({ subjectId: s.id, goalDate: '2026-10-23', description: '' })).status).toBe(422);
    expect((await agent.delete(`/api/goals/${g.id}`)).status).toBe(204);
    expect((await agent.get('/api/goals?date=2026-10-23')).body.items).toEqual([]);
  });
});

describe('estatísticas da semana', () => {
  it('byDay tem 7 itens seg→dom, soma por disciplina, metas de hoje e disciplinas concluídas', async () => {
    const { agent } = await signup(t.app);
    await agent.patch('/api/me').send({ weeklyGoalMinutes: 1200 });
    const mov = (await agent.post('/api/subjects').send({ name: 'Móvel', color: '#2563EB' })).body;
    const ia = (await agent.post('/api/subjects').send({ name: 'IA', color: '#D97706' })).body;
    const bd = (await agent.post('/api/subjects').send({ name: 'BD', color: '#059669' })).body; // sem tópicos: não conta
    // Móvel: todos concluídos; IA: um pendente
    for (const [sid, statuses] of [[mov.id, ['concluido', 'concluido']], [ia.id, ['concluido', 'pendente']]] as const) {
      for (const [i, status] of statuses.entries()) {
        const tp = (await agent.post(`/api/subjects/${sid}/topics`).send({ title: `T${i}` })).body;
        await agent.patch(`/api/topics/${tp.id}`).send({ status });
      }
    }
    const study = (subjectId: number, day: string, minutes: number) =>
      agent.post('/api/study-sessions').send({ subjectId, startedAt: `${day}T20:00:00.000Z`, day, minutes });
    // 2026-10-23 é sexta; a semana começa na segunda 2026-10-19.
    await study(mov.id, '2026-10-19', 90);
    await study(ia.id, '2026-10-19', 60);
    await study(mov.id, '2026-10-21', 120);
    await study(ia.id, '2026-10-23', 30);
    await study(bd.id, '2026-10-12', 200); // semana anterior: fora
    const g = (await agent.post('/api/goals').send({ subjectId: ia.id, goalDate: '2026-10-23', description: 'A' })).body;
    await agent.post('/api/goals').send({ subjectId: ia.id, goalDate: '2026-10-23', description: 'B' });
    await agent.patch(`/api/goals/${g.id}`).send({ done: true });

    const res = await agent.get('/api/stats/week?weekStart=2026-10-19&today=2026-10-23');
    expect(res.status).toBe(200);
    const w = res.body;
    expect(w.weekStart).toBe('2026-10-19');
    expect(w.byDay.map((d: any) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(w.byDay.map((d: any) => d.minutes)).toEqual([150, 0, 120, 0, 30, 0, 0]);
    expect(w.totalMinutes).toBe(300);
    expect(w.weeklyGoalMinutes).toBe(1200);
    expect(w.bySubject).toEqual([
      { subjectId: mov.id, name: 'Móvel', color: '#2563EB', minutes: 210 },
      { subjectId: ia.id, name: 'IA', color: '#D97706', minutes: 90 },
    ]);
    expect(w).toMatchObject({ goalsToday: 2, goalsTodayDone: 1, subjectsTotal: 3, subjectsCompleted: 1 });
  });

  it('weekStart qualquer vira a segunda da semana; sem parâmetros usa a data do servidor', async () => {
    const { agent } = await signup(t.app);
    const mid = await agent.get('/api/stats/week?weekStart=2026-10-22&today=2026-10-22'); // quinta
    expect(mid.body.weekStart).toBe('2026-10-19');
    const def = await agent.get('/api/stats/week'); // relógio falso: 2026-10-23
    expect(def.body.weekStart).toBe('2026-10-19');
    const sunday = await agent.get('/api/stats/week?weekStart=2026-10-25');
    expect(sunday.body.weekStart).toBe('2026-10-19');
    expect(def.body.byDay).toHaveLength(7);
  });

  it('sessão de estudo valida minutos e dia', async () => {
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'IA', color: blue })).body;
    const base = { subjectId: s.id, startedAt: '2026-10-23T10:00:00.000Z', day: '2026-10-23' };
    expect((await agent.post('/api/study-sessions').send({ ...base, minutes: 0 })).status).toBe(422);
    expect((await agent.post('/api/study-sessions').send({ ...base, minutes: 800 })).status).toBe(422);
    expect((await agent.post('/api/study-sessions').send({ ...base, day: '2026-02-31', minutes: 25 })).status).toBe(422);
    const ok = await agent.post('/api/study-sessions').send({ ...base, minutes: 25 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ subjectId: s.id, minutes: 25, day: '2026-10-23' });
  });
});

describe('config e saúde', () => {
  it('GET /api/config devolve o AppConfig', async () => {
    const res = await request(t.app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ appName: 'EduMind', aiMode: 'demo', googleEnabled: false, scraperSource: 'mock' });
    expect((await request(t.app).get('/api/health')).body).toEqual({ ok: true });
  });
});
