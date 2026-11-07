import { changeKindSchema, type ChangeKind } from '@edumind/contracts';
import { CHANGE_TONE, describeChange } from './changes';

const d = (kind: ChangeKind, title: string, oldValue: string | null, newValue: string | null) =>
  describeChange({ kind, title, oldValue, newValue });

describe('describeChange', () => {
  it.each([
    [d('subject_new', 'Redes', null, null), 'Nova disciplina', 'Redes'],
    [d('assignment_new', 'Lista 2', null, '2026-11-10'), 'Novo trabalho', 'Lista 2 · prazo 10/11'],
    [d('assignment_due_changed', 'Projeto G2', '2026-10-23', '2026-10-30'), 'Prazo alterado', 'Projeto G2: 23/10 → 30/10'],
    [d('grade_posted', 'Projeto G2', null, '8.5'), 'Nota lançada', 'Projeto G2: 8,5'],
    [d('grade_changed', 'Projeto G2', '7', '8'), 'Nota alterada', 'Projeto G2: 7 → 8'],
    [d('assignment_status_changed', 'Lista 1', 'pendente', 'entregue'), 'Situação alterada', 'Lista 1: Pendente → Entregue'],
    [d('lesson_new', 'Navegação', null, '2026-11-06 19:00–20:30'), 'Aula nova', 'Navegação · 06/11 19:00–20:30'],
    [d('lessons_added', 'Inteligência Artificial', null, '12'), 'Aulas novas', '12 aulas adicionadas em Inteligência Artificial'],
    [d('lesson_rescheduled', 'Dicas de telas', '2026-10-23 19:00–20:30', '2026-10-24 18:00–19:30'), 'Aula remarcada', 'Dicas de telas: 23/10 19:00–20:30 → 24/10 18:00–19:30'],
    [d('lesson_room_changed', 'Banco de Dados', '—', 'Lab 2'), 'Sala alterada', 'Banco de Dados: — → Lab 2'],
  ])('%#', (text, label, detail) => {
    expect(text.label).toBe(label);
    expect(text.detail).toBe(detail);
  });

  it('todo tipo de novidade do contrato tem um tom definido (nenhum fica de fora)', () => {
    for (const kind of changeKindSchema.options) expect(CHANGE_TONE[kind], kind).toBeDefined();
  });

  it('valores ausentes ou fora do padrão não quebram', () => {
    expect(d('assignment_due_changed', 'X', null, 'amanhã').detail).toBe('X: — → amanhã');
    expect(d('grade_posted', 'X', null, null).detail).toBe('X: —');
    expect(d('assignment_status_changed', 'X', 'pendente', 'novo').detail).toBe('X: Pendente → novo');
  });
});
