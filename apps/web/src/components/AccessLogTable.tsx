import type { AccessLogEntry } from '@edumind/contracts';
import { formatDateBR, formatMinutes, formatTime } from '../lib/dates';

const REASON: Record<string, string> = {
  manual: 'Saiu do app',
  expired: 'Sessão expirada',
  revoked: 'Dispositivo desconectado',
  admin: 'Encerrada pelo admin',
};
const METHOD: Record<string, string> = { password: 'E-mail e senha', google: 'Google' };

/** Log de acesso: nome do usuário, data, hora de login e hora de logout. */
export function AccessLogTable({ items, showUser }: { items: AccessLogEntry[]; showUser?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {showUser && <th>Usuário</th>}
            <th>Data</th>
            <th>Login</th>
            <th>Logout</th>
            <th>Duração</th>
            <th>Dispositivo</th>
            {showUser && <th>Método</th>}
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              {showUser && (
                <td className="cell-main" data-label="Usuário">
                  <div>{e.userName}</div>
                  <div className="muted small" style={{ fontWeight: 400 }}>
                    {e.userEmail}
                  </div>
                </td>
              )}
              <td data-label="Data" className={showUser ? '' : 'cell-main'}>
                {formatDateBR(e.loginAt)}
              </td>
              <td data-label="Login" className="nowrap">
                {formatTime(e.loginAt)}
              </td>
              <td data-label="Logout" className="nowrap">
                {e.logoutAt ? formatTime(e.logoutAt) : '—'}
              </td>
              <td data-label="Duração" className="nowrap">
                {e.logoutAt ? formatMinutes((new Date(e.logoutAt).getTime() - new Date(e.loginAt).getTime()) / 60000) : '—'}
              </td>
              <td data-label="Dispositivo">{e.device}</td>
              {showUser && <td data-label="Método">{METHOD[e.method] ?? e.method}</td>}
              <td data-label="Situação">
                {e.logoutAt ? <span className="badge">{REASON[e.logoutReason ?? 'manual'] ?? 'Encerrada'}</span> : <span className="badge badge-success">Em andamento</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
      <span className="muted small">
        Página {page + 1} de {pages} · {total} registros
      </span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <button className="btn btn-outline btn-sm" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}
