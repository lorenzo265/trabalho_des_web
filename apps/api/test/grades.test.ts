import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assignmentSchema, gradeProjectionSchema, subjectSchema, type ScrapeResult } from '@edumind/contracts';
import { computeProjection, type GradeInput } from '../src/modules/grades/calc';
import { makeApp, sampleScrape, signup } from './helpers';

const item = (id: number, grade: number | null, weight = 1, over: Partial<GradeInput> = {}): GradeInput => ({
  id, title: `T${id}`, dueDate: `2026-11-${String(10 + id).padStart(2, '0')}`, status: grade === null ? 'pendente' : 'corrigido', grade, weight, ...over,
});

describe('computeProjection (puro)', () => {
  it('sem trabalhos: sem dados', () => {
    expect(computeProjection(1, 7, [])).toMatchObject({
      status: 'no_data', average: null, needed: null, worstCase: null, bestCase: null, totalWeight: 0, items: [],
    });
  });

  it('nada lançado ainda: precisa tirar a própria meta nos restantes', () => {
    const p = computeProjection(1, 7, [item(1, null), item(2, null), item(3, null)]);
    expect(p).toMatchObject({ status: 'possible', average: null, needed: 7, worstCase: 0, bestCase: 10, gradedCount: 0, remainingCount: 3 });
  });

  it('manter o ritmo basta (precisa de menos que a média atual)', () => {
    const p = computeProjection(1, 7, [item(1, 8), item(2, 6), item(3, null, 2)]);
    // pontos 14, peso total 4, restante 2 → (28 − 14) ÷ 2 = 7 e a média atual também é 7
    expect(p).toMatchObject({ average: 7, needed: 7, status: 'on_track', worstCase: 3.5, bestCase: 8.5 });
  });

  it('precisa melhorar o ritmo, mas é possível', () => {
    const p = computeProjection(1, 7, [item(1, 5), item(2, 5), item(3, null), item(4, null)]);
    expect(p).toMatchObject({ average: 5, needed: 9, status: 'possible' });
  });

  it('meta fora de alcance: mostra o quanto precisaria (acima de 10) e o melhor caso', () => {
    const p = computeProjection(1, 7, [item(1, 2), item(2, 2), item(3, null)]);
    expect(p).toMatchObject({ needed: 17, status: 'impossible', bestCase: 4.67, worstCase: 1.33 });
  });

  it('meta já garantida: mesmo zerando os restantes a média fecha na meta', () => {
    const p = computeProjection(1, 6, [item(1, 10), item(2, 10), item(3, null)]);
    expect(p).toMatchObject({ status: 'achieved', needed: 0, worstCase: 6.67 });
  });

  it('exatamente na fronteira da meta conta como garantida (needed = 0)', () => {
    const p = computeProjection(1, 6, [item(1, 9), item(2, 9), item(3, null)]); // pontos 18 = 6 × 3
    expect(p.status).toBe('achieved');
    expect(p.needed).toBe(0);
  });

  it('tudo lançado: aprovado na fronteira (média = meta) e reprovado abaixo', () => {
    expect(computeProjection(1, 7, [item(1, 8), item(2, 6)])).toMatchObject({ status: 'final_ok', average: 7, needed: null, remainingCount: 0 });
    expect(computeProjection(1, 7, [item(1, 7), item(2, 6.98)])).toMatchObject({ status: 'final_fail', average: 6.99 });
  });

  it('ponto flutuante não vira reprovação: pesos 0,1 e 0,2 com nota 7 dão média 7', () => {
    const p = computeProjection(1, 7, [item(1, 7, 0.1), item(2, 7, 0.2)]);
    expect(p.status).toBe('final_ok');
    expect(p.average).toBe(7);
  });

  it('pesos diferentes mudam a média e a projeção', () => {
    const p = computeProjection(1, 7, [item(1, 10, 3), item(2, 4, 1), item(3, null, 2)]);
    // média = (30 + 4) ÷ 4 = 8,5 · precisa (7 × 6 − 34) ÷ 2 = 4
    expect(p).toMatchObject({ average: 8.5, needed: 4, status: 'on_track', totalWeight: 6, gradedWeight: 4, remainingWeight: 2 });
  });

  it('entregue sem nota ainda conta como restante', () => {
    const p = computeProjection(1, 7, [item(1, 8), item(2, null, 1, { status: 'entregue' })]);
    expect(p.remainingCount).toBe(1);
    expect(p.needed).toBe(6);
  });

  it('nota zero é nota (não é "sem nota")', () => {
    const p = computeProjection(1, 7, [item(1, 0), item(2, null)]);
    expect(p).toMatchObject({ gradedCount: 1, average: 0, needed: 14, status: 'impossible' });
  });

  it('lista os trabalhos por prazo e informa o peso de cada um em %', () => {
    const p = computeProjection(1, 7, [item(3, null, 2), item(1, 8, 1), item(2, 6, 1)]);
    expect(p.items.map((i) => [i.id, i.share])).toEqual([[1, 25], [2, 25], [3, 50]]);
    expect(p.items.reduce((s, i) => s + i.share, 0)).toBe(100);
  });

  it('arredonda para 2 casas sem ruído', () => {
    const p = computeProjection(1, 7, [item(1, 8.333), item(2, null, 3)]);
    expect(p.average).toBe(8.33);
    expect(Number.isInteger(p.needed! * 100)).toBe(true);
  });
});

