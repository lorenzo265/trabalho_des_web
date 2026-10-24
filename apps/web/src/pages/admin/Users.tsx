import type { AdminUserRow } from '@edumind/contracts';
import { Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../app/auth';
import { Pager } from '../../components/AccessLogTable';
import { useConfirm } from '../../components/ui/Confirm';
import { useToast } from '../../components/ui/Toast';
import { ErrorState, SkeletonList } from '../../components/ui/bits';
import { formatDateTime, relativeTime } from '../../lib/dates';
import { useAdminUserMutations, useAdminUsers } from '../../lib/queries';

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const users = useAdminUsers(q, page);
  const { patch, remove } = useAdminUserMutations();
  const confirm = useConfirm();
  const toast = useToast();

  async function toggleActive(u: AdminUserRow) {
    if (u.isActive) {
      const ok = await confirm({ title: 'Bloquear usuário?', message: `${u.name} perderá o acesso e todas as sessões abertas serão encerradas.`, confirmLabel: 'Bloquear', danger: true });
      if (!ok) return;
    }
    patch.mutate({ id: u.id, patch: { isActive: !u.isActive } }, { onError: (e) => toast.error(e) });
  }

  async function del(u: AdminUserRow) {
    const ok = await confirm({ title: 'Excluir usuário?', message: `A conta de ${u.name} e todos os dados dela serão apagados. O histórico de acessos é mantido.`, confirmLabel: 'Excluir', danger: true });
    if (ok) remove.mutate(u.id, { onSuccess: () => toast.show('Usuário excluído.'), onError: (e) => toast.error(e) });
  }

  return (
    <div className="stack">
      <div className="input-wrap" style={{ maxWidth: 420 }}>
        <label htmlFor="user-search" className="sr-only">
          Buscar usuário
        </label>
        <input id="user-search" className="input" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Search size={18} className="input-action" style={{ right: 14 }} aria-hidden />
      </div>
      {users.isLoading ? (
        <SkeletonList n={4} h={56} />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Papel</th>
                  <th>Situação</th>
                  <th>Último acesso</th>
                  <th>Sessões</th>
                  <th>Disciplinas</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.data!.items.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td className="cell-main" data-label="Usuário">
                        <div>
                          {u.name} {self && <span className="badge badge-info">você</span>}
                        </div>
                        <div className="muted small" style={{ fontWeight: 400 }}>
                          {u.email}
                        </div>
                      </td>
                      <td data-label="Papel">
                        <select
                          className="select select-sm"
                          style={{ width: 'auto' }}
                          aria-label={`Papel de ${u.name}`}
                          value={u.role}
                          disabled={self}
                          onChange={(e) => patch.mutate({ id: u.id, patch: { role: e.target.value as 'user' | 'admin' } }, { onError: (err) => toast.error(err) })}
                        >
                          <option value="user">Usuário</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </td>
                      <td data-label="Situação">{u.isActive ? <span className="badge badge-success">Ativo</span> : <span className="badge badge-danger">Bloqueado</span>}</td>
                      <td data-label="Último acesso" title={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : undefined}>
                        {u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'nunca'}
                      </td>
                      <td data-label="Sessões">{u.activeSessions}</td>
                      <td data-label="Disciplinas">{u.subjectsCount}</td>
                      <td data-label="Ações">
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn btn-outline btn-sm" disabled={self} onClick={() => void toggleActive(u)}>
                            {u.isActive ? 'Bloquear' : 'Ativar'}
                          </button>
                          <button className="btn btn-danger-ghost btn-sm btn-icon" disabled={self} aria-label={`Excluir ${u.name}`} onClick={() => void del(u)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={20} total={users.data!.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
