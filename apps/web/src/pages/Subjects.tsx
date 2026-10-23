import { subjectProgress } from '../lib/subject';
import { BookOpen, Plus, RefreshCw, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/layout/Page';
import { SubjectFormModal } from '../components/SubjectFormModal';
import { Empty, ErrorState, ProgressBar, SkeletonList } from '../components/ui/bits';
import { HELP } from '../lib/help';
import { useSubjects } from '../lib/queries';

export function SubjectsPage() {
  const subjects = useSubjects();
  const [open, setOpen] = useState(false);

  return (
    <Page
      title="Suas matérias"
      help={HELP.subjects}
      actions={
        <button className="btn btn-primary btn-sm only-desktop" onClick={() => setOpen(true)}>
          <Plus size={16} /> Adicionar nova matéria
        </button>
      }
    >
      {subjects.isLoading ? (
        <SkeletonList n={3} h={92} />
      ) : subjects.isError ? (
        <ErrorState error={subjects.error} onRetry={() => void subjects.refetch()} />
      ) : (subjects.data ?? []).length === 0 ? (
        <div className="card">
          <Empty icon={<BookOpen size={26} />} title="Cadastre sua primeira matéria" action={<button className="btn btn-primary" onClick={() => setOpen(true)}>Adicionar matéria</button>}>
            Ou use "Sincronizar" na tela Aulas para trazer suas disciplinas da faculdade.
          </Empty>
        </div>
      ) : (
        <ul className="subject-grid">
          {subjects.data!.map((s) => (
            <li key={s.id}>
              <Link to={`/disciplinas/${s.id}`} className="subject-card" style={{ ['--c' as string]: s.color }}>
                <span className="subject-bar" aria-hidden />
                <div className="subject-main">
                  <div className="row" style={{ gap: 8 }}>
                    <strong className="truncate">{s.name}</strong>
                    {s.source === 'scraper' && (
                      <span className="badge badge-info" title="Veio da plataforma da faculdade">
                        <RefreshCw size={11} /> Sincronizada
                      </span>
                    )}
                  </div>
                  <div className="muted small truncate row" style={{ gap: 4 }}>
                    <User size={13} aria-hidden />
                    {[s.professor, s.room].filter(Boolean).join(' — ') || 'Sem professor/local informado'}
                  </div>
                  <div className="row" style={{ gap: 10, marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <ProgressBar value={subjectProgress(s)} color={s.color} label={`Progresso em ${s.name}`} />
                    </div>
                    <span className="small muted nowrap">
                      {s.topicCount === 0 ? 'sem tópicos' : `${s.doneCount}/${s.topicCount} tópicos`}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn-block add-subject only-mobile" style={{ background: 'var(--info-soft)', color: 'var(--primary)', borderColor: 'transparent' }} onClick={() => setOpen(true)}>
        <Plus size={18} /> Adicionar nova matéria
      </button>

      {open && <SubjectFormModal onClose={() => setOpen(false)} />}
    </Page>
  );
}
