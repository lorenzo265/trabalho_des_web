import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeSubject, renderWithProviders, stubApi } from '../test/utils';
import { SubjectsPage } from './Subjects';

const addButtons = () => screen.getAllByRole('button', { name: /adicionar (nova )?mat[ée]ria/i });

describe('SubjectsPage', () => {
  it('lista as disciplinas com progresso, origem e professor/local', async () => {
    stubApi({
      'GET /api/subjects': {
        items: [
          fakeSubject({ id: 1, name: 'Banco de Dados', topicCount: 4, doneCount: 1 }),
          fakeSubject({ id: 2, name: 'Redes', professor: null, room: null, topicCount: 0, doneCount: 0, source: 'scraper' }),
        ],
      },
    });
    renderWithProviders(<SubjectsPage />);
    const cards = await screen.findAllByRole('link');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('href', '/disciplinas/1');
    expect(cards[0]).toHaveTextContent('Banco de Dados');
    expect(cards[0]).toHaveTextContent('Prof. Marcos — Lab 2');
    expect(cards[0]).toHaveTextContent('1/4 tópicos');
    expect(cards[0]).not.toHaveTextContent('Sincronizada');
    expect(cards[1]).toHaveTextContent('Sincronizada');
    expect(cards[1]).toHaveTextContent('Sem professor/local informado');
    expect(cards[1]).toHaveTextContent('sem tópicos');
    expect(within(cards[0]!).getByRole('progressbar', { name: 'Progresso em Banco de Dados' })).toBeInTheDocument();
  });

  it('sem disciplinas, convida a cadastrar ou sincronizar', async () => {
    stubApi({ 'GET /api/subjects': { items: [] } });
    renderWithProviders(<SubjectsPage />);
    expect(await screen.findByText('Cadastre sua primeira matéria')).toBeInTheDocument();
    expect(screen.getByText(/use "Sincronizar" na tela Aulas/i)).toBeInTheDocument();
  });

  it('erro da API mostra o estado de erro com "tentar de novo" que recarrega', async () => {
    let fail = true;
    const api = stubApi({
      'GET /api/subjects': () => (fail ? new Response(JSON.stringify({ error: { code: 'x', message: 'Servidor fora do ar.' } }), { status: 500 }) : { items: [fakeSubject()] }),
    });
    renderWithProviders(<SubjectsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('Banco de Dados')).toBeInTheDocument();
    expect(api.called('GET /api/subjects').length).toBeGreaterThanOrEqual(2);
  });

  it('cria uma disciplina: valida o nome, envia o corpo certo e atualiza a lista', async () => {
    const items: unknown[] = [];
    const api = stubApi({
      'GET /api/subjects': () => ({ items }),
      'POST /api/subjects': (c) => {
        const created = fakeSubject({ id: 9, ...(c.body as object), topicCount: 0, doneCount: 0 });
        items.push(created);
        return created;
      },
    });
    renderWithProviders(<SubjectsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: /adicionar mat[ée]ria/i }))[0]!);

    // 1) nome vazio: erro de validação e nada é enviado
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o nome da disciplina.')).toBeInTheDocument();
    expect(api.called('POST /api/subjects')).toHaveLength(0);

    // 2) preenche e salva
    await userEvent.type(screen.getByLabelText('Nome da disciplina'), '  Física  ');
    await userEvent.type(screen.getByLabelText(/Professor/), 'Profa. Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.called('POST /api/subjects')).toHaveLength(1));
    expect(api.called('POST /api/subjects')[0]!.body).toMatchObject({ name: 'Física', professor: 'Profa. Ana', room: null });
    expect(await screen.findByText('Disciplina adicionada.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Física/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // modal fechou
  });

  it('nome repetido (409) aparece no formulário e o modal continua aberto', async () => {
    stubApi({
      'GET /api/subjects': { items: [fakeSubject()] },
      'POST /api/subjects': new Response(JSON.stringify({ error: { code: 'name_taken', message: 'Você já tem uma disciplina com esse nome.' } }), { status: 409 }),
    });
    renderWithProviders(<SubjectsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: /adicionar nova mat[ée]ria/i }))[0]!);
    await userEvent.type(screen.getByLabelText('Nome da disciplina'), 'Banco de Dados');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Você já tem uma disciplina com esse nome.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancelar fecha o formulário sem enviar nada', async () => {
    const api = stubApi({ 'GET /api/subjects': { items: [fakeSubject()] } });
    renderWithProviders(<SubjectsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: /adicionar nova mat[ée]ria/i }))[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(addButtons().length).toBeGreaterThan(0);
  });
});
