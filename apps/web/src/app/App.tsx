import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/Dashboard';
import { LessonsPage } from '../pages/Lessons';
import { LoginPage } from '../pages/Login';
import { ProfilePage } from '../pages/Profile';
import { ProgressPage } from '../pages/Progress';
import { RegisterPage } from '../pages/Register';
import { SubjectDetailPage } from '../pages/SubjectDetail';
import { SubjectsPage } from '../pages/Subjects';
import { PublicOnly, RequireAdmin, RequireAuth } from './guards';

// Tutor (react-markdown) e Admin só são baixados quando a rota é aberta.
const lazyNamed = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(async () => ({ default: (await load())[key] }));
const TutorPage = lazyNamed(() => import('../pages/Tutor'), 'TutorPage');
const AdminLayout = lazyNamed(() => import('../pages/admin/AdminLayout'), 'AdminLayout');
const AdminOverviewPage = lazyNamed(() => import('../pages/admin/Overview'), 'AdminOverviewPage');
const AdminUsersPage = lazyNamed(() => import('../pages/admin/Users'), 'AdminUsersPage');
const AdminAccessLogsPage = lazyNamed(() => import('../pages/admin/AccessLogs'), 'AdminAccessLogsPage');
const AdminSessionsPage = lazyNamed(() => import('../pages/admin/Sessions'), 'AdminSessionsPage');

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="disciplinas" element={<SubjectsPage />} />
          <Route path="disciplinas/:id" element={<SubjectDetailPage />} />
          <Route path="aulas" element={<LessonsPage />} />
          <Route path="tutor/:threadId?" element={<TutorPage />} />
          <Route path="progresso" element={<ProgressPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="usuarios" element={<AdminUsersPage />} />
              <Route path="acessos" element={<AdminAccessLogsPage />} />
              <Route path="sessoes" element={<AdminSessionsPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
