import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AdminLayout } from '../pages/admin/AdminLayout';
import { AdminAccessLogsPage } from '../pages/admin/AccessLogs';
import { AdminOverviewPage } from '../pages/admin/Overview';
import { AdminSessionsPage } from '../pages/admin/Sessions';
import { AdminUsersPage } from '../pages/admin/Users';
import { DashboardPage } from '../pages/Dashboard';
import { LessonsPage } from '../pages/Lessons';
import { LoginPage } from '../pages/Login';
import { ProfilePage } from '../pages/Profile';
import { ProgressPage } from '../pages/Progress';
import { RegisterPage } from '../pages/Register';
import { SubjectDetailPage } from '../pages/SubjectDetail';
import { SubjectsPage } from '../pages/Subjects';
import { TutorPage } from '../pages/Tutor';
import { PublicOnly, RequireAdmin, RequireAuth } from './guards';

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
