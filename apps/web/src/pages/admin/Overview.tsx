import { BarChart } from '../../components/charts/BarChart';
import { ErrorState, SkeletonList } from '../../components/ui/bits';
import { formatDayMonth } from '../../lib/dates';
import { useAdminOverview } from '../../lib/queries';

export function AdminOverviewPage() {
  const q = useAdminOverview();
  if (q.isLoading) return <SkeletonList n={2} h={100} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data!;
  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Usuários</div>
          <div className="kpi-value">{o.usersTotal}</div>
          <div className="kpi-sub">{o.usersActive} ativos · {o.adminsTotal} admin</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sessões ativas</div>
          <div className="kpi-value">{o.activeSessions}</div>
          <div className="kpi-sub">dispositivos conectados agora</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Logins hoje</div>
          <div className="kpi-value">{o.loginsToday}</div>
          <div className="kpi-sub">acessos registrados</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Disciplinas</div>
          <div className="kpi-value">{o.subjectsTotal}</div>
          <div className="kpi-sub">{o.messagesTotal} mensagens no tutor</div>
        </div>
      </div>
      <section className="card">
        <div className="card-title">
          <h2>Logins nos últimos 14 dias</h2>
        </div>
        <BarChart
          ariaLabel="Logins por dia"
          data={o.loginsByDay.map((d, i, a) => ({
            label: formatDayMonth(d.date).slice(0, 2),
            value: d.count,
            valueLabel: String(d.count),
            highlight: i === a.length - 1,
          }))}
        />
        <p className="muted small" style={{ marginTop: 8 }}>
          Dia do mês no eixo; datas em UTC.
        </p>
      </section>
    </div>
  );
}
