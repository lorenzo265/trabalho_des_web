import { NavLink, Outlet } from 'react-router-dom';
import { Page } from '../../components/layout/Page';
import { HELP } from '../../lib/help';

const TABS = [
  { to: '/admin', label: 'Visão geral', end: true },
  { to: '/admin/usuarios', label: 'Usuários' },
  { to: '/admin/acessos', label: 'Log de acessos' },
  { to: '/admin/sessoes', label: 'Sessões ativas' },
];

export function AdminLayout() {
  return (
    <Page title="Administração" back="/perfil" help={HELP.admin}>
      <nav className="tabs" aria-label="Seções da administração">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </Page>
  );
}
