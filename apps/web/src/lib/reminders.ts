import type { Assignment } from '@edumind/contracts';
import { diffDays } from './dates';
import { storage } from './storage';

/**
 * Lembretes de prazo dentro do app (sem push nem e-mail, que ficam fora do PoC).
 * Só trabalhos pendentes entram: vence hoje, amanhã, em 2–3 dias, ou venceu há até 7 dias.
 * O aluno pode dispensar; o lembrete volta se a urgência subir (ex.: de "em 3 dias" para "amanhã").
 */

export type ReminderLevel = 'overdue' | 'today' | 'tomorrow' | 'soon';

export const SOON_DAYS = 3;
export const OVERDUE_DAYS = 7;

export interface Reminder {
  /** Muda quando a urgência muda: é o que permite "dispensar" sem esconder o próximo nível. */
  key: string;
  assignment: Assignment;
  daysLeft: number;
  level: ReminderLevel;
  label: string;
}

export function levelFor(daysLeft: number): ReminderLevel | null {
  if (daysLeft < -OVERDUE_DAYS) return null;
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft <= SOON_DAYS) return 'soon';
  return null;
}

export function reminderLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'vence hoje';
  if (daysLeft === 1) return 'vence amanhã';
  if (daysLeft > 1) return `vence em ${daysLeft} dias`;
  return daysLeft === -1 ? 'venceu ontem' : `venceu há ${-daysLeft} dias`;
}

/** Mais urgente primeiro (vencidos, depois hoje…); empate por título para a ordem ser estável. */
export function buildReminders(assignments: readonly Assignment[], today: string): Reminder[] {
  const out: Reminder[] = [];
  for (const a of assignments) {
    if (a.status !== 'pendente') continue;
    const daysLeft = diffDays(today, a.dueDate);
    const level = levelFor(daysLeft);
    if (!level) continue;
    out.push({ key: `${a.id}:${level}`, assignment: a, daysLeft, level, label: reminderLabel(daysLeft) });
  }
  return out.sort((x, y) => x.daysLeft - y.daysLeft || x.assignment.title.localeCompare(y.assignment.title, 'pt-BR'));
}

export const visibleReminders = (reminders: readonly Reminder[], dismissed: ReadonlySet<string>): Reminder[] =>
  reminders.filter((r) => !dismissed.has(r.key));

// ---------- Persistência dos dispensados (por aluno, neste navegador) ----------
export const remindersStorageKey = (userId: number) => `edumind_reminders_dismissed_${userId}`;

export function readDismissed(userId: number): Set<string> {
  try {
    const raw = storage.get(remindersStorageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set(); // JSON corrompido: começa do zero
  }
}

/** Guarda só os dispensados que ainda correspondem a algum lembrete atual (o resto é limpeza). */
export function writeDismissed(userId: number, dismissed: ReadonlySet<string>, current: readonly Reminder[]): void {
  const live = new Set(current.map((r) => r.key));
  storage.set(remindersStorageKey(userId), JSON.stringify([...dismissed].filter((k) => live.has(k))));
}
