import type { ChangeEvent, ChangeKind } from '@edumind/contracts';
import { formatDayMonth } from './dates';

/** Texto de cada novidade do sync (puro, fácil de testar). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS: Record<string, string> = { pendente: 'Pendente', entregue: 'Entregue', corrigido: 'Corrigido' };

const fmtDate = (v: string | null): string => (v && ISO_DATE.test(v) ? formatDayMonth(v) : (v ?? '—'));
/** "2026-10-23 19:00–20:30" → "23/10 19:00–20:30". */
const fmtWhen = (v: string | null): string => {
  const m = v ? /^(\d{4}-\d{2}-\d{2}) (.+)$/.exec(v) : null;
  return m ? `${formatDayMonth(m[1]!)} ${m[2]}` : (v ?? '—');
};
const fmtGrade = (v: string | null): string => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? n.toLocaleString('pt-BR') : (v ?? '—');
};
const fmtStatus = (v: string | null): string => (v ? (STATUS[v] ?? v) : '—');

/** Como a novidade é agrupada visualmente (cor do ícone). */
export type ChangeTone = 'info' | 'warning' | 'success';

export interface ChangeText {
  label: string;
  detail: string;
  tone: ChangeTone;
}

export const CHANGE_TONE: Record<ChangeKind, ChangeTone> = {
  subject_new: 'info',
  assignment_new: 'info',
  lesson_new: 'info',
  lessons_added: 'info',
  assignment_due_changed: 'warning',
  lesson_rescheduled: 'warning',
  lesson_room_changed: 'warning',
  assignment_status_changed: 'warning',
  grade_posted: 'success',
  grade_changed: 'success',
};

export function describeChange(c: Pick<ChangeEvent, 'kind' | 'title' | 'oldValue' | 'newValue'>): ChangeText {
  const tone = CHANGE_TONE[c.kind];
  switch (c.kind) {
    case 'subject_new':
      return { tone, label: 'Nova disciplina', detail: c.title };
    case 'assignment_new':
      return { tone, label: 'Novo trabalho', detail: `${c.title} · prazo ${fmtDate(c.newValue)}` };
    case 'assignment_due_changed':
      return { tone, label: 'Prazo alterado', detail: `${c.title}: ${fmtDate(c.oldValue)} → ${fmtDate(c.newValue)}` };
    case 'grade_posted':
      return { tone, label: 'Nota lançada', detail: `${c.title}: ${fmtGrade(c.newValue)}` };
    case 'grade_changed':
      return { tone, label: 'Nota alterada', detail: `${c.title}: ${fmtGrade(c.oldValue)} → ${fmtGrade(c.newValue)}` };
    case 'assignment_status_changed':
      return { tone, label: 'Situação alterada', detail: `${c.title}: ${fmtStatus(c.oldValue)} → ${fmtStatus(c.newValue)}` };
    case 'lesson_new':
      return { tone, label: 'Aula nova', detail: `${c.title} · ${fmtWhen(c.newValue)}` };
    case 'lessons_added': {
      const n = Number(c.newValue);
      return { tone, label: 'Aulas novas', detail: `${n.toLocaleString('pt-BR')} aulas adicionadas em ${c.title}` };
    }
    case 'lesson_rescheduled':
      return { tone, label: 'Aula remarcada', detail: `${c.title}: ${fmtWhen(c.oldValue)} → ${fmtWhen(c.newValue)}` };
    case 'lesson_room_changed':
      return { tone, label: 'Sala alterada', detail: `${c.title}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}` };
  }
}
