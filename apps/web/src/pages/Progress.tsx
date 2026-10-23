import { ChartColumn, Clock, Pencil, Play, Plus, Square } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUser } from '../app/auth';
import { BarChart } from '../components/charts/BarChart';
import { Page } from '../components/layout/Page';
import { SubjectDot } from '../components/items';
import { Modal } from '../components/ui/Modal';
import { Empty, ErrorState, Field, ProgressBar, SkeletonList, Spinner } from '../components/ui/bits';
import { useToast } from '../components/ui/Toast';
import { addDays, formatDayMonthLong, formatDuration, formatHours, formatMinutes, todayLocal, toLocalDate, weekdayShort, weekStartOf } from '../lib/dates';
import { HELP } from '../lib/help';
import { useLogStudySession, useSubjects, useUpdateProfile, useWeekStats } from '../lib/queries';
import { storage } from '../lib/storage';

const TIMER_KEY = 'edumind_timer';
interface TimerState {
  subjectId: number;
  startedAt: string;
}

function readTimer(): TimerState | null {
  try {
    const raw = storage.get(TIMER_KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

function StudyTimer() {
  const subjects = useSubjects();
  const log = useLogStudySession();
  const toast = useToast();
  const [search] = useSearchParams();
  const [timer, setTimer] = useState<TimerState | null>(readTimer);
  const [subjectId, setSubjectId] = useState<number>(Number(search.get('subject')) || 0);
  const [now, setNow] = useState(() => Date.now());
  const [manual, setManual] = useState(false);

  const list = subjects.data ?? [];
  useEffect(() => {
    if (!subjectId && list[0]) setSubjectId(list[0].id);
  }, [list, subjectId]);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const elapsed = timer ? now - new Date(timer.startedAt).getTime() : 0;
  const timerSubject = list.find((s) => s.id === timer?.subjectId);

  function start() {
    if (!subjectId) return;
    const t = { subjectId, startedAt: new Date().toISOString() };
    storage.set(TIMER_KEY, JSON.stringify(t));
    setNow(Date.now());
    setTimer(t);
  }

  async function stop() {
    if (!timer) return;
    const minutes = Math.max(1, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000));
    try {
      await log.mutateAsync({ subjectId: timer.subjectId, startedAt: timer.startedAt, day: toLocalDate(new Date(timer.startedAt)), minutes });
      toast.show(`Sessão registrada: ${formatMinutes(minutes)}.`);
      storage.remove(TIMER_KEY);
      setTimer(null);
    } catch (e) {
      toast.error(e);
    }
  }

  function discard() {
    storage.remove(TIMER_KEY);
    setTimer(null);
  }

  return (
    <section className="card" aria-labelledby="h-timer">
      <div className="card-title">
        <h2 id="h-timer">Sessão de estudo</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setManual(true)} disabled={list.length === 0}>
          <Plus size={16} /> Registrar manualmente
        </button>
      </div>
      {list.length === 0 ? (
        <p className="muted">Cadastre uma disciplina para cronometrar seus estudos.</p>
      ) : timer ? (
        <div className="timer">
          <div className="timer-display" role="timer" aria-live="off" aria-label="Tempo de estudo em andamento">
            {formatDuration(elapsed)}
          </div>
          <div className="row small muted" style={{ justifyContent: 'center', gap: 6 }}>
            {timerSubject && <SubjectDot color={timerSubject.color} />} Estudando {timerSubject?.name ?? 'disciplina'}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12, gap: 10 }}>
            <button className="btn btn-primary" onClick={() => void stop()} disabled={log.isPending}>
              {log.isPending ? <Spinner /> : <Square size={18} fill="currentColor" />} Parar e salvar
            </button>
            <button className="btn btn-ghost" onClick={discard}>
              Descartar
            </button>
          </div>
        </div>
      ) : (
        <div className="timer">
          <div className="timer-display muted">00:00</div>
          <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="sr-only" htmlFor="timer-subject">
              Disciplina
            </label>
            <select id="timer-subject" className="select" style={{ width: 'auto', maxWidth: 260 }} value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={start}>
              <Play size={18} fill="currentColor" /> Iniciar
            </button>
          </div>
        </div>
      )}
      {manual && <ManualSession onClose={() => setManual(false)} defaultSubject={subjectId || list[0]?.id || 0} />}
    </section>
  );
}

