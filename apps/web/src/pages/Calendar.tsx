import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Download, Flag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AssignmentRow, LessonRow } from '../components/items';
import { Page } from '../components/layout/Page';
import { Empty, ErrorState, SkeletonList } from '../components/ui/bits';
import {
  addMonths, eventCountLabel, firstOfMonth, gridRange, groupByDate, monthGrid, monthTitle, weekDays, WEEKDAY_HEADERS,
  type CalendarEvent,
} from '../lib/calendar';
import { addDays, capitalize, formatDateLong, formatDayMonthLong, todayLocal, weekdayShort, weekStartOf } from '../lib/dates';
import { HELP } from '../lib/help';
import { useAssignments, useLessons } from '../lib/queries';
import { storage } from '../lib/storage';

type View = 'month' | 'week';
const VIEW_KEY = 'edumind_calendar_view';
const MAX_CHIPS = 3;

function chipText(e: CalendarEvent): string {
  return e.kind === 'lesson' ? `${e.lesson.start} ${e.lesson.subjectName}` : `Prazo: ${e.assignment.title}`;
}
const chipColor = (e: CalendarEvent): string => (e.kind === 'lesson' ? e.lesson.subjectColor : e.assignment.subjectColor);

function DayEvents({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <Empty icon={<CalendarDays size={26} />} title="Nada neste dia">
        Sem aulas nem prazos. Bom momento para adiantar os estudos.
      </Empty>
    );
  }
  return (
    <ul className="items">
      {events.map((e) =>
        e.kind === 'lesson' ? <LessonRow key={`l${e.lesson.id}`} lesson={e.lesson} showDate={false} /> : <AssignmentRow key={`a${e.assignment.id}`} assignment={e.assignment} />,
      )}
    </ul>
  );
}

export function CalendarPage() {
  const today = todayLocal();
  const [view, setViewState] = useState<View>(() => (storage.get(VIEW_KEY) === 'week' ? 'week' : 'month'));
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);

  const setView = (v: View) => {
    setViewState(v);
    storage.set(VIEW_KEY, v);
  };

  const weeks = useMemo(() => monthGrid(cursor), [cursor]);
  const days = useMemo(() => weekDays(cursor), [cursor]);
  const range = view === 'month' ? gridRange(weeks) : { from: days[0]!, to: days[6]! };

  const lessons = useLessons(range.from, range.to);
  const assignments = useAssignments();
  const byDate = useMemo(() => groupByDate(lessons.data ?? [], assignments.data ?? []), [lessons.data, assignments.data]);

  const step = (dir: -1 | 1) => {
    const next = view === 'month' ? addMonths(cursor, dir) : addDays(cursor, 7 * dir);
    setCursor(next);
    setSelected(view === 'month' ? next : weekStartOf(next));
  };
  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };
  const atToday = view === 'month' ? firstOfMonth(cursor) === firstOfMonth(today) : weekStartOf(cursor) === weekStartOf(today);
  const title = view === 'month' ? monthTitle(cursor) : `${formatDayMonthLong(days[0]!)} – ${formatDayMonthLong(days[6]!)}`;
  const selectedEvents = byDate.get(selected) ?? [];

  return (
    <Page title="Calendário" help={HELP.calendar}>
      <section aria-labelledby="h-cal">
        <div className="section-head">
          <h2 id="h-cal" className="section-title" style={{ marginBottom: 0 }} aria-live="polite">
            {title}
          </h2>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-outline btn-sm btn-icon" aria-label={view === 'month' ? 'Mês anterior' : 'Semana anterior'} onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-outline btn-sm" onClick={goToday} disabled={atToday}>
              Hoje
            </button>
            <button className="btn btn-outline btn-sm btn-icon" aria-label={view === 'month' ? 'Próximo mês' : 'Próxima semana'} onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Modo de exibição" style={{ marginBottom: 12, maxWidth: 280 }}>
          {([['month', 'Mês'], ['week', 'Semana']] as const).map(([key, label]) => (
            <button key={key} role="tab" className="tab" aria-selected={view === key} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>

        {lessons.isError ? (
          <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
        ) : view === 'month' ? (
          <div className="card cal-card">
            <div className="cal-head" aria-hidden>
              {WEEKDAY_HEADERS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="cal-grid" role="group" aria-label={title}>
              {weeks.flat().map(({ date, inMonth }) => {
                const events = byDate.get(date) ?? [];
                const classes = ['cal-day', inMonth ? '' : 'out', date === today ? 'today' : '', date === selected ? 'selected' : ''].filter(Boolean).join(' ');
                return (
                  <button
                    key={date}
                    className={classes}
                    aria-pressed={date === selected}
                    aria-current={date === today ? 'date' : undefined}
                    aria-label={`${capitalize(formatDateLong(date))}, ${eventCountLabel(events.length)}`}
                    onClick={() => setSelected(date)}
                  >
                    <span className="cal-num">{Number(date.slice(8))}</span>
                    <span className="cal-chips" aria-hidden>
                      {events.slice(0, MAX_CHIPS).map((e, i) => (
                        <span key={i} className={`cal-chip ${e.kind}`} style={{ borderLeftColor: chipColor(e) }}>
                          {e.kind === 'assignment' && <Flag size={10} />} {chipText(e)}
                        </span>
                      ))}
                      {events.length > MAX_CHIPS && <span className="cal-more">+{events.length - MAX_CHIPS}</span>}
                    </span>
                    <span className="cal-dots" aria-hidden>
                      {events.slice(0, 4).map((e, i) => (
                        <span key={i} className="dot" style={{ background: chipColor(e) }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="stack">
            {lessons.isLoading ? (
              <SkeletonList n={3} h={72} />
            ) : (
              days.map((date) => (
                <div key={date} className="card" aria-label={capitalize(formatDateLong(date))}>
                  <div className="day-head">
                    <strong style={{ textTransform: 'capitalize' }}>
                      {weekdayShort(date)}, {formatDayMonthLong(date)}
                    </strong>
                    {date === today && <span className="badge badge-info">hoje</span>}
                  </div>
                  <DayEvents events={byDate.get(date) ?? []} />
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {view === 'month' && (
        <section className="card" aria-labelledby="h-day">
          <div className="card-title">
            <h2 id="h-day" aria-live="polite">
              {capitalize(formatDateLong(selected))}
            </h2>
            {selected === today && <span className="badge badge-info">hoje</span>}
          </div>
          {lessons.isLoading ? <SkeletonList n={2} h={64} /> : <DayEvents events={selectedEvents} />}
        </section>
      )}

      <section className="card" aria-labelledby="h-export">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="h-export" className="row" style={{ gap: 8 }}>
              <CalendarClock size={18} aria-hidden /> Levar para a sua agenda
            </h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Baixe o arquivo <strong>.ics</strong> e importe no Google Agenda, Outlook ou Calendário da Apple. Ele traz todas as aulas e prazos. Depois de uma
              sincronização com novidades, baixe de novo: os eventos têm código fixo, então reimportar atualiza em vez de duplicar.
            </p>
          </div>
          <a className="btn btn-outline" href="/api/calendar.ics" download="edumind-agenda.ics">
            <Download size={18} /> Baixar .ics
          </a>
        </div>
      </section>
    </Page>
  );
}
