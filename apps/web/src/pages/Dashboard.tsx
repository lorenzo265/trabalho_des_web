import type { Goal, Subject } from '@edumind/contracts';
import { subjectProgress } from '../lib/subject';
import { BookOpen, CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../app/auth';
import { AssignmentRow, LessonRow, SubjectDot } from '../components/items';
import { Page } from '../components/layout/Page';
import { GoalFormModal } from '../components/GoalFormModal';
import { Empty, ProgressBar, SkeletonList } from '../components/ui/bits';
import { useToast } from '../components/ui/Toast';
import { onColor } from '../lib/color';
import { addDays, capitalize, formatDateLong, formatHours, todayLocal, weekStartOf } from '../lib/dates';
import { HELP } from '../lib/help';
import { useOptimisticValue } from '../lib/optimistic';
import { useAssignments, useGoalMutations, useGoals, useLessons, useSubjects, useWeekStats } from '../lib/queries';

function SubjectTile({ s }: { s: Subject }) {
  const pct = Math.round(subjectProgress(s) * 100);
  return (
    <Link to={`/disciplinas/${s.id}`} className="tile" style={{ background: s.color, color: onColor(s.color) }}>
      <div className="tile-name">{s.name}</div>
      <div className="tile-pct">{s.topicCount === 0 ? 'Sem tópicos' : `${pct}% Concluído`}</div>
      <ProgressBar value={subjectProgress(s)} onColor label={`Progresso em ${s.name}`} />
    </Link>
  );
}

function GoalRow({ goal: g }: { goal: Goal }) {
  const { update, remove } = useGoalMutations();
  const toast = useToast();
  const [done, setDone, clearDone] = useOptimisticValue(g.done);
  return (
    <li className={`checkrow ${done ? 'done' : ''}`}>
      <input
        type="checkbox"
        className="checkbox"
        checked={done}
        aria-label={`Concluir meta: ${g.description}`}
        onChange={(e) => {
          setDone(e.target.checked);
          update.mutate({ id: g.id, patch: { done: e.target.checked } }, { onError: (err) => toast.error(err), onSettled: clearDone });
        }}
      />
      <div className="checkrow-text">
        <div>{g.description}</div>
        <div className="row small muted" style={{ gap: 6 }}>
          <SubjectDot color={g.subjectColor} /> {g.subjectName}
          {g.targetMinutes ? ` · ${g.targetMinutes} min` : ''}
        </div>
      </div>
      <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Excluir meta: ${g.description}`} onClick={() => remove.mutate(g.id, { onError: (err) => toast.error(err) })}>
        <Trash2 size={16} />
      </button>
    </li>
  );
}

export function DashboardPage() {
  const user = useUser();
  const toast = useToast();
  const today = todayLocal();
  const subjects = useSubjects();
  const goals = useGoals(today);
  const lessons = useLessons(today, addDays(today, 7));
  const assignments = useAssignments();
  const stats = useWeekStats(weekStartOf(today), today);
  const [goalOpen, setGoalOpen] = useState(false);

  const nextLessons = (lessons.data ?? []).slice(0, 3);
  const dueSoon = (assignments.data ?? []).filter((a) => a.status === 'pendente').sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
  const doneGoals = (goals.data ?? []).filter((g) => g.done).length;

  return (
    <Page title={`Olá, ${user.name.split(' ')[0]}!`} help={HELP.dashboard}>
      <p className="muted" style={{ marginTop: -8 }}>
        {capitalize(formatDateLong(today))}
      </p>

      <div className="grid-2">
        <div className="stack">
          <section aria-labelledby="h-subjects">
            <div className="section-head">
              <h2 id="h-subjects" className="section-title">
                Matérias ativas
              </h2>
              <Link to="/disciplinas" className="small">
                Ver todas
              </Link>
            </div>
            {subjects.isLoading ? (
              <SkeletonList n={1} h={96} />
            ) : (subjects.data ?? []).length === 0 ? (
              <div className="card">
                <Empty icon={<BookOpen size={26} />} title="Nenhuma disciplina ainda" action={<Link className="btn btn-primary btn-sm" to="/disciplinas">Adicionar disciplina</Link>}>
                  Cadastre suas matérias ou sincronize com a faculdade.
                </Empty>
              </div>
            ) : (
              <div className="hscroll">
                {subjects.data!.map((s) => (
                  <SubjectTile key={s.id} s={s} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="h-goals" className="card">
            <div className="card-title">
              <h2 id="h-goals">Metas de hoje</h2>
              {(goals.data ?? []).length > 0 && (
                <span className="muted small">
                  {doneGoals} de {goals.data!.length}
                </span>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setGoalOpen(true)} disabled={(subjects.data ?? []).length === 0}>
                <Plus size={16} /> Nova meta
              </button>
            </div>
            {goals.isLoading ? (
              <SkeletonList n={3} h={52} />
            ) : (goals.data ?? []).length === 0 ? (
              <p className="muted" style={{ padding: '8px 0' }}>
                Nenhuma meta para hoje. Que tal definir a primeira?
              </p>
            ) : (
              <ul>
                {goals.data!.map((g) => (
                  <GoalRow key={g.id} goal={g} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="h-week">
            <div className="card-title">
              <h2 id="h-week">Estudo desta semana</h2>
              <Link to="/progresso" className="small">
                Detalhes
              </Link>
            </div>
            {stats.data ? (
              <>
                <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
                  <span className="kpi-value" style={{ marginTop: 0 }}>
                    {formatHours(stats.data.totalMinutes)}
                  </span>
                  <span className="muted">de {formatHours(stats.data.weeklyGoalMinutes)} de meta</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <ProgressBar value={stats.data.totalMinutes / Math.max(1, stats.data.weeklyGoalMinutes)} label="Meta semanal de estudo" />
                </div>
              </>
            ) : (
              <SkeletonList n={1} h={56} />
            )}
          </section>

          <section className="card" aria-labelledby="h-lessons">
            <div className="card-title">
              <h2 id="h-lessons">Próximas aulas</h2>
              <Link to="/aulas" className="small">
                Ver agenda
              </Link>
            </div>
            {lessons.isLoading ? (
              <SkeletonList n={2} h={60} />
            ) : nextLessons.length === 0 ? (
              <Empty icon={<CalendarDays size={26} />} title="Sem aulas nos próximos dias">
                Sincronize com a faculdade para ver sua agenda.
              </Empty>
            ) : (
              <ul className="items">
                {nextLessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} />
                ))}
              </ul>
            )}
          </section>

          {dueSoon.length > 0 && (
            <section className="card" aria-labelledby="h-due">
              <div className="card-title">
                <h2 id="h-due">Prazos próximos</h2>
              </div>
              <ul className="items">
                {dueSoon.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {goalOpen && <GoalFormModal subjects={subjects.data ?? []} date={today} onClose={() => setGoalOpen(false)} />}
    </Page>
  );
}
