import { describe, expect, it } from 'vitest';
import { changesSchema, type ScrapeResult } from '@edumind/contracts';
import { importScrape } from '../src/modules/sync/import';
import { makeApp, sampleScrape, signup, T0, type TestApp } from './helpers';

type Agent = Awaited<ReturnType<typeof signup>>['agent'];

/** App cujo scraper devolve `current.value` (mude entre as sincronizações). */
function appWith() {
  const current = { value: sampleScrape() as ScrapeResult };
  const t = makeApp({ scrape: async () => structuredClone(current.value) });
  return { t, current };
}
const sync = async (t: TestApp, agent: Agent) => {
  expect((await agent.post('/api/sync')).status).toBe(202);
  await t.services.waitForSyncs();
  return (await agent.get('/api/sync')).body.last;
};
const changes = async (agent: Agent) => (await agent.get('/api/changes')).body as { items: any[]; unseen: number };
const kinds = (items: any[]) => items.map((c) => c.kind).sort();

describe('novidades do sync', () => {
  it('a primeira sincronização é só a linha de base: nenhuma novidade', async () => {
    const { t } = appWith();
    const { agent } = await signup(t.app);
    const last = await sync(t, agent);
    expect(last.stats).toMatchObject({ created: 6, changes: 0 });
    expect(await changes(agent)).toEqual({ items: [], unseen: 0 });
  });

  it('detecta aula remarcada, sala trocada, aula nova, prazo, nota, trabalho novo e disciplina nova', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);

    const next = sampleScrape();
    const [dm, ia] = next.courses as [ScrapeResult['courses'][number], ScrapeResult['courses'][number]];
    dm.lessons[0] = { ...dm.lessons[0]!, date: '2026-10-24', start: '18:00', end: '19:30' }; // remarcada
    dm.lessons[1] = { ...dm.lessons[1]!, room: 'Lab 2' }; // sala (null → Lab 2)
    dm.lessons.push({ externalId: 'c1-l3', date: '2026-11-06', start: '19:00', end: '20:30', topic: 'Navegação', room: null });
    dm.assignments[0] = { ...dm.assignments[0]!, dueDate: '2026-10-30', status: 'corrigido', grade: 8.5 }; // prazo + nota
    dm.assignments.push({ externalId: 'c1-a2', title: 'Lista 2', description: null, dueDate: '2026-11-10', status: 'pendente', grade: null });
    ia.lessons[0] = { ...ia.lessons[0]!, topic: 'Busca A* (revisão)' }; // só o tópico mudou: não é novidade
    next.courses.push({
      externalId: 'c3', name: 'Redes de Computadores', professor: null, room: null,
      lessons: Array.from({ length: 5 }, (_, i) => ({ externalId: `c3-l${i}`, date: `2026-11-0${i + 1}`, start: '19:00', end: '20:30', topic: null, room: null })),
      assignments: [{ externalId: 'c3-a1', title: 'Trabalho de Redes', description: null, dueDate: '2026-11-20', status: 'pendente', grade: null }],
    });
    current.value = next;

    const last = await sync(t, agent);
    expect(last.stats).toMatchObject({ changes: 7 });

    const { items, unseen } = await changes(agent);
    expect(unseen).toBe(7);
    expect(kinds(items)).toEqual(
      ['assignment_due_changed', 'assignment_new', 'grade_posted', 'lesson_new', 'lesson_rescheduled', 'lesson_room_changed', 'subject_new'].sort(),
    );
    // disciplina nova = 1 aviso; suas 5 aulas e 1 trabalho não viram avisos soltos
    expect(items.filter((c) => c.subjectName === 'Redes de Computadores').map((c) => c.kind)).toEqual(['subject_new']);
    // mais recentes primeiro
    const ids = items.map((c) => c.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));

    const by = (kind: string) => items.find((c) => c.kind === kind);
    expect(by('lesson_rescheduled')).toMatchObject({ title: 'Dicas de telas', oldValue: '2026-10-23 19:00–20:30', newValue: '2026-10-24 18:00–19:30', subjectName: 'Desenvolvimento Móvel', seen: false });
    expect(by('lesson_room_changed')).toMatchObject({ title: 'Desenvolvimento Móvel', oldValue: '—', newValue: 'Lab 2' });
    expect(by('lesson_new')).toMatchObject({ title: 'Navegação', newValue: '2026-11-06 19:00–20:30' });
    expect(by('assignment_due_changed')).toMatchObject({ title: 'Projeto G2', oldValue: '2026-10-23', newValue: '2026-10-30' });
    expect(by('grade_posted')).toMatchObject({ title: 'Projeto G2', newValue: '8.5' });
    expect(by('assignment_new')).toMatchObject({ title: 'Lista 2', newValue: '2026-11-10' });
    // "corrigido" junto com a nota não duplica o aviso
    expect(kinds(items)).not.toContain('assignment_status_changed');
  });

  it('rodar de novo com os mesmos dados não gera novidades (idempotente)', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);
    current.value = sampleScrape();
    current.value.courses[0]!.assignments[0]!.dueDate = '2026-10-31';
    await sync(t, agent);
    expect((await changes(agent)).items).toHaveLength(1);
    const again = await sync(t, agent);
    expect(again.stats).toMatchObject({ created: 0, updated: 0, changes: 0 });
    expect((await changes(agent)).items).toHaveLength(1);
  });

  it('nota alterada, situação alterada e entrega registrada', async () => {
    const { t, current } = appWith();
    current.value.courses[0]!.assignments[0] = { externalId: 'c1-a1', title: 'Projeto G2', description: null, dueDate: '2026-10-23', status: 'entregue', grade: null };
    const { agent } = await signup(t.app);
    await sync(t, agent);

    const edit = (patch: Partial<ScrapeResult['courses'][number]['assignments'][number]>) => {
      current.value = structuredClone(current.value);
      Object.assign(current.value.courses[0]!.assignments[0]!, patch);
    };
    edit({ status: 'corrigido', grade: 7 });
    await sync(t, agent);
    edit({ grade: 8 });
    await sync(t, agent);
    edit({ status: 'pendente', grade: 8 }); // situação voltou, nota igual
    await sync(t, agent);

    const { items } = await changes(agent);
    expect(items.map((c) => [c.kind, c.oldValue, c.newValue])).toEqual([
      ['assignment_status_changed', 'corrigido', 'pendente'],
      ['grade_changed', '7', '8'],
      ['grade_posted', null, '7'],
    ]);
  });

  it('muitas aulas novas numa disciplina viram um aviso só', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);
    current.value = sampleScrape();
    current.value.courses[1]!.lessons.push(
      ...Array.from({ length: 4 }, (_, i) => ({ externalId: `c2-n${i}`, date: `2026-11-1${i}`, start: '19:00', end: '20:30', topic: null, room: null })),
    );
    await sync(t, agent);
    const { items } = await changes(agent);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'lessons_added', title: 'Inteligência Artificial', newValue: '4' });
  });

  it('até 3 aulas novas continuam individuais', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);
    current.value = sampleScrape();
    current.value.courses[1]!.lessons.push(
      ...Array.from({ length: 3 }, (_, i) => ({ externalId: `c2-n${i}`, date: `2026-11-1${i}`, start: '19:00', end: '20:30', topic: `Tema ${i}`, room: null })),
    );
    await sync(t, agent);
    expect(kinds((await changes(agent)).items)).toEqual(['lesson_new', 'lesson_new', 'lesson_new']);
  });

  it('um sync que falhou não conta como linha de base', async () => {
    let fail = true;
    const result = { value: sampleScrape() };
    const t = makeApp({ scrape: async () => { if (fail) throw new Error('portal fora do ar'); return structuredClone(result.value); } });
    const { agent } = await signup(t.app);
    expect((await sync(t, agent)).status).toBe('error');
    fail = false;
    const ok = await sync(t, agent);
    expect(ok.stats).toMatchObject({ created: 6, changes: 0 }); // 1º sucesso = linha de base
    expect((await changes(agent)).items).toEqual([]);
  });

  it('marcar como vistas zera o contador e só as novas voltam a contar', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);
    current.value = sampleScrape();
    current.value.courses[0]!.assignments[0]!.dueDate = '2026-10-31';
    await sync(t, agent);
    expect((await changes(agent)).unseen).toBe(1);

    t.clock.advance(60_000);
    expect((await agent.post('/api/changes/seen')).status).toBe(204);
    const afterSeen = await changes(agent);
    expect(afterSeen.unseen).toBe(0);
    expect(afterSeen.items[0]).toMatchObject({ seen: true });

    current.value = structuredClone(current.value);
    current.value.courses[0]!.assignments[0]!.dueDate = '2026-11-02';
    await sync(t, agent);
    const again = await changes(agent);
    expect(again.unseen).toBe(1);
    expect(again.items.map((c) => c.seen)).toEqual([false, true]);
  });

  it('cada aluno vê só as próprias novidades; exige login', async () => {
    const { t, current } = appWith();
    const a = await signup(t.app);
    const b = await signup(t.app);
    await sync(t, a.agent);
    current.value = sampleScrape();
    current.value.courses[0]!.assignments[0]!.dueDate = '2026-10-31';
    await sync(t, a.agent);
    expect((await changes(a.agent)).items).toHaveLength(1);
    expect(await changes(b.agent)).toEqual({ items: [], unseen: 0 });
    await b.agent.post('/api/changes/seen'); // não mexe nas do A
    expect((await changes(a.agent)).unseen).toBe(1);

    const anon = await import('supertest').then((m) => m.default(t.app));
    expect((await anon.get('/api/changes')).status).toBe(401);
    expect((await anon.post('/api/changes/seen')).status).toBe(401);
  });

  it('excluir a disciplina apaga as novidades dela', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);
    current.value = sampleScrape();
    current.value.courses[0]!.assignments[0]!.dueDate = '2026-10-31';
    await sync(t, agent);
    const subjectId = (await changes(agent)).items[0].subjectId;
    await agent.delete(`/api/subjects/${subjectId}`);
    expect(await changes(agent)).toEqual({ items: [], unseen: 0 });
  });

  it('respeita o contrato e o parâmetro limit', async () => {
    const { t, current } = appWith();
    const { agent } = await signup(t.app);
    await sync(t, agent);
    current.value = sampleScrape();
    current.value.courses[0]!.assignments[0]!.dueDate = '2026-10-31';
    current.value.courses[0]!.assignments[0]!.status = 'entregue';
    await sync(t, agent);
    const res = await agent.get('/api/changes');
    expect(changesSchema.parse(res.body).items).toHaveLength(2);
    const limited = (await agent.get('/api/changes?limit=1')).body;
    expect(limited.items).toHaveLength(1);
    expect(limited.unseen).toBe(2); // o contador considera todas, não só a página
  });
});

describe('importScrape direto', () => {
  it('`baseline` explícito liga e desliga o registro de novidades', async () => {
    const t = makeApp();
    const { user } = await signup(t.app);
    importScrape(t.db, user.id, sampleScrape(), T0, { baseline: true });
    const changed = sampleScrape();
    changed.courses[0]!.assignments[0]!.dueDate = '2026-11-01';
    expect(importScrape(t.db, user.id, changed, T0, { baseline: true }).changes).toBe(0);
    changed.courses[0]!.assignments[0]!.dueDate = '2026-11-02';
    expect(importScrape(t.db, user.id, changed, T0, { baseline: false }).changes).toBe(1);
  });
});
