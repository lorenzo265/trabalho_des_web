import { ArrowLeft, CircleHelp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { HelpContent } from '../../lib/help';
import { Modal } from '../ui/Modal';

interface Props {
  title: ReactNode;
  /** Rota do botão voltar (ou `true` para voltar no histórico). */
  back?: string | true;
  actions?: ReactNode;
  help?: HelpContent;
  children: ReactNode;
}

/** Cabeçalho (barra azul no celular, título grande no desktop) + conteúdo da página. */
export function Page({ title, back, actions, help, children }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        {back && (
          <button
            className="btn btn-ghost btn-icon topbar-back"
            aria-label="Voltar"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <h1 className="topbar-title">{title}</h1>
        {actions}
        {help && (
          <button className="btn btn-ghost btn-icon" aria-label="Ajuda desta tela" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={22} />
          </button>
        )}
      </header>
      <main className="main">
        <div className="page">{children}</div>
      </main>
      {help && helpOpen && (
        <Modal
          title={help.title}
          onClose={() => setHelpOpen(false)}
          actions={
            <button className="btn btn-primary" onClick={() => setHelpOpen(false)}>
              Entendi
            </button>
          }
        >
          <ul className="stack-sm">
            {help.tips.map((t) => (
              <li key={t} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="dot" style={{ background: 'var(--primary)', marginTop: 7 }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 14 }}>
            Precisa rever a apresentação inicial? Abra o <Link to="/perfil">Perfil</Link>.
          </p>
        </Modal>
      )}
    </>
  );
}
