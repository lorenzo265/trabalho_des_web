import type { ChangeKind } from '@edumind/contracts';
import { Award, Bell, BellRing, CalendarClock, CalendarPlus, CheckCheck, ClipboardCheck, FilePlus, MapPin, Sparkles } from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { describeChange } from '../lib/changes';
import { relativeTime } from '../lib/dates';
import { useChanges, useMarkChangesSeen } from '../lib/queries';
import { SubjectDot } from './items';
import { Empty, ErrorState, SkeletonList } from './ui/bits';
import { useToast } from './ui/Toast';

const ICONS: Record<ChangeKind, ComponentType<{ size?: number }>> = {
  subject_new: Sparkles,
  assignment_new: FilePlus,
  assignment_due_changed: CalendarClock,
  grade_posted: Award,
  grade_changed: Award,
  assignment_status_changed: ClipboardCheck,
  lesson_new: CalendarPlus,
  lessons_added: CalendarPlus,
  lesson_rescheduled: CalendarClock,
  lesson_room_changed: MapPin,
};

const VISIBLE = 5;

/** "Novidades da faculdade": o que mudou desde a sincronização anterior. */
export function ChangesCard() {
  const q = useChanges();
  const markSeen = useMarkChangesSeen();
  const toast = useToast();
  const [all, setAll] = useState(false);

  const items = q.data?.items ?? [];
  const unseen = q.data?.unseen ?? 0;
  const shown = all ? items : items.slice(0, VISIBLE);

  return (
    <section className="card" aria-labelledby="h-changes">
      <div className="card-title card-title-wrap">
        <h2 id="h-changes">Novidades da faculdade</h2>
        {unseen > 0 && <span className="badge badge-warning">{unseen} {unseen === 1 ? 'nova' : 'novas'}</span>}
        {unseen > 0 && (
          <button
            className="btn btn-outline btn-sm"
            disabled={markSeen.isPending}
            onClick={() => markSeen.mutate(undefined, { onError: (e) => toast.error(e) })}
          >
            <CheckCheck size={16} /> Marcar como vistas
          </button>
        )}
      </div>

      {q.isLoading ? (
        <SkeletonList n={2} h={52} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon={<Bell size={26} />} title="Nenhuma novidade por enquanto">
          Depois de cada sincronização, mudanças de prazo, notas lançadas, aulas remarcadas e trabalhos novos aparecem aqui.
        </Empty>
      ) : (
        <>
          <ul aria-label="Novidades">
            {shown.map((c) => {
              const { label, detail, tone } = describeChange(c);
              const Icon = ICONS[c.kind];
              return (
                <li key={c.id} className={`change ${c.seen ? '' : 'change-unseen'}`}>
                  <span className={`change-icon tone-${tone}`} aria-hidden>
                    <Icon size={16} />
                  </span>
                  <div className="change-body">
                    <div className="row-wrap" style={{ gap: 6 }}>
                      <strong>{label}</strong>
                      {!c.seen && <span className="badge badge-info">novo</span>}
                    </div>
                    <div className="change-detail">{detail}</div>
                    <div className="row small muted" style={{ gap: 6 }}>
                      <SubjectDot color={c.subjectColor} /> {c.subjectName} · {relativeTime(c.createdAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length > VISIBLE && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? 'Mostrar menos' : `Mostrar mais (${items.length - VISIBLE})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Aviso compacto para o Painel: só aparece se houver novidades não vistas. */
export function ChangesNotice() {
  const q = useChanges();
  const unseen = q.data?.unseen ?? 0;
  if (unseen === 0) return null;
  return (
    <Link to="/aulas" className="notice" aria-label={`${unseen} novidades da faculdade. Ver detalhes.`}>
      <BellRing size={20} aria-hidden />
      <span>
        <strong>{unseen}</strong> {unseen === 1 ? 'novidade' : 'novidades'} da faculdade desde a última sincronização
      </span>
      <span className="small">Ver</span>
    </Link>
  );
}
