import { Download } from 'lucide-react';
import { useState } from 'react';
import { AccessLogTable, Pager } from '../../components/AccessLogTable';
import { Empty, ErrorState, SkeletonList } from '../../components/ui/bits';
import { qs } from '../../lib/api';
import { History } from 'lucide-react';
import { accessLogQuery, useAdminAccessLogs, type AccessLogFilters } from '../../lib/queries';

export function AdminAccessLogsPage() {
  const [filters, setFilters] = useState<AccessLogFilters>({ q: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const logs = useAdminAccessLogs(filters, page);
  const set = (patch: Partial<AccessLogFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };
  const csv = `/api/admin/access-logs.csv${qs({ ...accessLogQuery(filters), tzOffsetMinutes: -new Date().getTimezoneOffset() })}`;

  return (
    <div className="stack">
      <div className="card filters">
        <div className="field" style={{ flex: '2 1 200px' }}>
          <label htmlFor="log-q">Usuário</label>
          <input id="log-q" className="input" placeholder="Nome ou e-mail" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="log-from">De</label>
          <input id="log-from" type="date" className="input" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="log-to">Até</label>
          <input id="log-to" type="date" className="input" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </div>
        <a className="btn btn-outline" href={csv} download>
          <Download size={18} /> Exportar CSV
        </a>
      </div>
      {logs.isLoading ? (
        <SkeletonList n={5} h={52} />
      ) : logs.isError ? (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : logs.data!.items.length === 0 ? (
        <div className="card">
          <Empty icon={<History size={26} />} title="Nenhum acesso encontrado">
            Ajuste os filtros para ver outros registros.
          </Empty>
        </div>
      ) : (
        <>
          <AccessLogTable items={logs.data!.items} showUser />
          <Pager page={page} pageSize={20} total={logs.data!.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
