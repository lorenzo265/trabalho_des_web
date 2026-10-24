import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { LoginPage } from './Login';

const login = vi.fn();
vi.mock('../app/auth', () => ({ useAuth: () => ({ login, user: null, loading: false }) }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ appName: 'EduMind', aiMode: 'demo', googleEnabled: false, scraperSource: 'mock' }), { status: 200 })));
  });

  it('valida os campos antes de chamar a API', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    expect(await screen.findByText('E-mail inválido.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('envia e-mail normalizado e senha', async () => {
    login.mockResolvedValue(undefined);
    setup();
    await userEvent.type(screen.getByLabelText('E-mail'), '  Aluno@EduMind.local ');
    await userEvent.type(screen.getByLabelText('Senha'), 'aluno12345');
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'aluno@edumind.local', password: 'aluno12345' }));
  });

  it('mostra o erro da API sem expor detalhes', async () => {
    login.mockRejectedValue(new Error('E-mail ou senha incorretos.'));
    setup();
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada123');
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  it('deixa o botão do Google desabilitado quando não configurado', async () => {
    setup();
    expect(screen.getByRole('button', { name: /Google \(em breve\)/i })).toBeDisabled();
  });
});
