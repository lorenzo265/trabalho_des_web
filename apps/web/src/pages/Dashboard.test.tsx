import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { formatHours } from '../lib/dates';
import { fakeAssignment, fakeGoal, fakeLesson, fakeSubject, fakeUser, fakeWeekStats, renderWithProviders, stubApi } from '../test/utils';
import { DashboardPage } from './Dashboard';

vi.mock('../app/auth', () => ({ useUser: () => fakeUser() }));

function routes(extra: Record<string, unknown> = {}) {
  return {
    'GET /api/subjects': { items: [fakeSubject({ id: 1, name: 'Banco de Dados', topicCount: 4, doneCount: 1 }), fakeSubject({ id: 2, name: 'Redes', topicCount: 0, doneCount: 0 })] },
    'GET /api/goals': { items: [fakeGoal({ id: 1 }), fakeGoal({ id: 2, description: 'Ler capítulo 3', done: true, targetMinutes: null })] },
    'GET /api/lessons': { items: [fakeLesson()] },
    'GET /api/assignments': { items: [fakeAssignment({ id: 1, title: 'Lista de SQL', dueDate: '2026-11-08' }), fakeAssignment({ id: 2, title: 'Projeto final', dueDate: '2026-11-30' })] },
    'GET /api/stats/week': fakeWeekStats(),
    'GET /api/changes': { items: [], unseen: 0 },
    ...extra,
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('cumprimenta pelo primeiro nome, mostra a data e o progresso de cada disciplina', async () => {
    stubApi(routes());
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('heading', { name: /Olá, Gustavo!/ })).toBeInTheDocument();
    expect(screen.getByText('Sexta-feira, 6 de novembro')).toBeInTheDocument();
    const tiles = await screen.findAllByRole('link', { name: /Banco de Dados|Redes/ });
    const bd = tiles.find((t) => t.textContent?.includes('Banco de Dados'))!;
    expect(bd).toHaveAttribute('href', '/disciplinas/1');
    expect(bd).toHaveTextContent('25% Concluído');
    expect(tiles.find((t) => t.textContent?.includes('Redes'))).toHaveTextContent('Sem tópicos');
  });

  it('mostra o estudo da semana contra a meta', async () => {
    stubApi(routes());
    renderWithProviders(<DashboardPage />);
    const card = within(await screen.findByRole('region', { name: 'Estudo desta semana' }));
    expect(await card.findByText(formatHours(840))).toBeInTheDocument();
    expect(card.getByText(`de ${formatHours(1200)} de meta`)).toBeInTheDocument();
  });

  it('metas de hoje: contador, marcar como feita (otimista, antes da resposta da API) e excluir', async () => {
    let goals = [fakeGoal({ id: 1 }), fakeGoal({ id: 2, description: 'Ler capítulo 3', done: true, targetMinutes: null })];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r)); // segura o PATCH para provar que a marcação é imediata
    const api = stubApi(
      routes({
        'GET /api/goals': () => ({ items: goals }),
        'PATCH /api/goals/1': async () => {
          await gate;
          goals = goals.map((g) => (g.id === 1 ? { ...g, done: true } : g));
          return goals[0];
        },
        'DELETE /api/goals/2': () => ((goals = goals.filter((g) => g.id !== 2)), null),
      }),
    );
    renderWithProviders(<DashboardPage />);
    const region = await screen.findByRole('region', { name: 'Metas de hoje' });
    const goalsBox = within(region);
    expect(await goalsBox.findByText('1 de 2')).toBeInTheDocument();

    const box = goalsBox.getByRole('checkbox', { name: 'Concluir meta: Revisar joins' });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(box).toBeChecked(); // marcou na hora: a API ainda nem respondeu
    await waitFor(() => expect(api.called('PATCH /api/goals/1')).toHaveLength(1));
    expect(api.called('PATCH /api/goals/1')[0]!.body).toEqual({ done: true });

    release();
    expect(await goalsBox.findByText('2 de 2')).toBeInTheDocument(); // depois da resposta, segue o servidor
    expect(goalsBox.getByRole('checkbox', { name: 'Concluir meta: Revisar joins' })).toBeChecked();

    await userEvent.click(goalsBox.getByRole('button', { name: 'Excluir meta: Ler capítulo 3' }));
    await waitFor(() => expect(api.called('DELETE /api/goals/2')).toHaveLength(1));
    expect(await goalsBox.findByText('1 de 1')).toBeInTheDocument();
  });

  it('se a API recusar a marcação, a caixa volta ao valor do servidor e avisa', async () => {
    stubApi(routes({ 'PATCH /api/goals/1': new Response(JSON.stringify({ error: { code: 'x', message: 'Não foi possível salvar a meta.' } }), { status: 500 }) }));
    renderWithProviders(<DashboardPage />);
    const box = await screen.findByRole('checkbox', { name: 'Concluir meta: Revisar joins' });
    await userEvent.click(box);
    expect(await screen.findByText('Não foi possível salvar a meta.')).toBeInTheDocument();
    await waitFor(() => expect(box).not.toBeChecked());
  });

  it('nova meta: exige descrição e envia disciplina, data de hoje e minutos', async () => {
    const api = stubApi(routes({ 'POST /api/goals': fakeGoal({ id: 9, description: 'Estudar índices' }) }));
    renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova meta/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Descreva a meta.')).toBeInTheDocument();
    expect(api.called('POST /api/goals')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('O que você vai fazer?'), 'Estudar índices');
    await userEvent.type(screen.getByLabelText('Tempo previsto (minutos, opcional)'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(api.called('POST /api/goals')).toHaveLength(1));
    expect(api.called('POST /api/goals')[0]!.body).toEqual({ subjectId: 1, goalDate: '2026-11-06', description: 'Estudar índices', targetMinutes: 45 });
    expect(await screen.findByText('Meta adicionada.')).toBeInTheDocument();
  });

  it('próximas aulas e prazos próximos aparecem; lembrete só para o que vence em até 3 dias', async () => {
    stubApi(routes());
    renderWithProviders(<DashboardPage />);
    const lessons = within(await screen.findByRole('region', { name: 'Próximas aulas' }));
    expect(await lessons.findByText('Joins')).toBeInTheDocument();
    const reminders = within(await screen.findByRole('region', { name: /Lembretes/ }));
    expect(reminders.getByText('Lista de SQL')).toBeInTheDocument();
    expect(reminders.getByText('vence em 2 dias')).toBeInTheDocument();
    expect(reminders.queryByText('Projeto final')).not.toBeInTheDocument(); // 24 dias: longe demais
    const due = within(screen.getByRole('region', { name: 'Prazos próximos' }));
    expect(due.getByText('Projeto final')).toBeInTheDocument();
  });

  it('avisa das novidades da faculdade quando há não vistas', async () => {
    stubApi(routes({ 'GET /api/changes': { items: [], unseen: 3 } }));
    renderWithProviders(<DashboardPage />);
    const notice = await screen.findByRole('link', { name: /3 novidades da faculdade/ });
    expect(notice).toHaveAttribute('href', '/aulas');
  });

  it('conta nova: estados vazios orientam o aluno e "Nova meta" fica desabilitada', async () => {
    stubApi(
      routes({
        'GET /api/subjects': { items: [] },
        'GET /api/goals': { items: [] },
        'GET /api/lessons': { items: [] },
        'GET /api/assignments': { items: [] },
      }),
    );
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Nenhuma disciplina ainda')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma meta para hoje. Que tal definir a primeira?')).toBeInTheDocument();
    expect(await screen.findByText('Sem aulas nos próximos dias')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova meta/ })).toBeDisabled();
    expect(screen.queryByRole('region', { name: /Lembretes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Prazos próximos' })).not.toBeInTheDocument();
  });
});
