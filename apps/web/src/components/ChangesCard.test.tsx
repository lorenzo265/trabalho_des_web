import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useChanges } from '../lib/queries';
import { fakeChange, renderWithProviders, stubApi } from '../test/utils';
import { ChangesCard, ChangesNotice } from './ChangesCard';

describe('ChangesCard', () => {
  it('lista as novidades com texto legível e destaca as não vistas', async () => {
    stubApi({
      'GET /api/changes': {
        unseen: 1,
        items: [
          fakeChange({ id: 2, kind: 'grade_posted', title: 'Prova 1', oldValue: null, newValue: '9', seen: false }),
          fakeChange({ id: 1, seen: true }),
        ],
      },
    });
    renderWithProviders(<ChangesCard />);
    const list = await screen.findByRole('list', { name: 'Novidades' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Nota lançada');
    expect(items[0]).toHaveTextContent('Prova 1: 9');
    expect(items[0]).toHaveTextContent('novo');
    expect(items[1]).toHaveTextContent('Prazo alterado');
    expect(items[1]).toHaveTextContent('Projeto G2: 23/10 → 30/10');
    expect(items[1]).not.toHaveTextContent('novo');
    expect(screen.getByText('1 nova')).toBeInTheDocument();
  });

  it('marcar como vistas chama a API e atualiza a lista', async () => {
    let seen = false;
    const api = stubApi({
      'GET /api/changes': () => ({ unseen: seen ? 0 : 1, items: [fakeChange({ seen })] }),
      'POST /api/changes/seen': () => ((seen = true), null),
    });
    renderWithProviders(<ChangesCard />);
    await userEvent.click(await screen.findByRole('button', { name: /marcar como vistas/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /marcar como vistas/i })).not.toBeInTheDocument());
    expect(api.called('POST /api/changes/seen')).toHaveLength(1);
    expect(screen.queryByText('1 nova')).not.toBeInTheDocument();
  });

  it('mostra só 5 e expande o resto sob demanda', async () => {
    const items = Array.from({ length: 8 }, (_, i) => fakeChange({ id: 100 - i, title: `Trabalho ${i + 1}`, seen: true }));
    stubApi({ 'GET /api/changes': { unseen: 0, items } });
    renderWithProviders(<ChangesCard />);
    const list = await screen.findByRole('list', { name: 'Novidades' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais (3)' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar menos' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('sem novidades, explica quando elas aparecem', async () => {
    stubApi({ 'GET /api/changes': { unseen: 0, items: [] } });
    renderWithProviders(<ChangesCard />);
    expect(await screen.findByText('Nenhuma novidade por enquanto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como vistas/i })).not.toBeInTheDocument();
  });

  it('erro da API vira estado de erro com tentar de novo', async () => {
    stubApi({}); // sem rota: 404
    renderWithProviders(<ChangesCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('sem rota no teste: GET /api/changes');
  });
});

describe('ChangesNotice', () => {
  it('aparece no singular e no plural, e leva para Aulas', async () => {
    stubApi({ 'GET /api/changes': { unseen: 1, items: [] } });
    const { unmount } = renderWithProviders(<ChangesNotice />);
    const link = await screen.findByRole('link', { name: /1 novidades da faculdade/i });
    expect(link).toHaveAttribute('href', '/aulas');
    expect(link).toHaveTextContent('1 novidade da faculdade');
    unmount();

    stubApi({ 'GET /api/changes': { unseen: 4, items: [] } });
    renderWithProviders(<ChangesNotice />);
    expect(await screen.findByRole('link')).toHaveTextContent('4 novidades da faculdade');
  });

  it('não aparece quando não há nada novo (e só afirma isso depois de a consulta terminar)', async () => {
    stubApi({ 'GET /api/changes': { unseen: 0, items: [] } });
    // A sonda usa a mesma consulta e só mostra "carregou" quando os dados chegaram.
    function Probe() {
      return useChanges().isSuccess ? <span>carregou</span> : null;
    }
    renderWithProviders(
      <>
        <ChangesNotice />
        <Probe />
      </>,
    );
    expect(await screen.findByText('carregou')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
