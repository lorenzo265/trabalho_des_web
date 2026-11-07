import type { Assignment } from '@edumind/contracts';
import { BellRing, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { todayLocal } from '../lib/dates';
import { buildReminders, readDismissed, visibleReminders, writeDismissed, type ReminderLevel } from '../lib/reminders';
import { SubjectDot } from './items';

const BADGE: Record<ReminderLevel, string> = {
  overdue: 'badge-danger',
  today: 'badge-danger',
  tomorrow: 'badge-warning',
  soon: 'badge-info',
};

/** Lembretes de prazo no Início: o que vence hoje, amanhã, em até 3 dias ou acabou de vencer. */
export function RemindersCard({ assignments, userId, today = todayLocal() }: { assignments: readonly Assignment[]; userId: number; today?: string }) {
  const reminders = useMemo(() => buildReminders(assignments, today), [assignments, today]);
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));
  const visible = visibleReminders(reminders, dismissed);
  if (visible.length === 0) return null;

  const dismiss = (keys: string[]) => {
    const next = new Set([...dismissed, ...keys]);
    setDismissed(next);
    writeDismissed(userId, next, reminders);
  };

  return (
    <section className="card" aria-labelledby="h-reminders">
      <div className="card-title card-title-wrap">
        <h2 id="h-reminders" className="row" style={{ gap: 8 }}>
          <BellRing size={18} aria-hidden /> Lembretes
        </h2>
        {visible.length > 1 && (
          <button className="btn btn-ghost btn-sm" onClick={() => dismiss(visible.map((r) => r.key))}>
            Dispensar todos
          </button>
        )}
      </div>
      <ul className="items" aria-label="Lembretes de prazo">
        {visible.map((r) => (
          <li key={r.key} className="item">
            <span className="item-bar" style={{ background: r.assignment.subjectColor }} aria-hidden />
            <div className="item-body">
              <div style={{ fontWeight: 700 }}>{r.assignment.title}</div>
              <div className="row small muted" style={{ gap: 6 }}>
                <SubjectDot color={r.assignment.subjectColor} /> {r.assignment.subjectName}
              </div>
            </div>
            <span className={`badge ${BADGE[r.level]}`}>{r.label}</span>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Dispensar lembrete: ${r.assignment.title}`} onClick={() => dismiss([r.key])}>
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