function ManualSession({ onClose, defaultSubject }: { onClose: () => void; defaultSubject: number }) {
  const subjects = useSubjects();
  const log = useLogStudySession();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [minutes, setMinutes] = useState('30');
  const [day, setDay] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 1 || m > 720) return setError('Informe os minutos (1 a 720).');
    setError(null);
    try {
      const startedAt = new Date(`${day}T12:00:00`).toISOString();
      await log.mutateAsync({ subjectId, startedAt, day, minutes: m });
      toast.show(`Sessão registrada: ${formatMinutes(m)}.`);
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal
      title="Registrar sessão de estudo"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" form="manual-form" disabled={log.isPending}>
            {log.isPending && <Spinner />} Salvar
          </button>
        </>
      }
    >
      <form id="manual-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Disciplina" htmlFor="ms-subject">
          <select id="ms-subject" className="select" value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
            {(subjects.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quanto tempo (minutos)" htmlFor="ms-min" error={error}>
          <input id="ms-min" className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Dia" htmlFor="ms-day">
          <input id="ms-day" type="date" className="input" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function GoalModal({ current, onClose }: { current: number; onClose: () => void }) {
  const update = useUpdateProfile();
  const toast = useToast();
  const [hours, setHours] = useState(String(Math.round((current / 60) * 10) / 10).replace('.', ','));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const h = Number(hours.replace(',', '.'));
    if (!Number.isFinite(h) || h < 0.5 || h > 100) return setError('Informe entre 0,5 e 100 horas por semana.');
    try {
      await update.mutateAsync({ weeklyGoalMinutes: Math.round(h * 60) });
      toast.show('Meta semanal atualizada.');
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal
      title="Meta semanal de estudo"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" form="goal-week-form" disabled={update.isPending}>
            {update.isPending && <Spinner />} Salvar
          </button>
        </>
      }
    >
      <form id="goal-week-form" onSubmit={submit} noValidate>
        <Field label="Horas por semana" htmlFor="gw-h" error={error} hint="Ex.: 10 ou 7,5">
          <input id="gw-h" className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export function ProgressPage() {
  useUser();
  const today = todayLocal();
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const stats = useWeekStats(weekStart, today);
  const [goalOpen, setGoalOpen] = useState(false);
  const isThisWeek = weekStart === weekStartOf(today);
  const s = stats.data;

  const bars = useMemo(() => {
    if (!s) return [];
    const weekend = (s.byDay[5]?.minutes ?? 0) + (s.byDay[6]?.minutes ?? 0) > 0;
    return s.byDay.slice(0, weekend ? 7 : 5).map((d) => ({
      label: weekdayShort(d.date),
      value: d.minutes,
      valueLabel: formatHours(d.minutes),
      highlight: d.date === today,
    }));
  }, [s, today]);

  const pct = s ? s.totalMinutes / Math.max(1, s.weeklyGoalMinutes) : 0;
  const maxSubject = Math.max(1, ...(s?.bySubject ?? []).map((x) => x.minutes));

  return (
    <Page title="Seu Desempenho" help={HELP.progress}>
      {stats.isError && <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />}

      <section className="hero-stat" aria-labelledby="h-total">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="hero-label" id="h-total">
              Tempo total de estudo
            </div>
            <div className="hero-value">
              {s ? formatHours(s.totalMinutes) : '—'} <span>/ Semana</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm hero-edit" aria-label="Editar meta semanal" onClick={() => setGoalOpen(true)} disabled={!s}>
            <Pencil size={18} />
          </button>
        </div>
        {s && (
          <>
            <div style={{ margin: '14px 0 6px' }}>
              <ProgressBar value={pct} onColor label="Meta semanal" />
            </div>
            <div className="small" style={{ opacity: 0.9 }}>
              {Math.round(pct * 100)}% da meta de {formatHours(s.weeklyGoalMinutes)} por semana
            </div>
          </>
        )}
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="h-chart">
          <div className="card-title">
            <h2 id="h-chart">Horas por dia</h2>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-outline btn-sm btn-icon" aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                ‹
              </button>
              <button className="btn btn-outline btn-sm btn-icon" aria-label="Próxima semana" disabled={isThisWeek} onClick={() => setWeekStart(addDays(weekStart, 7))}>
                ›
              </button>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: -6, marginBottom: 6 }}>
            {isThisWeek ? 'Esta semana' : `${formatDayMonthLong(weekStart)} – ${formatDayMonthLong(addDays(weekStart, 6))}`}
          </p>
          {s ? (
            s.totalMinutes === 0 ? (
              <Empty icon={<ChartColumn size={26} />} title="Sem estudo registrado nesta semana">
                Inicie o cronômetro ao lado para começar a preencher o gráfico.
              </Empty>
            ) : (
              <BarChart data={bars} ariaLabel="Horas estudadas por dia" />
            )
          ) : (
            <SkeletonList n={1} h={190} />
          )}
        </section>

        <div className="stack">
          <StudyTimer />

          <section className="card" aria-labelledby="h-by-subject">
            <div className="card-title">
              <h2 id="h-by-subject">Por disciplina</h2>
            </div>
            {!s ? (
              <SkeletonList n={2} h={40} />
            ) : s.bySubject.length === 0 ? (
              <p className="muted">Nenhuma sessão nesta semana.</p>
            ) : (
              <ul className="stack-sm">
                {s.bySubject.map((x) => (
                  <li key={x.subjectId}>
                    <div className="row small" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <SubjectDot color={x.color} /> {x.name}
                      </span>
                      <strong>{formatMinutes(x.minutes)}</strong>
                    </div>
                    <ProgressBar value={x.minutes / maxSubject} color={x.color} label={`Tempo em ${x.name}`} />
                  </li>
                ))}
              </ul>
            )}
            {s && (
              <div className="row small muted" style={{ marginTop: 14, gap: 6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <Clock size={14} aria-hidden /> {s.subjectsCompleted} de {s.subjectsTotal} disciplinas concluídas · {s.goalsTodayDone}/{s.goalsToday} metas de hoje
              </div>
            )}
          </section>
        </div>
      </div>

      {goalOpen && s && <GoalModal current={s.weeklyGoalMinutes} onClose={() => setGoalOpen(false)} />}
    </Page>
  );
}
