import {
  Bot,
  BookOpen,
  CalendarDays,
  ChartColumn,
  GraduationCap,
  House,
  LogOut,
  Shield,
  UserRound,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '../../app/auth';
import { useConfig } from '../../lib/queries';
import { initials } from '../../lib/color';
import { storage } from '../../lib/storage';
import { Spinner } from '../ui/bits';
import { Tour } from './Tour';

const MAIN_NAV = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/disciplinas', label: 'Disciplinas', icon: BookOpen },
  { to: '/aulas', label: 'Aulas', icon: CalendarDays },
  { to: '/progresso', label: 'Progresso', icon: ChartColumn },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
];

export function tourKey(userId: number) {
  return `edumind_tour_seen_${userId}`;
}

export function Brand() {
  const config = useConfig();
  return (
    <div className="brand">
      <span className="brand-tile" aria-hidden>
        <GraduationCap size={22} />
      </span>
      <span>{config.data?.appName ?? 'EduMind'}</span>
    </div>
  );
}

export function AppShell() {
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tourOpen, setTourOpen] = useState(() => storage.get(tourKey(user.id)) === null);
  const onTutor = location.pathname.startsWith('/tutor');

  const closeTour = () => {
    storage.set(tourKey(user.id), '1');
    setTourOpen(false);
  };

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <Brand />
        {MAIN_NAV.slice(0, 4).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link">
            <Icon size={20} /> {label}
          </NavLink>
        ))}
        <NavLink to="/tutor" className="nav-link">
          <Bot size={20} /> Tutor IA
        </NavLink>
        <NavLink to="/perfil" className="nav-link">
          <UserRound size={20} /> Perfil
        </NavLink>
        {user.role === 'admin' && (
          <>
            <div className="nav-sep">Administração</div>
            <NavLink to="/admin" className="nav-link">
              <Shield size={20} /> Painel do admin
            </NavLink>
          </>
        )}
        <div className="sidebar-user">
          <span className="avatar" aria-hidden>
            {initials(user.name)}
          </span>
          <div className="truncate" style={{ lineHeight: 1.2 }}>
            <div className="truncate" style={{ fontWeight: 700, fontSize: '.875rem' }}>
              {user.name}
            </div>
            <div className="truncate small" style={{ opacity: 0.7 }}>
              {user.email}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Sair"
            title="Sair"
            onClick={() => void logout().then(() => navigate('/login'))}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <Suspense fallback={<div style={{ padding: 32 }} role="status" aria-label="Carregando"><Spinner size={24} /></div>}>
          <Outlet />
        </Suspense>
      </div>

      {!onTutor && (
        <NavLink to="/tutor" className="fab" aria-label="Abrir o Tutor IA">
          <Bot size={22} /> Tutor IA
        </NavLink>
      )}

      <nav className="bottomnav" aria-label="Navegação principal">
        {MAIN_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>

      {tourOpen && <Tour onClose={closeTour} />}
    </div>
  );
}
