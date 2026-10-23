import { Bot, BookOpen, GraduationCap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Modal } from '../ui/Modal';

const STEPS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <GraduationCap size={32} />,
    title: 'Bem-vindo ao EduMind',
    text: 'No Início você vê o que fazer hoje: suas metas do dia e o progresso de cada disciplina.',
  },
  {
    icon: <BookOpen size={32} />,
    title: 'Suas disciplinas e aulas',
    text: 'Cadastre as matérias ou sincronize com a faculdade para trazer aulas e trabalhos automaticamente.',
  },
  {
    icon: <Bot size={32} />,
    title: 'Professor Tutor IA',
    text: 'Tem dúvida? Toque no botão azul "Tutor IA" e converse. Ele explica com exemplos e confere o seu entendimento.',
  },
];

/** Apresentação de 3 passos exibida uma vez por usuário (e sob demanda no Perfil). */
export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  return (
    <Modal
      title="Primeiros passos"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Pular
          </button>
          <button className="btn btn-primary" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Começar' : 'Próximo'}
          </button>
        </>
      }
    >
      <div className="empty" style={{ padding: '8px 0 0' }}>
        <div className="empty-icon" style={{ width: 72, height: 72, borderRadius: 22 }}>
          {step.icon}
        </div>
        <h3 style={{ fontSize: '1.125rem' }}>{step.title}</h3>
        <p>{step.text}</p>
        <div className="row" style={{ justifyContent: 'center', gap: 6 }} aria-label={`Passo ${i + 1} de ${STEPS.length}`}>
          {STEPS.map((_, n) => (
            <span key={n} className="dot" style={{ width: n === i ? 22 : 8, height: 8, borderRadius: 8, background: n === i ? 'var(--primary)' : 'var(--border-strong)' }} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
