import { beforeEach, describe, expect, it } from 'vitest';
import { DAY } from '../src/clock';
import type { ScrapeResult } from '@edumind/contracts';
import { makeApp, sampleScrape, signup, T0, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = makeApp();
});

const count = (t: TestApp, table: string) => (t.db.prepare(`select count(*) c from ${table}`).get() as any).c as number;

describe('sincronização', () => {
  it('POST /sync responde 202 e importa disciplinas, aulas e trabalhos em segundo plano', async () => {
    const { agent } = await signup(t.app);
    expect((await agent.get('/api/sync')).body).toEqual({ source: 'mock', current: null, last: null });

    const started = await agent.post('/api/sync');
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ source: 'mock', status: 'running', finishedAt: null, stats: null, error: null });
    await t.services.waitForSyncs();

    const status = (await agent.get('/api/sync')).body;
    expect(status.current).toBeNull();
    expect(status.last).toMatchObject({
      id: started.body.id, status: 'ok', error: null,
      stats: { subjects: 2, lessons: 3, assignments: 1, created: 6, updated: 0 }, // 2 disciplinas + 3 aulas + 1 trabalho
    });

    const subjects = (await agent.get('/api/subjects')).body.items;
    expect(subjects.map((s: any) => s.name)).toEqual(['Desenvolvimento Móvel', 'Inteligência Artificial']);
    expect(subjects[0]).toMatchObject({ professor: 'Prof. João', room: 'Sala 311 · Prédio 01', source: 'scraper', color: '#2563EB' });
    expect(subjects[1].color).toBe('#D97706'); // próxima cor da paleta

    const lessons = (await agent.get('/api/lessons')).body.items;
    expect(lessons.map((l: any) => [l.date, l.start, l.end, l.subjectName])).toEqual([
      ['2026-10-23', '19:00', '20:30', 'Desenvolvimento Móvel'],
      ['2026-10-27', '19:00', '20:30', 'Inteligência Artificial'],
      ['2026-10-30', '19:00', '20:30', 'Desenvolvimento Móvel'],
    ]);
    expect(lessons[0]).toMatchObject({ topic: 'Dicas de telas', room: 'Sala 311', subjectColor: '#2563EB' });
    const assignments = (await agent.get('/api/assignments')).body.items;
    expect(assignments).toEqual([
      expect.objectContaining({ title: 'Projeto G2', dueDate: '2026-10-23', status: 'pendente', grade: null, subjectName: 'Desenvolvimento Móvel' }),
    ]);
  });

  it('passa as credenciais do ambiente (nunca do cliente) ao scraper', async () => {
    const s = makeApp({ config: { portalUrl: 'http://portal.local:4010', portalUser: 'u@p.local', portalPassword: 'segredo-123', chromiumPath: '/x/chromium' } });
    const { agent } = await signup(s.app);
    await agent.post('/api/sync').send({ baseUrl: 'http://evil', username: 'x', password: 'y' });
    await s.services.waitForSyncs();
    expect(s.scrape).toHaveBeenCalledWith({
      source: 'mock', baseUrl: 'http://portal.local:4010', username: 'u@p.local', password: 'segredo-123', chromiumPath: '/x/chromium',
    });
  });

  it('é IDEMPOTENTE: rodar de novo não duplica nem conta mudanças', async () => {
    const { agent } = await signup(t.app);
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    const before = ['subjects', 'lessons', 'assignments'].map((x) => count(t, x));
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    expect(['subjects', 'lessons', 'assignments'].map((x) => count(t, x))).toEqual(before);
    expect((await agent.get('/api/sync')).body.last.stats).toMatchObject({ created: 0, updated: 0, lessons: 3 });
    expect(count(t, 'sync_runs')).toBe(2);
  });

  it('atualiza o que mudou na fonte (prazo, horário, professor) sem duplicar', async () => {
    let result: ScrapeResult = sampleScrape();
    const s = makeApp({ scrape: async () => result });
    const { agent } = await signup(s.app);
    await agent.post('/api/sync');
    await s.services.waitForSyncs();

    result = sampleScrape();
    result.courses[0]!.professor = 'Prof. João Silva';
    result.courses[0]!.lessons[0]!.start = '20:00';
    result.courses[0]!.assignments[0]!.dueDate = '2026-10-30';
    result.courses[0]!.assignments[0]!.status = 'entregue';
    result.courses[0]!.assignments[0]!.grade = 9.5;
    await agent.post('/api/sync');
    await s.services.waitForSyncs();

    expect((await agent.get('/api/sync')).body.last.stats).toMatchObject({ created: 0, updated: 3 });
    expect((await agent.get('/api/subjects')).body.items[0].professor).toBe('Prof. João Silva');
    expect((await agent.get('/api/lessons?from=2026-10-23&to=2026-10-23')).body.items[0].start).toBe('20:00');
    expect((await agent.get('/api/assignments')).body.items[0]).toMatchObject({ dueDate: '2026-10-30', status: 'entregue', grade: 9.5 });
    expect(count(t, 'lessons') + count(s, 'lessons')).toBe(3);
  });

  it('vincula a uma disciplina manual de mesmo nome (sem caixa) e já converge para os dados da faculdade', async () => {
    const { agent } = await signup(t.app);
    const manual = (await agent.post('/api/subjects').send({ name: 'desenvolvimento móvel', professor: 'Alguém', room: 'Sala X', color: '#DB2777' })).body;
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    const subjects = (await agent.get('/api/subjects')).body.items;
    expect(subjects).toHaveLength(2);
    const linked = subjects.find((s: any) => s.id === manual.id);
    expect(linked).toMatchObject({ color: '#DB2777', source: 'manual', professor: 'Prof. João', room: 'Sala 311 · Prédio 01' }); // a faculdade é a fonte da verdade
    expect(subjects.find((s: any) => s.id !== manual.id).source).toBe('scraper');
    // Já convergiu: o 2º sync não altera nada (nem a disciplina vinculada).
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    expect((await agent.get('/api/sync')).body.last.stats).toMatchObject({ created: 0, updated: 0 });
  });

  it('se a faculdade não informar professor/sala, mantém o último valor conhecido', async () => {
    let result: ScrapeResult = sampleScrape();
    const s = makeApp({ scrape: async () => result });
    const { agent } = await signup(s.app);
    await agent.post('/api/sync');
    await s.services.waitForSyncs();
    result = sampleScrape();
    result.courses[0]!.professor = null;
    result.courses[0]!.room = null;
    await agent.post('/api/sync');
    await s.services.waitForSyncs();
    expect((await agent.get('/api/subjects')).body.items[0]).toMatchObject({ professor: 'Prof. João', room: 'Sala 311 · Prédio 01' });
    expect((await agent.get('/api/sync')).body.last.stats).toMatchObject({ updated: 0 });
  });

  it('cada usuário importa para a própria conta', async () => {
    const a = await signup(t.app);
    const b = await signup(t.app);
    await a.agent.post('/api/sync');
    await t.services.waitForSyncs();
    expect((await a.agent.get('/api/lessons')).body.items).toHaveLength(3);
    expect((await b.agent.get('/api/lessons')).body.items).toEqual([]);
    expect((await b.agent.get('/api/sync')).body.last).toBeNull();
    await b.agent.post('/api/sync');
    await t.services.waitForSyncs();
    expect((await b.agent.get('/api/lessons')).body.items).toHaveLength(3);
  });

  it('409 enquanto já há uma sincronização rodando; libera depois', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = makeApp({ scrape: async () => (await gate, sampleScrape()) });
    const { agent } = await signup(s.app);
    expect((await agent.post('/api/sync')).status).toBe(202);
    const second = await agent.post('/api/sync');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('sync_running');
    expect((await agent.get('/api/sync')).body.current).toMatchObject({ status: 'running' });
    release();
    await s.services.waitForSyncs();
    expect((await agent.post('/api/sync')).status).toBe(202);
    await s.services.waitForSyncs();
  });

  it('falha do scraper vira erro amigável e não vaza a senha do portal', async () => {
    const s = makeApp({
      config: { portalPassword: 'segredo-123' },
      scrape: async () => { throw new Error('login recusado para segredo-123'); },
    });
    const { agent } = await signup(s.app);
    await agent.post('/api/sync');
    await s.services.waitForSyncs();
    const last = (await agent.get('/api/sync')).body.last;
    expect(last).toMatchObject({ status: 'error', stats: null });
    expect(last.error).toBe('Não foi possível sincronizar: login recusado para ***');
    expect(last.finishedAt).not.toBeNull();
    expect((await agent.post('/api/sync')).status).toBe(202); // pode tentar de novo
    await s.services.waitForSyncs();
  });

  it('dados em formato inesperado são rejeitados (nada é gravado)', async () => {
    const s = makeApp({ scrape: async () => ({ source: 'mock', fetchedAt: T0, courses: [{ externalId: '', name: 'X' }] }) as unknown as ScrapeResult });
    const { agent } = await signup(s.app);
    await agent.post('/api/sync');
    await s.services.waitForSyncs();
    expect((await agent.get('/api/sync')).body.last.error).toMatch(/formato inesperado/);
    expect(count(s, 'subjects')).toBe(0);
  });

  it('aulas: filtros por período e disciplina; exige login', async () => {
    const { agent } = await signup(t.app);
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    expect((await agent.get('/api/lessons?from=2026-10-24&to=2026-10-29')).body.items).toHaveLength(1);
    const ia = (await agent.get('/api/subjects')).body.items.find((s: any) => s.name === 'Inteligência Artificial');
    expect((await agent.get(`/api/lessons?subjectId=${ia.id}`)).body.items).toHaveLength(1);
    expect((await agent.get('/api/lessons?from=ontem')).status).toBe(422);
    const anon = await import('supertest').then((m) => m.default(t.app).get('/api/lessons'));
    expect(anon.status).toBe(401);
  });

  it('excluir a disciplina apaga as aulas e trabalhos dela', async () => {
    const { agent } = await signup(t.app);
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    const mov = (await agent.get('/api/subjects')).body.items.find((s: any) => s.name === 'Desenvolvimento Móvel');
    await agent.delete(`/api/subjects/${mov.id}`);
    expect(count(t, 'lessons')).toBe(1);
    expect(count(t, 'assignments')).toBe(0);
  });

  it('o sync real substitui os dados de demonstração do seed (external_id "seed:*")', async () => {
    const { agent, user } = await signup(t.app);
    const sid = (await agent.post('/api/subjects').send({ name: 'Banco de Dados', color: '#059669' })).body.id;
    t.db.prepare("insert into lessons (user_id, subject_id, external_id, date, start_time, end_time, updated_at) values (?, ?, 'seed:x', '2026-10-24', '19:00', '20:00', ?)").run(user.id, sid, T0);
    t.db.prepare("insert into assignments (user_id, subject_id, external_id, title, due_date, updated_at) values (?, ?, 'seed:y', 'Exemplo', '2026-10-25', ?)").run(user.id, sid, T0);
    await agent.post('/api/sync');
    await t.services.waitForSyncs();
    expect(t.db.prepare("select count(*) c from lessons where external_id like 'seed:%'").get()).toEqual({ c: 0 });
    expect(t.db.prepare("select count(*) c from assignments where external_id like 'seed:%'").get()).toEqual({ c: 0 });
  });

  it('syncs "running" órfãos (servidor reiniciado) são marcados como erro', async () => {
    const { recoverStaleSyncs } = await import('../src/modules/sync/import');
    const { user, agent } = await signup(t.app);
    t.db.prepare("insert into sync_runs (user_id, source, status, started_at) values (?, 'mock', 'running', ?)").run(user.id, T0);
    expect(recoverStaleSyncs(t.db, new Date(Date.parse(T0) + DAY).toISOString())).toBe(1);
    const last = (await agent.get('/api/sync')).body.last;
    expect(last).toMatchObject({ status: 'error', error: 'Interrompida porque o servidor foi reiniciado.' });
    expect((await agent.post('/api/sync')).status).toBe(202); // não ficou travado em 409
    await t.services.waitForSyncs();
  });
});
