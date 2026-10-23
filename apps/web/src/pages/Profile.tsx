import { Globe, History, LogOut, Monitor, Shield, Smartphone, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '../app/auth';
import { AccessLogTable, Pager } from '../components/AccessLogTable';
import { Page } from '../components/layout/Page';
import { Tour } from '../components/layout/Tour';
import { Modal } from '../components/ui/Modal';
import { Empty, Field, SkeletonList, Spinner } from '../components/ui/bits';
import { useConfirm } from '../components/ui/Confirm';
import { useToast } from '../components/ui/Toast';
import { initials } from '../lib/color';
import { formatHours, relativeTime } from '../lib/dates';
import { HELP } from '../lib/help';
import { useMyAccessLog, useMySessions, useRevokeMySession, useUpdateProfile } from '../lib/queries';

const LEVELS = [
  { value: 'medio', label: 'Ensino médio' },
  { value: 'superior', label: 'Ensino superior' },
  { value: 'concurso', label: 'Concurso' },
] as const;

function EditProfile({ onClose }: { onClose: () => void }) {
  const user = useUser();
  const update = useUpdateProfile();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [level, setLevel] = useState<(typeof LEVELS)[number]['value']>(user.level);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Informe seu nome.');
    try {
      await update.mutateAsync({ name: name.trim(), level });
      toast.show('Perfil atualizado.');
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal
      title="Editar perfil"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" form="profile-form" disabled={update.isPending}>
            {update.isPending && <Spinner />} Salvar
          </button>
        </>
      }
    >
      <form id="profile-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Nome" htmlFor="pf-name" error={error}>
          <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Nível de estudo" htmlFor="pf-level" hint="Ajuda o Tutor a escolher a profundidade das explicações.">
          <select id="pf-level" className="select" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function deviceIcon(device: string) {
  return /android|iphone|ipad|ios/i.test(device) ? <Smartphone size={22} /> : /desconhecido/i.test(device) ? <Globe size={22} /> : <Monitor size={22} />;
}

export function ProfilePage() {
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const sessions = useMySessions();
  const revoke = useRevokeMySession();
  const [page, setPage] = useState(0);
  const access = useMyAccessLog(page, 8);
  const [editing, setEditing] = useState(false);
  const [tour, setTour] = useState(false);

  async function disconnect(id: number, device: string) {
    const ok = await confirm({ title: 'Desconectar dispositivo?', message: `O acesso em "${device}" será encerrado. Para voltar, será preciso entrar de novo.`, confirmLabel: 'Desconectar', danger: true });
    if (ok) revoke.mutate(id, { onSuccess: () => toast.show('Dispositivo desconectado.'), onError: (e) => toast.error(e) });
  }

  return (
    <Page title="Perfil" help={HELP.profile}>
      <section className="card profile-head">
        <span className="avatar avatar-lg" aria-hidden>
          {initials(user.name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="truncate">{user.name}</h2>
          <div className="muted truncate">{user.email}</div>
          <div className="row-wrap" style={{ marginTop: 8 }}>
            <span className="badge">{LEVELS.find((l) => l.value === user.level)?.label}</span>
            <span className="badge">Meta: {formatHours(user.weeklyGoalMinutes)}/semana</span>
            {user.role === 'admin' && <span className="badge badge-info">Administrador</span>}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
          Editar
        </button>
      </section>

      {user.role === 'admin' && (
        <Link to="/admin" className="card admin-link">
          <Shield size={22} aria-hidden />
          <div style={{ flex: 1 }}>
            <strong>Área do administrador</strong>
            <div className="muted small">Usuários, log de acessos e sessões ativas</div>
          </div>
          <span aria-hidden>›</span>
        </Link>
      )}

      <section className="card" aria-labelledby="h-devices">
        <div className="card-title">
          <h2 id="h-devices">Dispositivos conectados</h2>
        </div>
        <p className="muted small" style={{ marginTop: -6, marginBottom: 10 }}>
          Você pode entrar em qualquer aparelho com o mesmo e-mail e senha. Seus dados ficam na conta, não no aparelho.
        </p>
        {sessions.isLoading ? (
          <SkeletonList n={2} h={60} />
        ) : (
          <ul className="stack-sm">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id} className="device">
                <span className="device-icon" aria-hidden>
                  {deviceIcon(s.device)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-wrap" style={{ gap: 8 }}>
                    <strong>{s.device}</strong>
                    {s.current && <span className="badge badge-success">Este dispositivo</span>}
                  </div>
                  <div className="muted small">
                    Último acesso {relativeTime(s.lastSeenAt)}
                    {s.ip ? ` · IP ${s.ip}` : ''}
                  </div>
                </div>
                {!s.current && (
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => void disconnect(s.id, s.device)}>
                    Desconectar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-access">
        <div className="section-head">
          <h2 id="h-access" className="section-title" style={{ marginBottom: 0 }}>
            Meus acessos
          </h2>
        </div>
        {access.isLoading ? (
          <SkeletonList n={3} h={48} />
        ) : (access.data?.items ?? []).length === 0 ? (
          <div className="card">
            <Empty icon={<History size={26} />} title="Nenhum acesso registrado" />
          </div>
        ) : (
          <>
            <AccessLogTable items={access.data!.items} />
            <Pager page={page} pageSize={8} total={access.data!.total} onChange={setPage} />
          </>
        )}
      </section>

      <section className="card row-wrap" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-outline" onClick={() => setTour(true)}>
          <Sparkles size={18} /> Rever apresentação inicial
        </button>
        <button className="btn btn-danger-ghost" onClick={() => void logout().then(() => navigate('/login'))}>
          <LogOut size={18} /> Sair da conta
        </button>
      </section>

      {editing && <EditProfile onClose={() => setEditing(false)} />}
      {tour && <Tour onClose={() => setTour(false)} />}
    </Page>
  );
}
