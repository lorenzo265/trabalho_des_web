import { registerInputSchema } from '@edumind/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { Field, Spinner } from '../components/ui/bits';
import { useConfig } from '../lib/queries';
import { AuthFrame, GoogleButton, PasswordInput } from './Login';

export function RegisterPage() {
  const { register } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = registerInputSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] ??= issue.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await register(parsed.data);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Criar conta" subtitle="Leva menos de um minuto.">
      <form className="form-grid" onSubmit={submit} noValidate>
        {formError && (
          <div className="form-error" role="alert">
            {formError}
          </div>
        )}
        <Field label="Nome" htmlFor="name" error={errors.name}>
          <input
            id="name"
            className="input"
            autoComplete="name"
            placeholder="Como devemos te chamar?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name || undefined}
            aria-describedby={errors.name ? 'name-error' : undefined}
            autoFocus
          />
        </Field>
        <Field label="E-mail" htmlFor="email" error={errors.email}>
          <input
            id="email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu.nome@unilasalle.edu.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email || undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
        </Field>
        <Field label="Senha" htmlFor="password" error={errors.password} hint="Mínimo de 8 caracteres.">
          <PasswordInput id="password" value={password} onChange={setPassword} invalid={!!errors.password} autoComplete="new-password" />
        </Field>
        <button className="btn btn-navy btn-block" type="submit" disabled={busy}>
          {busy ? <Spinner /> : null} Criar conta
        </button>
        <div className="divider">
          <span>ou</span>
        </div>
        <GoogleButton enabled={config.data?.googleEnabled ?? false} />
      </form>
      <p className="auth-switch">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </AuthFrame>
  );
}
