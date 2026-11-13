import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fakeAccess, fakeAdminOverview, fakeAdminUser, fakeDevice, fakeUser, jsonError, renderWithProviders, stubApi } from '../../test/utils';
import { AdminAccessLogsPage } from './AccessLogs';
import { AdminLayout } from './AdminLayout';
import { AdminOverviewPage } from './Overview';
import { AdminSessionsPage } from './Sessions';
import { AdminUsersPage } from './Users';

vi.mock('../../app/auth', () => ({ useAuth: () => ({ user: fakeUser({ id: 1, role: 'admin', name: 'Admin' }) }) }));

describe('AdminLayout', () => {
  it('mostra o título e as quatro seções', () => {
    renderWithProviders(<AdminLayout />, { route: '/admin', path: '/admin' });
    expect(screen.getByRole('heading', { name: 'Administração' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Seções da administração' })).getAllByRole('link');
    expect(tabs.map((t) => [t.textContent, t.getAttribute('href')])).toEqual([
      ['Visão geral', '/admin'],
      ['Usuários', '/admin/usuarios'],
      ['Log de acessos', '/admin/acessos'],
      ['Sessões ativas', '/admin/sessoes'],
    ]);
  });
});

describe('AdminOverviewPage', () => {
  it('mostra os indicadores e o gráfico de logins', async () => {
    stubApi({ 'GET /api/admin/overview': fakeAdminOverview() });
    renderWithProviders(<AdminOverviewPage />);
    const kpi = async (label: string) => (await screen.findByText(label)).closest('.kpi') as HTMLElement;
    expect(within(await kpi('Usuários')).getByText('5')).toBeInTheDocument();
    expect(await kpi('Usuários')).toHaveTextContent('4 ativos · 1 admin');
    expect(await kpi('Sessões ativas')).toHaveTextContent('3');
    expect(await kpi('Logins hoje')).toHaveTextContent('7');
    expect(await kpi('Disciplinas')).toHaveTextContent('12');
    expect(await kpi('Disciplinas')).toHaveTextContent('40 mensagens no tutor');
    expect(screen.getByRole('img', { name: /^Logins por dia\. / })).toBeInTheDocument(); // o rótulo acessível traz o resumo dos dados
  });

  it('erro (ex.: sem permissão) mostra a mensagem da API', async () => {
    stubApi({ 'GET /api/admin/overview': jsonError(403, 'forbidden', 'Acesso restrito a administradores.') });
    renderWithProviders(<AdminOverviewPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso restrito a administradores.');
  });
});

describe('AdminUsersPage', () => {
  const me = fakeAdminUser({ id: 1, name: 'Admin', email: 'admin@edumind.local', role: 'admin' });
  const maria = fakeAdminUser({ id: 2 });
  const blocked = fakeAdminUser({ id: 3, name: 'João Bloqueado', email: 'joao@edumind.local', isActive: false, lastLoginAt: null, activeSessions: 0 });
  const listRoute = { 'GET /api/admin/users': { items: [me, maria, blocked], total: 3 } };

  it('lista os usuários; você mesmo não pode se bloquear, excluir nem mudar o próprio papel', async () => {
    stubApi(listRoute);
    renderWithProviders(<AdminUsersPage />);
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(4); // cabeçalho + 3
    const mine = within(rows[1]!);
    expect(mine.getByText('você')).toBeInTheDocument();
    expect(mine.getByRole('button', { name: 'Bloquear' })).toBeDisabled();
    expect(mine.getByRole('button', { name: 'Excluir Admin' })).toBeDisabled();
    expect(mine.getByLabelText('Papel de Admin')).toBeDisabled();

    const others = within(rows[2]!);
    expect(others.getByText('Ativo')).toBeInTheDocument();
    expect(others.getByRole('button', { name: 'Bloquear' })).toBeEnabled();
    expect(within(rows[3]!).getByText('Bloqueado')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('nunca')).toBeInTheDocument();
  });

  it('bloquear pede confirmação (cancelar não faz nada); ativar não pede', async () => {
    const api = stubApi({
      ...listRoute,
      'PATCH /api/admin/users/2': fakeAdminUser({ id: 2, isActive: false }),
      'PATCH /api/admin/users/3': fakeAdminUser({ id: 3, isActive: true }),
    });
    renderWithProviders(<AdminUsersPage />);
    const rows = await screen.findAllByRole('row');

    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Bloquear' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Maria Souza perderá o acesso');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.called('PATCH /api/admin/users/2')).toHaveLength(0);

    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Bloquear' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(api.called('PATCH /api/admin/users/2')).toHaveLength(1));
    expect(api.called('PATCH /api/admin/users/2')[0]!.body).toEqual({ isActive: false });

    await userEvent.click(within(rows[3]!).getByRole('button', { name: 'Ativar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.called('PATCH /api/admin/users/3')).toHaveLength(1));
    expect(api.called('PATCH /api/admin/users/3')[0]!.body).toEqual({ isActive: true });
  });

  it('muda o papel pelo seletor', async () => {
    const api = stubApi({ ...listRoute, 'PATCH /api/admin/users/2': fakeAdminUser({ id: 2, role: 'admin' }) });
    renderWithProviders(<AdminUsersPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Papel de Maria Souza'), 'admin');
    await waitFor(() => expect(api.called('PATCH /api/admin/users/2')).toHaveLength(1));
    expect(api.called('PATCH /api/admin/users/2')[0]!.body).toEqual({ role: 'admin' });
  });

  it('excluir pede confirmação, avisa que o histórico de acessos é mantido e confirma com aviso', async () => {
    let items = [me, maria];
    const api = stubApi({ 'GET /api/admin/users': () => ({ items, total: items.length }), 'DELETE /api/admin/users/2': () => ((items = [me]), null) });
    renderWithProviders(<AdminUsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Maria Souza' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('O histórico de acessos é mantido.');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(api.called('DELETE /api/admin/users/2')).toHaveLength(1));
    expect(await screen.findByText('Usuário excluído.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Maria Souza')).not.toBeInTheDocument());
  });

  it('busca por nome ou e-mail refaz a consulta', async () => {
    const api = stubApi(listRoute);
    renderWithProviders(<AdminUsersPage />);
    await userEvent.type(await screen.findByLabelText('Buscar usuário'), 'maria');
    await waitFor(() => expect(api.called('GET /api/admin/users').at(-1)!.query).toContain('q=maria'));
    expect(api.called('GET /api/admin/users').at(-1)!.query).toContain('limit=20');
  });

  it('pagina quando passa de 20 usuários', async () => {
    const api = stubApi({ 'GET /api/admin/users': { items: [maria], total: 45 } });
    renderWithProviders(<AdminUsersPage />);
    expect(await screen.findByText('Página 1 de 3 · 45 registros')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(api.called('GET /api/admin/users').at(-1)!.query).toContain('offset=20'));
    expect(await screen.findByText('Página 2 de 3 · 45 registros')).toBeInTheDocument();
  });

  it('erro de API ao bloquear mostra aviso', async () => {
    stubApi({ ...listRoute, 'PATCH /api/admin/users/2': jsonError(409, 'last_admin', 'Não é possível bloquear o último administrador.') });
    renderWithProviders(<AdminUsersPage />);
    await userEvent.click(within((await screen.findAllByRole('row'))[2]!).getByRole('button', { name: 'Bloquear' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByText('Não é possível bloquear o último administrador.')).toBeInTheDocument();
  });
});

describe('AdminAccessLogsPage', () => {
  const entries = {
    items: [fakeAccess({ id: 1, userName: 'Maria Souza', userEmail: 'maria@edumind.local' }), fakeAccess({ id: 2, userName: 'João', userEmail: 'joao@edumind.local', method: 'google', logoutAt: '2026-11-06T13:30:00.000Z', logoutReason: 'admin' })],
    total: 2,
  };

  it('mostra o log com usuário, método e situação', async () => {
    stubApi({ 'GET /api/admin/access-logs': entries });
    renderWithProviders(<AdminAccessLogsPage />);
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Maria Souza');
    expect(rows[1]).toHaveTextContent('Em andamento');
    expect(rows[1]).toHaveTextContent('E-mail e senha');
    expect(rows[2]).toHaveTextContent('Google');
    expect(rows[2]).toHaveTextContent('Encerrada pelo admin');
  });

  it('os filtros entram na consulta e no link do CSV (com o fuso do navegador)', async () => {
    const api = stubApi({ 'GET /api/admin/access-logs': entries });
    renderWithProviders(<AdminAccessLogsPage />);
    await userEvent.type(await screen.findByLabelText('Usuário'), 'maria');
    await userEvent.type(screen.getByLabelText('De'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('Até'), '2026-11-06');
    await waitFor(() => {
      const q = api.called('GET /api/admin/access-logs').at(-1)!.query;
      expect(q).toContain('q=maria');
      expect(q).toContain('from=2026-11-01');
      expect(q).toContain('to=2026-11-06');
    });
    const href = screen.getByRole('link', { name: /Exportar CSV/ }).getAttribute('href')!;
    expect(href).toMatch(/^\/api\/admin\/access-logs\.csv\?/);
    expect(href).toContain('q=maria');
    expect(href).toContain('from=2026-11-01');
    expect(href).toContain('tzOffsetMinutes=');
  });

  it('sem resultados, pede para ajustar os filtros', async () => {
    stubApi({ 'GET /api/admin/access-logs': { items: [], total: 0 } });
    renderWithProviders(<AdminAccessLogsPage />);
    expect(await screen.findByText('Nenhum acesso encontrado')).toBeInTheDocument();
  });
});

describe('AdminSessionsPage', () => {
  const sessions = (items: unknown[]) => ({ items, total: items.length });
  const row = (id: number, over: Record<string, unknown> = {}) => fakeDevice({ id, current: false, userId: 2, userName: 'Maria Souza', userEmail: 'maria@edumind.local', ...over });

  it('lista as sessões e encerra uma depois de confirmar', async () => {
    let items = [row(5, { device: 'Safari · iPhone', ip: null }), row(6)];
    const api = stubApi({ 'GET /api/admin/sessions': () => sessions(items), 'DELETE /api/admin/sessions/5': () => ((items = items.filter((s) => (s as { id: number }).id !== 5)), null) });
    renderWithProviders(<AdminSessionsPage />);
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Safari · iPhone');
    expect(rows[1]).toHaveTextContent('—'); // sem IP

    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Encerrar' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Maria Souza será desconectado(a) deste dispositivo.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.called('DELETE /api/admin/sessions/5')).toHaveLength(0);

    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Encerrar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(api.called('DELETE /api/admin/sessions/5')).toHaveLength(1));
    expect(await screen.findByText('Sessão encerrada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
  });

  it('sem sessões, avisa', async () => {
    stubApi({ 'GET /api/admin/sessions': sessions([]) });
    renderWithProviders(<AdminSessionsPage />);
    expect(await screen.findByText('Nenhuma sessão ativa.')).toBeInTheDocument();
  });
});
