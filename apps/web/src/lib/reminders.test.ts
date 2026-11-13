import type { Assignment } from '@edumind/contracts';
import { buildReminders, levelFor, readDismissed, reminderLabel, remindersStorageKey, visibleReminders, writeDismissed } from './reminders';

const TODAY = '2026-11-06';
const add = (n: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const a = (id: number, offset: number, over: Partial<Assignment> = {}): Assignment => ({
  id, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', title: `Trabalho ${id}`,
  description: null, dueDate: add(offset), status: 'pendente', grade: null, weight: 1, ...over,
});

describe('levelFor / reminderLabel', () => {
  it.each([
    [-8, null], [-7, 'overdue'], [-1, 'overdue'], [0, 'today'], [1, 'tomorrow'], [2, 'soon'], [3, 'soon'], [4, null], [30, null],
  ])('%i dias → %s', (days, level) => expect(levelFor(days)).toBe(level));

  it.each([
    [0, 'vence hoje'], [1, 'vence amanhã'], [3, 'vence em 3 dias'], [-1, 'venceu ontem'], [-4, 'venceu há 4 dias'],
  ])('rótulo para %i', (days, label) => expect(reminderLabel(days)).toBe(label));
});

describe('buildReminders', () => {
  it('só pendentes dentro da janela, do mais urgente para o menos', () => {
    const list = buildReminders(
      [
        a(1, 3), a(2, 0), a(3, -2), a(4, 1),
        a(5, 10), // longe demais
        a(6, -20), // vencido há muito tempo: não vira lembrete eterno
        a(7, 1, { status: 'entregue' }), // já entregue
        a(8, 0, { status: 'corrigido', grade: 8 }),
      ],
      TODAY,
    );
    expect(list.map((r) => [r.assignment.id, r.level])).toEqual([[3, 'overdue'], [2, 'today'], [4, 'tomorrow'], [1, 'soon']]);
    expect(list.map((r) => r.label)).toEqual(['venceu há 2 dias', 'vence hoje', 'vence amanhã', 'vence em 3 dias']);
  });

  it('chave muda com o nível (base da regra "dispensar e reaparecer")', () => {
    expect(buildReminders([a(1, 3)], TODAY)[0]!.key).toBe('1:soon');
    expect(buildReminders([a(1, 3)], add(2))[0]!.key).toBe('1:tomorrow');
    expect(buildReminders([a(1, 3)], add(3))[0]!.key).toBe('1:today');
  });

  it('empate de prazo: ordem estável por título', () => {
    const list = buildReminders([a(2, 1, { title: 'Zebra' }), a(1, 1, { title: 'Árvore' })], TODAY);
    expect(list.map((r) => r.assignment.title)).toEqual(['Árvore', 'Zebra']);
  });

  it('sem trabalhos, sem lembretes', () => {
    expect(buildReminders([], TODAY)).toEqual([]);
  });
});

describe('dispensados', () => {
  beforeEach(() => localStorage.clear());

  it('dispensar esconde só aquele nível; ao subir a urgência o lembrete volta', () => {
    const d3 = buildReminders([a(1, 3)], TODAY);
    writeDismissed(7, new Set(d3.map((r) => r.key)), d3);
    expect(visibleReminders(d3, readDismissed(7))).toEqual([]);
    expect(visibleReminders(buildReminders([a(1, 3)], add(1)), readDismissed(7))).toEqual([]); // 2 dias: ainda "soon"
    const tomorrow = buildReminders([a(1, 3)], add(2)); // faltando 1 dia: nível novo
    expect(visibleReminders(tomorrow, readDismissed(7)).map((r) => r.key)).toEqual(['1:tomorrow']);
  });

  it('é por aluno: dispensar para um não afeta o outro', () => {
    const list = buildReminders([a(1, 0)], TODAY);
    writeDismissed(1, new Set(['1:today']), list);
    expect(readDismissed(1).has('1:today')).toBe(true);
    expect(readDismissed(2).size).toBe(0);
  });

  it('limpa o que não corresponde mais a nenhum lembrete', () => {
    const list = buildReminders([a(1, 0)], TODAY);
    writeDismissed(1, new Set(['1:today', '99:soon', '1:overdue']), list);
    expect([...readDismissed(1)]).toEqual(['1:today']);
  });

  it('armazenamento corrompido ou de tipo errado não quebra', () => {
    localStorage.setItem(remindersStorageKey(1), '{nao é json');
    expect(readDismissed(1).size).toBe(0);
    localStorage.setItem(remindersStorageKey(1), JSON.stringify({ a: 1 }));
    expect(readDismissed(1).size).toBe(0);
    localStorage.setItem(remindersStorageKey(1), JSON.stringify(['1:today', 5, null]));
    expect([...readDismissed(1)]).toEqual(['1:today']);
  });
});
