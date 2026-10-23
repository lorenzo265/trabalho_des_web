import type { Topic, TopicStatus } from '@edumind/contracts';
import { subjectProgress } from '../lib/subject';
import { Bot, CalendarDays, ClipboardList, ListChecks, MapPin, Pencil, Play, Plus, Trash2, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AssignmentRow, LessonRow } from '../components/items';
import { Page } from '../components/layout/Page';
import { SubjectFormModal } from '../components/SubjectFormModal';
import { useConfirm } from '../components/ui/Confirm';
import { Empty, ErrorState, ProgressBar, SkeletonList, Spinner } from '../components/ui/bits';
import { useToast } from '../components/ui/Toast';
import { onColor } from '../lib/color';
import { addDays, todayLocal } from '../lib/dates';
import { HELP } from '../lib/help';
import { useAssignments, useLessons, useSubject, useSubjectMutations, useTopicMutations, useTopics } from '../lib/queries';

const STATUS_OPTIONS: { value: TopicStatus; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'estudando', label: 'Estudando' },
  { value: 'concluido', label: 'Concluído' },
];

function TopicRow({ topic, subjectId }: { topic: Topic; subjectId: number }) {
  const { update, remove } = useTopicMutations(subjectId);
  const toast = useToast();
  const onError = (err: unknown) => toast.error(err);
  return (
    <li className={`checkrow ${topic.status === 'concluido' ? 'done' : ''}`}>
      <input
        type="checkbox"
        className="checkbox"
        checked={topic.status === 'concluido'}
        aria-label={`Concluir tópico: ${topic.title}`}
        onChange={(e) => update.mutate({ id: topic.id, patch: { status: e.target.checked ? 'concluido' : 'pendente' } }, { onError })}
      />
      <div className="checkrow-text">
        <div>{topic.title}</div>
        <div className="row-wrap" style={{ marginTop: 4 }}>
          <select
            className="select select-sm"
            aria-label={`Status do tópico ${topic.title}`}
            value={topic.status}
            onChange={(e) => update.mutate({ id: topic.id, patch: { status: e.target.value as TopicStatus } }, { onError })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input select-sm"
            style={{ width: 'auto' }}
            aria-label={`Prazo do tópico ${topic.title}`}
            value={topic.dueDate ?? ''}
            onChange={(e) => update.mutate({ id: topic.id, patch: { dueDate: e.target.value || null } }, { onError })}
          />
        </div>
      </div>
      <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Excluir tópico: ${topic.title}`} onClick={() => remove.mutate(topic.id, { onError })}>
        <Trash2 size={16} />
      </button>
    </li>
  );
}

function TopicsTab({ subjectId }: { subjectId: number }) {
  const topics = useTopics(subjectId);
  const { create } = useTopicMutations(subjectId);
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create.mutateAsync({ title, dueDate: due || null });
      setTitle('');
      setDue('');
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="stack">
      <form className="card row-wrap" onSubmit={add} style={{ gap: 10 }}>
        <input className="input" style={{ flex: '1 1 220px' }} placeholder="Novo tópico (ex.: Navegação entre telas)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título do novo tópico" />
        <input type="date" className="input" style={{ width: 'auto' }} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Prazo do novo tópico (opcional)" />
        <button className="btn btn-primary" type="submit" disabled={create.isPending || !title.trim()}>
          {create.isPending ? <Spinner /> : <Plus size={18} />} Adicionar
        </button>
      </form>
      {topics.isLoading ? (
        <SkeletonList n={3} h={64} />
      ) : topics.isError ? (
        <ErrorState error={topics.error} onRetry={() => void topics.refetch()} />
      ) : topics.data!.length === 0 ? (
        <div className="card">
          <Empty icon={<ListChecks size={26} />} title="Nenhum tópico ainda">
            Liste o que você precisa estudar. O progresso da disciplina é calculado a partir deles.
          </Empty>
        </div>
      ) : (
        <ul>
          {topics.data!.map((t) => (
            <TopicRow key={t.id} topic={t} subjectId={subjectId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LessonsTab({ subjectId }: { subjectId: number }) {
  const today = todayLocal();
  const lessons = useLessons(addDays(today, -30), addDays(today, 90), subjectId);
  if (lessons.isLoading) return <SkeletonList n={3} h={64} />;
  const items = lessons.data ?? [];
  if (items.length === 0)
    return (
      <div className="card">
        <Empty icon={<CalendarDays size={26} />} title="Sem aulas registradas">
          Use "Sincronizar" na tela Aulas para trazer o calendário desta disciplina.
        </Empty>
      </div>
    );
  return (
    <ul className="items card">
      {items.map((l) => (
        <LessonRow key={l.id} lesson={l} />
      ))}
    </ul>
  );
}

function AssignmentsTab({ subjectId }: { subjectId: number }) {
  const all = useAssignments();
  if (all.isLoading) return <SkeletonList n={2} h={64} />;
  const items = (all.data ?? []).filter((a) => a.subjectId === subjectId);
  if (items.length === 0)
    return (
      <div className="card">
        <Empty icon={<ClipboardList size={26} />} title="Sem trabalhos registrados">
          Os trabalhos aparecem aqui depois de sincronizar com a faculdade.
        </Empty>
      </div>
    );
  return (
    <ul className="items card">
      {items.map((a) => (
        <AssignmentRow key={a.id} assignment={a} />
      ))}
    </ul>
  );
}

export function SubjectDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const subject = useSubject(id);
  const { remove } = useSubjectMutations();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'topics' | 'lessons' | 'assignments'>('topics');

  if (!Number.isInteger(id)) return <Navigate to="/disciplinas" replace />;

  const s = subject.data;

  async function onDelete() {
    if (!s) return;
    const ok = await confirm({
      title: 'Excluir disciplina?',
      message: `"${s.name}" será removida junto com seus tópicos, metas, aulas, trabalhos e conversas. Isso não pode ser desfeito.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(s.id, {
      onSuccess: () => {
        toast.show('Disciplina excluída.');
        navigate('/disciplinas', { replace: true });
      },
      onError: (e) => toast.error(e),
    });
  }

  return (
    <Page
      title={s?.name ?? 'Disciplina'}
      back="/disciplinas"
      help={HELP.subject}
      actions={
        s && (
          <>
            <button className="btn btn-ghost btn-icon" aria-label="Editar disciplina" onClick={() => setEditing(true)}>
              <Pencil size={20} />
            </button>
            <button className="btn btn-ghost btn-icon" aria-label="Excluir disciplina" onClick={() => void onDelete()}>
              <Trash2 size={20} />
            </button>
          </>
        )
      }
    >
      {subject.isLoading && <SkeletonList n={1} h={140} />}
      {subject.isError && <ErrorState error={subject.error} onRetry={() => void subject.refetch()} />}
      {s && (
        <>
          <section className="subject-hero" style={{ background: s.color, color: onColor(s.color) }}>
            <div className="row-wrap small" style={{ opacity: 0.92 }}>
              <span className="row" style={{ gap: 4 }}>
                <User size={14} aria-hidden /> {s.professor ?? 'Professor não informado'}
              </span>
              {s.room && (
                <span className="row" style={{ gap: 4 }}>
                  <MapPin size={14} aria-hidden /> {s.room}
                </span>
              )}
            </div>
            <div className="row" style={{ marginTop: 12, gap: 12 }}>
              <div style={{ flex: 1 }}>
                <ProgressBar value={subjectProgress(s)} onColor label={`Progresso em ${s.name}`} />
              </div>
              <strong>{s.topicCount === 0 ? 'Sem tópicos' : `${Math.round(subjectProgress(s) * 100)}% Concluído`}</strong>
            </div>
            <div className="row-wrap" style={{ marginTop: 14 }}>
              <button className="btn btn-sm" style={{ background: 'rgb(255 255 255 / .92)', color: '#10203a' }} onClick={() => navigate(`/tutor?subject=${s.id}`)}>
                <Bot size={16} /> Perguntar ao Tutor
              </button>
              <button className="btn btn-sm" style={{ background: 'rgb(0 0 0 / .22)', color: 'inherit', borderColor: 'transparent' }} onClick={() => navigate(`/progresso?subject=${s.id}`)}>
                <Play size={16} /> Estudar agora
              </button>
            </div>
          </section>

          <div className="tabs" role="tablist">
            {(
              [
                ['topics', 'Tópicos', ListChecks],
                ['lessons', 'Aulas', CalendarDays],
                ['assignments', 'Trabalhos', ClipboardList],
              ] as const
            ).map(([key, label, Icon]) => (
              <button key={key} role="tab" className="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          {tab === 'topics' && <TopicsTab subjectId={s.id} />}
          {tab === 'lessons' && <LessonsTab subjectId={s.id} />}
          {tab === 'assignments' && <AssignmentsTab subjectId={s.id} />}
        </>
      )}
      {editing && s && <SubjectFormModal subject={s} onClose={() => setEditing(false)} />}
    </Page>
  );
}
