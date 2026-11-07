import type { Assignment, Lesson } from '@edumind/contracts';
import { addMonths, eventCountLabel, firstOfMonth, gridRange, groupByDate, monthGrid, monthTitle, weekDays } from './calendar';

const lesson = (id: number, date: string, start: string, over: Partial<Lesson> = {}): Lesson => ({
  id, subjectId: 1, subjectName: 'BD', subjectColor: '#2563EB', date, start, end: '20:30', topic: null, room: null, ...over,
});
const assignment = (id: number, dueDate: string, title: string): Assignment => ({
  id, subjectId: 1, subjectName: 'BD', subjectColor: '#2563EB', title, description: null, dueDate, status: 'pendente', grade: null, weight: 1,
});

describe('meses', () => {
  it('firstOfMonth', () => expect(firstOfMonth('2026-11-06')).toBe('2026-11-01'));

  it('addMonths não tropeça em dia 31 e atravessa o ano', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(addMonths('2026-11-06', 0)).toBe('2026-11-01');
  });

  it('monthTitle em português', () => expect(monthTitle('2026-11-06')).toBe('Novembro de 2026'));
});

describe('monthGrid (semana de segunda a domingo)', () => {
  it('novembro/2026 começa num domingo: 6 linhas, a 1ª com 6 dias de outubro', () => {
    const weeks = monthGrid('2026-11-06');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]![0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(weeks[0]![6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(weeks[5]![0]).toEqual({ date: '2026-11-30', inMonth: true });
    expect(weeks[5]![1]).toEqual({ date: '2026-12-01', inMonth: false });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('setembro/2026 precisa de 5 linhas', () => {
    const weeks = monthGrid('2026-09-15');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]!.date).toBe('2026-08-31');
    expect(weeks[4]![6]!.date).toBe('2026-10-04');
  });

  it('fevereiro/2027 (começa na segunda, 28 dias) cabe em 4 linhas sem dias de fora', () => {
    const weeks = monthGrid('2027-02-10');
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every((d) => d.inMonth)).toBe(true);
    expect(weeks[0]![0]!.date).toBe('2027-02-01');
    expect(weeks[3]![6]!.date).toBe('2027-02-28');
  });

  it('todo dia do mês aparece exatamente uma vez', () => {
    const inMonth = monthGrid('2028-02-10').flat().filter((d) => d.inMonth).map((d) => d.date);
    expect(inMonth).toHaveLength(29); // ano bissexto
    expect(new Set(inMonth).size).toBe(29);
  });

  it('gridRange e weekDays', () => {
    expect(gridRange(monthGrid('2026-11-06'))).toEqual({ from: '2026-10-26', to: '2026-12-06' });
    expect(weekDays('2026-11-06')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(weekDays('2026-11-08')[0]).toBe('2026-11-02'); // domingo ainda é da semana que começou na segunda
  });
});

describe('groupByDate', () => {
  it('agrupa por dia: aulas por horário e depois prazos por título', () => {
    const map = groupByDate(
      [lesson(2, '2026-11-06', '19:00'), lesson(1, '2026-11-06', '08:00'), lesson(3, '2026-11-09', '10:00')],
      [assignment(2, '2026-11-06', 'Zebra'), assignment(1, '2026-11-06', 'Árvore'), assignment(3, '2026-11-20', 'Longe')],
    );
    expect(map.get('2026-11-06')!.map((e) => (e.kind === 'lesson' ? `aula ${e.lesson.start}` : `prazo ${e.assignment.title}`))).toEqual([
      'aula 08:00', 'aula 19:00', 'prazo Árvore', 'prazo Zebra',
    ]);
    expect([...map.keys()].sort()).toEqual(['2026-11-06', '2026-11-09', '2026-11-20']);
    expect(map.get('2026-11-01')).toBeUndefined();
  });

  it('vazio gera mapa vazio', () => expect(groupByDate([], []).size).toBe(0));
});

describe('eventCountLabel', () => {
  it.each([[0, 'sem eventos'], [1, '1 evento'], [5, '5 eventos']])('%i → %s', (n, label) => expect(eventCountLabel(n)).toBe(label));
});