async function withSync(result?: ScrapeResult) {
  const current = { value: result ?? sampleScrape() };
  const t = makeApp({ scrape: async () => structuredClone(current.value) });
  const user = await signup(t.app);
  const sync = async () => {
    await user.agent.post('/api/sync');
    await t.services.waitForSyncs();
  };
  await sync();
  const subjects = (await user.agent.get('/api/subjects')).body.items as { id: number; name: string }[];
  const dm = subjects.find((s) => s.name === 'Desenvolvimento Móvel')!;
  const assignment = (await user.agent.get('/api/assignments')).body.items[0] as { id: number };
  return { t, current, sync, dm, assignment, ...user };
}

describe('GET /subjects/:id/grades', () => {
  it('devolve a projeção no contrato, com meta e pesos padrão', async () => {
    const { agent, dm } = await withSync();
    const res = await agent.get(`/api/subjects/${dm.id}/grades`);
    expect(res.status).toBe(200);
    const p = gradeProjectionSchema.parse(res.body);
    expect(p).toMatchObject({ subjectId: dm.id, target: 7, average: null, needed: 7, status: 'possible', remainingCount: 1 });
    expect(p.items[0]).toMatchObject({ title: 'Projeto G2', weight: 1, share: 100, grade: null });
  });

  it('disciplina sem trabalhos: sem dados', async () => {
    const t = makeApp();
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'Física', color: '#2563EB' })).body;
    expect((await agent.get(`/api/subjects/${s.id}/grades`)).body).toMatchObject({ status: 'no_data', items: [] });
  });

  it('reflete a nota lançada pelo sync', async () => {
    const { agent, dm, current, sync } = await withSync();
    current.value = sampleScrape();
    current.value.courses[0]!.assignments[0] = { ...current.value.courses[0]!.assignments[0]!, status: 'corrigido', grade: 9 };
    await sync();
    expect((await agent.get(`/api/subjects/${dm.id}/grades`)).body).toMatchObject({ average: 9, status: 'final_ok', needed: null });
  });

  it('exige login e não enxerga disciplina de outro aluno nem inexistente', async () => {
    const { t, dm } = await withSync();
    expect((await request(t.app).get(`/api/subjects/${dm.id}/grades`)).status).toBe(401);
    const other = await signup(t.app);
    expect((await other.agent.get(`/api/subjects/${dm.id}/grades`)).status).toBe(404);
    expect((await other.agent.get('/api/subjects/99999/grades')).status).toBe(404);
  });
});

describe('PATCH /assignments/:id (peso)', () => {
  it('altera só o peso e devolve o trabalho no contrato', async () => {
    const { agent, assignment } = await withSync();
    const res = await agent.patch(`/api/assignments/${assignment.id}`).send({ weight: 2.5 });
    expect(res.status).toBe(200);
    expect(assignmentSchema.parse(res.body)).toMatchObject({ id: assignment.id, weight: 2.5, title: 'Projeto G2', status: 'pendente', grade: null });
    expect((await agent.get('/api/assignments')).body.items[0].weight).toBe(2.5);
  });

  it('o peso (e a meta) sobrevivem ao sync, que atualiza o resto', async () => {
    const { agent, assignment, dm, current, sync } = await withSync();
    await agent.patch(`/api/assignments/${assignment.id}`).send({ weight: 3 });
    await agent.patch(`/api/subjects/${dm.id}`).send({ targetAverage: 8 });
    current.value = sampleScrape();
    current.value.courses[0]!.name = 'Desenvolvimento Móvel'; // igual
    current.value.courses[0]!.assignments[0] = { ...current.value.courses[0]!.assignments[0]!, dueDate: '2026-11-20', title: 'Projeto G2 (revisado)' };
    await sync();
    const after = (await agent.get('/api/assignments')).body.items[0];
    expect(after).toMatchObject({ title: 'Projeto G2 (revisado)', dueDate: '2026-11-20', weight: 3 });
    expect((await agent.get(`/api/subjects/${dm.id}`)).body.targetAverage).toBe(8);
  });

  it.each([[0], [-1], [100.5], ['2'], [null], [undefined]])('rejeita peso inválido (%s)', async (weight) => {
    const { agent, assignment } = await withSync();
    const res = await agent.patch(`/api/assignments/${assignment.id}`).send(weight === undefined ? {} : { weight });
    expect(res.status).toBe(422);
    expect((await agent.get('/api/assignments')).body.items[0].weight).toBe(1); // nada mudou
  });

  it('não mexe em trabalho de outro aluno (404) e id inválido é 404', async () => {
    const { t, assignment } = await withSync();
    const other = await signup(t.app);
    expect((await other.agent.patch(`/api/assignments/${assignment.id}`).send({ weight: 5 })).status).toBe(404);
    expect((await other.agent.patch('/api/assignments/abc').send({ weight: 5 })).status).toBe(404);
    expect((await request(t.app).patch(`/api/assignments/${assignment.id}`).send({ weight: 5 })).status).toBe(401);
  });

  it('não aceita alterar nota, prazo ou situação (somente leitura): campos extras são ignorados', async () => {
    const { agent, assignment } = await withSync();
    await agent.patch(`/api/assignments/${assignment.id}`).send({ weight: 2, grade: 10, status: 'corrigido', dueDate: '2030-01-01' });
    expect((await agent.get('/api/assignments')).body.items[0]).toMatchObject({ weight: 2, grade: null, status: 'pendente', dueDate: '2026-10-23' });
  });

  it('o peso muda a projeção', async () => {
    const r = sampleScrape();
    r.courses[0]!.assignments = [
      { externalId: 'a1', title: 'Prova', description: null, dueDate: '2026-10-20', status: 'corrigido', grade: 10 },
      { externalId: 'a2', title: 'Trabalho', description: null, dueDate: '2026-10-30', status: 'pendente', grade: null },
    ];
    const { agent, dm } = await withSync(r);
    const ids = Object.fromEntries(((await agent.get('/api/assignments')).body.items as { id: number; title: string }[]).map((a) => [a.title, a.id]));
    await agent.patch(`/api/assignments/${ids.Prova}`).send({ weight: 3 });
    const p = (await agent.get(`/api/subjects/${dm.id}/grades`)).body;
    // média 10; precisa (7 × 4 − 30) ÷ 1 = −2 → já garantido
    expect(p).toMatchObject({ average: 10, totalWeight: 4, needed: 0, status: 'achieved' });
  });
});

