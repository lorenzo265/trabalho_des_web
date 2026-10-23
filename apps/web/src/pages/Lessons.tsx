import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AssignmentRow, LessonRow } from '../components/items';
import { Page } from '../components/layout/Page';
import { Empty, ErrorState, SkeletonList, Spinner } from '../components/ui/bits';
import { useToast } from '../components/ui/Toast';
import { addDays, formatDateTime, formatDayMonthLong, todayLocal, weekdayShort, weekStartOf, formatDayMonth, relativeTime } from '../lib/dates';
import { HELP } from '../lib/help';
import { refreshAfterSync, useAssignments, useConfig, useLessons, useStartSync, useSyncStatus } from '../lib/queries';

function SyncCard() {
  const status = useSyncStatus();
  const start = useStartSync();
  const config = useConfig();
  const qc = useQueryClient();
  const toast = useToast();
  const running = status.data?.current?.status === 'running' || start.isPending;
  const last = status.data?.last;
  const prevRunning = useRef(false);

  // Quando uma sincronização termina, recarrega o que ela pode ter alterado.
  useEffect(() => {
    if (prevRunning.current && !running) {
      refreshAfterSync(qc);
      const l = status.data?.last;
      if (l?.status === 'ok' && l.stats) toast.show(`Sincronizado: ${l.stats.lessons} aulas e ${l.stats.assignments} trabalhos.`);
      if (l?.status === 'error') toast.show(l.error ?? 'A sincronização falhou.', 'error');
    }
    prevRunning.current = running;
  }, [running, qc, status.data, toast]);

  const source = (status.data?.source ?? config.data?.scraperSource) === 'mock' ? 'Portal de demonstração (local)' : 'Portal da faculdade';

  return (
    <section className="card sync-card" aria-labelledby="h-sync">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="h-sync">Sincronizar com a faculdade</h2>
          <p className="muted small" style={{ marginTop: 2 }}>
            Fonte: {source}. Leitura somente: nada é alterado na plataforma.
          </p>
          <p className="small" style={{ marginTop: 8 }} aria-live="polite">
            {running ? (
              'Lendo suas disciplinas, aulas e trabalhos…'
            ) : last ? (
              last.status === 'ok' ? (
                <>
                  <span className="badge badge-success">OK</span> Última sincronização {relativeTime(last.finishedAt ?? last.startedAt)} ({formatDateTime(last.finishedAt ?? last.startedAt)})
                  {last.stats && ` · ${last.stats.subjects} disciplinas, ${last.stats.lessons} aulas, ${last.stats.assignments} trabalhos`}
                </>
              ) : (
                <>
                  <span className="badge badge-danger">Falhou</span> {last.error ?? 'Erro desconhecido.'}
                </>
              )
            ) : (
              <span className="muted">Ainda não sincronizado.</span>
            )}
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={running}
          onClick={() => start.mutate(undefined, { onError: (e) => toast.error(e) })}
        >
          {running ? <Spinner /> : <RefreshCw size={18} />} {running ? 'Sincronizando…' : 'Sincronizar'}
        </button>
      </div>
    </section>
  );
}

export function LessonsPage() {
  const today = todayLocal();
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const weekEnd = addDays(weekStart, 6);
  const lessons = useLessons(weekStart, weekEnd);
  const assignments = useAssignments();
  const [showDone, setShowDone] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof lessons.data>>();
    for (const l of lessons.data ?? []) map.set(l.date, [...(map.get(l.date) ?? []), l]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lessons.data]);

  const list = (assignments.data ?? [])
    .filter((a) => showDone || a.status === 'pendente')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <Page title="Aulas" help={HELP.lessons}>
      <SyncCard />

      <div className="grid-2">
        <section aria-labelledby="h-agenda">
          <div className="section-head">
            <h2 id="h-agenda" className="section-title" style={{ marginBottom: 0 }}>
              Agenda · {formatDayMonthLong(weekStart)} – {formatDayMonthLong(weekEnd)}
            </h2>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-outline btn-sm btn-icon" aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronLeft size={18} />
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setWeekStart(weekStartOf(today))} disabled={weekStart === weekStartOf(today)}>
                Hoje
              </button>
              <button className="btn btn-outline btn-sm btn-icon" aria-label="Próxima semana" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          {lessons.isLoading ? (
            <SkeletonList n={3} h={72} />
          ) : lessons.isError ? (
            <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
          ) : byDay.length === 0 ? (
            <div className="card">
              <Empty icon={<CalendarDays size={26} />} title="Nenhuma aula nesta semana">
                Use as setas para ver outras semanas ou sincronize com a faculdade.
              </Empty>
            </div>
          ) : (
            <div className="stack">
              {byDay.map(([date, items]) => (
                <div key={date} className="card">
                  <div className="day-head">
                    <strong style={{ textTransform: 'capitalize' }}>
                      {weekdayShort(date)}, {formatDayMonth(date)}
                    </strong>
                    {date === today && <span className="badge badge-info">hoje</span>}
                  </div>
                  <ul className="items">
                    {items.map((l) => (
                      <LessonRow key={l.id} lesson={l} showDate={false} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="h-assign" className="card" style={{ alignSelf: 'start' }}>
          <div className="card-title">
            <h2 id="h-assign">Trabalhos e prazos</h2>
            <label className="row small muted" style={{ gap: 6 }}>
              <input type="checkbox" className="checkbox" style={{ width: 20, height: 20 }} checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Mostrar concluídos
            </label>
          </div>
          {assignments.isLoading ? (
            <SkeletonList n={2} h={64} />
          ) : list.length === 0 ? (
            <Empty icon={<ClipboardList size={26} />} title="Nada pendente">
              Quando houver trabalhos na faculdade, eles aparecem aqui com o prazo.
            </Empty>
          ) : (
            <ul className="items">
              {list.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
