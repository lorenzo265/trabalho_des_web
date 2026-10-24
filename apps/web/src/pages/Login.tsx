import { loginInputSchema } from '@edumind/contracts';
import { Eye, EyeOff, GraduationCap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { Field, Spinner } from '../components/ui/bits';
import { useConfig } from '../lib/queries';

export function GoogleButton({ enabled }: { enabled: boolean }) {
  return (
    <button
      type="button"
      className="btn btn-outline btn-block"
      disabled={!enabled}
      title={enabled ? undefined : 'Login com Google ainda não está disponível neste PoC'}
      aria-label={enabled ? 'Entrar com Google' : 'Entrar com Google (em breve)'}
    >
      <span className="g-mark" aria-hidden>
        G
      </span>
      Entrar com Google
      {!enabled && <span className="badge">em breve</span>}
    </button>
  );
}

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-inner">
        <div className="auth-brand">
          <div className="auth-logo" aria-hidden>
            <GraduationCap size={40} />
          </div>
          <div className="auth-name">EduMind</div>
        </div>
        <div className="card card-pad-lg auth-card">
          <h1 style={{ fontSize: '1.375rem' }}>{title}</h1>
          <p className="muted" style={{ margin: '4px 0 18px' }}>
            {subtitle}
          </p>
          {children}
        </div>
        <p className="auth-foot">Projeto G2 · Organizador de Estudos com IA</p>
      </div>
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoComplete: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm input-action"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'email' | 'password';
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await login(parsed.data);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Bem-vindo de volta" subtitle="Entre para continuar seus estudos.">
      <form className="form-grid" onSubmit={submit} noValidate>
        {formError && (
          <div className="form-error" role="alert">
            {formError}
          </div>
        )}
        <Field label="E-mail" htmlFor="email" error={fieldErrors.email}>
          <input
            id="email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="seu.nome@unilasalle.edu.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email || undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            autoFocus
          />
        </Field>
        <Field label="Senha" htmlFor="password" error={fieldErrors.password}>
          <PasswordInput id="password" value={password} onChange={setPassword} invalid={!!fieldErrors.password} autoComplete="current-password" placeholder="••••••••" />
        </Field>
        <button className="btn btn-navy btn-block" type="submit" disabled={busy}>
          {busy ? <Spinner /> : null} Entrar
        </button>
        <div className="divider">
          <span>ou</span>
        </div>
        <GoogleButton enabled={config.data?.googleEnabled ?? false} />
        {import.meta.env.DEV && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setEmail('aluno@edumind.local');
              setPassword('aluno12345');
            }}
          >
            Usar conta de demonstração
          </button>
        )}
      </form>
      <p className="auth-switch">
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </AuthFrame>
  );
}
