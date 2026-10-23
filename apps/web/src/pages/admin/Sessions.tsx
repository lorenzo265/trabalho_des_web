import { useConfirm } from '../../components/ui/Confirm';
import { useToast } from '../../components/ui/Toast';
import { ErrorState, SkeletonList } from '../../components/ui/bits';
import { formatDateTime, relativeTime } from '../../lib/dates';
import { useAdminRevokeSession, useAdminSessions } from '../../lib/queries';

export function AdminSessionsPage() {
  const sessions = useAdminSessions();
  const revoke = useAdminRevokeSession();
  const confirm = useConfirm();
  const toast = useToast();

  if (sessions.isLoading) return <SkeletonList n={4} h={52} />;
  if (sessions.isError) return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;

  async function end(id: number, who: string) {
    const ok = await confirm({ title: 'Encerrar sessão?', message: `${who} será desconectado(a) deste dispositivo.`, confirmLabel: 'Encerrar', danger: true });
    if (ok) revoke.mutate(id, { onSuccess: () => toast.show('Sessão encerrada.'), onError: (e) => toast.error(e) });
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Dispositivo</th>
            <th>IP</th>
            <th>Início</th>
            <th>Último acesso</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {sessions.data!.items.map((s) => (
            <tr key={s.id}>
              <td className="cell-main" data-label="Usuário">
                <div>{s.userName}</div>
                <div className="muted small" style={{ fontWeight: 400 }}>
                  {s.userEmail}
                </div>
              </td>
              <td data-label="Dispositivo">{s.device}</td>
              <td data-label="IP">{s.ip ?? '—'}</td>
              <td data-label="Início">{formatDateTime(s.createdAt)}</td>
              <td data-label="Último acesso">{relativeTime(s.lastSeenAt)}</td>
              <td data-label="Ações">
                <button className="btn btn-danger-ghost btn-sm" onClick={() => void end(s.id, s.userName ?? 'O usuário')}>
                  Encerrar
                </button>
              </td>
            </tr>
          ))}
          {sessions.data!.items.length === 0 && (
            <tr>
              <td data-label="">Nenhuma sessão ativa.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
