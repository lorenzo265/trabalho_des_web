import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { formatHours } from '../lib/dates';
import { fakeAccess, fakeDevice, fakeUser, renderWithProviders, stubApi } from '../test/utils';
import { ProfilePage } from './Profile';

let currentUser = fakeUser();
const logout = vi.fn(async () => undefined);
vi.mock('../app/auth', () => ({ useUser: () => currentUser, useAuth: () => ({ logout }) }));

function routes(extra: Record<string, unknown> = {}) {
  return {
    'GET /api/me/sessions': { items: [fakeDevice({ id: 1, current: true }), fakeDevice({ id: 2, device: 'Safari · iPhone', current: false, ip: null })] },
    'GET /api/me/access-log': { items: [fakeAccess({ id: 1 }), fakeAccess({ id: 2, device: 'Safari · iPhone', logoutAt: '2026-11-06T13:00:00.000Z', logoutReason: 'manual' })], total: 2 },
    ...extra,
  };
}

describe('ProfilePage', () => {
  beforeEach(() => {
    currentUser = fakeUser();
    logout.mockClear();
  });

  it('mostra os dados da conta e esconde a área do administrador de quem não é admin', async () => {
    stubApi(routes());
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByRole('heading', { name: 'Gustavo Peixoto' })).toBeInTheDocument();
    expect(screen.getByText('aluno@edumind.local')).toBeInTheDocument();
    expect(screen.getByText('Ensino superior')).toBeInTheDocument();
    expect(screen.getByText(`Meta: ${formatHours(600)}/semana`)).toBeInTheDocument();
    expect(screen.queryByText('Área do administrador')).not.toBeInTheDocument();
    expect(screen.queryByText('Administrador')).not.toBeInTheDocument();
  });

  it('administrador vê o selo e o atalho para a área admin', async () => {
    currentUser = fakeUser({ role: 'admin' });
    stubApi(routes());
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText('Administrador')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Área do administrador/ })).toHaveAttribute('href', '/admin');
  });

  it('lista os dispositivos: o atual não pode ser desconectado, os outros podem', async () => {
    stubApi(routes());
    renderWithProviders(<ProfilePage />);
    const devices = within(await screen.findByRole('region', { name: 'Dispositivos conectados' }));
    const items = await devices.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Chrome · Windows');
    expect(items[0]).toHaveTextContent('Este dispositivo');
    expect(within(items[0]!).queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Safari · iPhone');
    expect(within(items[1]!).getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
  });

  it('desconectar pede confirmação; cancelar não faz nada, confirmar encerra a sessão', async () => {
    const api = stubApi(routes({ 'DELETE /api/me/sessions/2': null }));
    renderWithProviders(<ProfilePage />);
    const disconnect = await screen.findByRole('button', { name: 'Desconectar' });

    await userEvent.click(disconnect);
    expect(screen.getByRole('dialog')).toHaveTextContent('O acesso em "Safari · iPhone" será encerrado');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.called('DELETE /api/me/sessions/2')).toHaveLength(0);

    await userEvent.click(disconnect);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desconectar' }));
    await waitFor(() => expect(api.called('DELETE /api/me/sessions/2')).toHaveLength(1));
    expect(await screen.findByText('Dispositivo desconectado.')).toBeInTheDocument();
  });

  it('mostra o histórico de acessos (log do aluno)', async () => {
    stubApi(routes());
    renderWithProviders(<ProfilePage />);
    const section = within(await screen.findByRole('region', { name: 'Meus acessos' }));
    expect((await section.findAllByRole('row')).length).toBeGreaterThanOrEqual(3); // cabeçalho + 2 acessos
    expect(section.getAllByText(/Chrome · Windows/).length).toBeGreaterThan(0);
  });

  it('sem acessos registrados, avisa', async () => {
    stubApi(routes({ 'GET /api/me/access-log': { items: [], total: 0 } }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText('Nenhum acesso registrado')).toBeInTheDocument();
  });

  it('editar perfil: valida o nome e envia nome e nível', async () => {
    const api = stubApi(routes({ 'PATCH /api/me': (c: { body: Record<string, unknown> }) => ({ user: fakeUser(c.body) }) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    const name = screen.getByLabelText('Nome');
    await userEvent.clear(name);
    await userEvent.type(name, 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe seu nome.')).toBeInTheDocument();
    expect(api.called('PATCH /api/me')).toHaveLength(0);

    await userEvent.clear(name);
    await userEvent.type(name, '  Gustavo P.  ');
    await userEvent.selectOptions(screen.getByLabelText('Nível de estudo'), 'concurso');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.called('PATCH /api/me')).toHaveLength(1));
    expect(api.called('PATCH /api/me')[0]!.body).toEqual({ name: 'Gustavo P.', level: 'concurso' });
    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
  });

  it('sair da conta chama o logout', async () => {
    stubApi(routes());
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole('button', { name: /Sair da conta/ }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
