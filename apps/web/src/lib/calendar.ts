import type { Assignment, Lesson } from '@edumind/contracts';
import { addDays, capitalize, parseLocalDate, toLocalDate, weekStartOf } from './dates';

/** Lógica pura do Calendário (grade do mês, agrupamento por dia). A semana começa na segunda-feira. */

export const firstOfMonth = (date: string): string => `${date.slice(0, 7)}-01`;

/** Primeiro dia do mês, `n` meses depois (ou antes, se negativo). */
export function addMonths(date: string, n: number): string {
  const d = parseLocalDate(firstOfMonth(date));
  d.setMonth(d.getMonth() + n, 1);
  return toLocalDate(d);
}

export interface GridDay {
  date: string;
  inMonth: boolean;
}

/** Semanas (segunda a domingo) que cobrem o mês de `anchor`; só entram semanas com algum dia do mês (4 a 6 linhas). */
export function monthGrid(anchor: string): GridDay[][] {
  const first = firstOfMonth(anchor);
  const month = first.slice(0, 7);
  const start = weekStartOf(first);
  const weeks: GridDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, w * 7 + i);
      return { date, inMonth: date.startsWith(month) };
    });
    if (week.some((d) => d.inMonth)) weeks.push(week);
  }
  return weeks;
}

export const gridRange = (weeks: GridDay[][]): { from: string; to: string } => ({
  from: weeks[0]![0]!.date,
  to: weeks[weeks.length - 1]![6]!.date,
});

export const weekDays = (anchor: string): string[] => {
  const start = weekStartOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export type CalendarEvent =
  | { kind: 'lesson'; date: string; lesson: Lesson }
  | { kind: 'assignment'; date: string; assignment: Assignment };

/** Por dia: aulas por horário, depois prazos por título. */
export function groupByDate(lessons: readonly Lesson[], assignments: readonly Assignment[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const push = (e: CalendarEvent) => map.set(e.date, [...(map.get(e.date) ?? []), e]);
  [...lessons]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id - b.id)
    .forEach((lesson) => push({ kind: 'lesson', date: lesson.date, lesson }));
  [...assignments]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'pt-BR'))
    .forEach((assignment) => push({ kind: 'assignment', date: assignment.dueDate, assignment }));
  return map;
}

export const monthTitle = (date: string): string =>
  capitalize(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseLocalDate(date)));

export const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

/** "3 eventos", "1 evento", "sem eventos" — para o rótulo acessível de cada dia. */
export const eventCountLabel = (n: number): string => (n === 0 ? 'sem eventos' : n === 1 ? '1 evento' : `${n} eventos`);