describe('PATCH /subjects/:id (meta)', () => {
  it('novas disciplinas começam com meta 7; a meta muda a projeção e não é apagada por outros campos', async () => {
    const t = makeApp();
    const { agent } = await signup(t.app);
    const s = subjectSchema.parse((await agent.post('/api/subjects').send({ name: 'Física', color: '#2563EB' })).body);
    expect(s.targetAverage).toBe(7);
    const patched = subjectSchema.parse((await agent.patch(`/api/subjects/${s.id}`).send({ targetAverage: 8.5 })).body);
    expect(patched.targetAverage).toBe(8.5);
    expect((await agent.patch(`/api/subjects/${s.id}`).send({ name: 'Física I' })).body.targetAverage).toBe(8.5);
    expect((await agent.get(`/api/subjects/${s.id}/grades`)).body.target).toBe(8.5);
  });

  it.each([[-0.1], [10.1], ['7'], [null]])('rejeita meta inválida (%s)', async (targetAverage) => {
    const t = makeApp();
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'Física', color: '#2563EB' })).body;
    expect((await agent.patch(`/api/subjects/${s.id}`).send({ targetAverage })).status).toBe(422);
    expect((await agent.get(`/api/subjects/${s.id}`)).body.targetAverage).toBe(7);
  });

  it('aceita os limites 0 e 10', async () => {
    const t = makeApp();
    const { agent } = await signup(t.app);
    const s = (await agent.post('/api/subjects').send({ name: 'Física', color: '#2563EB' })).body;
    expect((await agent.patch(`/api/subjects/${s.id}`).send({ targetAverage: 0 })).body.targetAverage).toBe(0);
    expect((await agent.patch(`/api/subjects/${s.id}`).send({ targetAverage: 10 })).body.targetAverage).toBe(10);
  });
});

describe('migração 003 em banco já existente', () => {
  it('adiciona as colunas com os padrões sem perder dados', async () => {
    const { openDb, migrate } = await import('../src/db/db');
    const Database = (await import('better-sqlite3')).default;
    const { readFileSync } = await import('node:fs');
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    // Estado "antigo": só a migração 1, com dados.
    db.exec(readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8'));
    db.pragma('user_version = 1');
    db.exec(`insert into users (email, name, password_hash, created_at) values ('a@b.c', 'A', 'x', '2026-01-01T00:00:00Z');
      insert into subjects (user_id, name, color, created_at) values (1, 'Velha', '#2563EB', '2026-01-01T00:00:00Z');
      insert into assignments (user_id, subject_id, external_id, title, due_date, updated_at) values (1, 1, 'e1', 'Antigo', '2026-02-02', 'x');`);
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(db.prepare('select target_average t from subjects').get()).toEqual({ t: 7 });
    expect(db.prepare('select weight w, title from assignments').get()).toEqual({ w: 1, title: 'Antigo' });
    expect(() => db.exec("update assignments set weight = 0")).toThrow(); // check constraint
    expect(() => db.exec("update subjects set target_average = 11")).toThrow();
    expect(openDb).toBeTypeOf('function');
  });
});
