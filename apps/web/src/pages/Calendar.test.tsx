import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders, stubApi } from '../test/utils';
import { CalendarPage } from './Calendar';

const lesson = (id: number, date: string, start: string, subjectName: string, topic: string | null = null) => ({
  id, subjectId: id, subjectName, subjectColor: '#2563EB', date, start, end: '20:30', topic, room: 'Lab 2',
});
const assignment = (id: number, dueDate: string, title: string) => ({
  id, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', title, description: null, dueDate, status: 'pendente', grade: null, weight: 1,
});

function setup(route = '/calendario') {
  const api = stubApi({
    'GET /api/lessons': {
      items: [
        lesson(1, '2026-11-06', '19:00', 'Redes de Computadores', 'Roteamento'),
        lesson(2, '2026-11-09', '19:00', 'Banco de Dados', 'Joins'),
        lesson(3, '2026-11-06', '08:00', 'Inteligência Artificial'),
      ],
    },
    'GET /api/assignments': { items: [assignment(1, '2026-11-06', 'Lista de SQL'), assignment(2, '2026-12-01', 'Projeto final')] },
  });
  renderWithProviders(<CalendarPage />, { route });
  return api;
}

describe('CalendarPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('abre no mês de hoje, pede à API o intervalo da grade e mostra os eventos de hoje', async () => {
    const api = setup();
    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument();
    const day = await screen.findByRole('button', { name: 'Sexta-feira, 6 de novembro, 3 eventos' });
    expect(day).toHaveAttribute('aria-current', 'date');
    expect(day).toHaveAttribute('aria-pressed', 'true');
    // 2 aulas + 1 prazo no dia selecionado (hoje), com a aula das 08:00 antes da das 19:00
    const detail = within(screen.getByRole('region', { name: /sexta-feira, 6 de novembro/i }));
    const items = detail.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Inteligência Artificial');
    expect(items[1]).toContain('Redes de Computadores');
    expect(items[2]).toContain('Lista de SQL');
    expect(api.called('GET /api/lessons')[0]!.query).toBe('?from=2026-10-26&to=2026-12-06');
  });

  it('clicar noutro dia mostra os eventos dele; dia vazio explica', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Segunda-feira, 9 de novembro, 1 evento' }));
    const detail = within(screen.getByRole('region', { name: /segunda-feira, 9 de novembro/i }));
    expect(detail.getByText('Banco de Dados')).toBeInTheDocument();
    expect(detail.getByText('Joins')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Terça-feira, 10 de novembro, sem eventos' }));
    expect(screen.getByText('Nada neste dia')).toBeInTheDocument();
  });

  it('navega entre meses, refaz a consulta e volta para hoje', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Próximo mês' }));
    expect(await screen.findByRole('heading', { name: 'Dezembro de 2026' })).toBeInTheDocument();
    expect(api.called('GET /api/lessons').at(-1)!.query).toBe('?from=2026-11-30&to=2027-01-03');
    expect(await screen.findByRole('button', { name: 'Terça-feira, 1 de dezembro, 1 evento' })).toBeInTheDocument(); // o prazo do projeto

    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeDisabled();
  });

  it('modo semana mostra os 7 dias em sequência, pede só a semana e lembra a escolha', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('tab', { name: 'Semana' }));
    expect(screen.getByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: /2 de nov – 8 de nov/i })).toBeInTheDocument();
    expect(api.called('GET /api/lessons').at(-1)!.query).toBe('?from=2026-11-02&to=2026-11-08');
    for (const name of [/segunda-feira, 2 de novembro/i, /domingo, 8 de novembro/i]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    expect(within(screen.getByLabelText(/sexta-feira, 6 de novembro/i)).getByText('Lista de SQL')).toBeInTheDocument();
    expect(localStorage.getItem('edumind_calendar_view')).toBe('week');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByRole('heading', { name: /9 de nov – 15 de nov/i })).toBeInTheDocument();
  });

  it('lembra o modo semana ao voltar à página', async () => {
    localStorage.setItem('edumind_calendar_view', 'week');
    setup();
    expect(await screen.findByRole('tab', { name: 'Semana', selected: true })).toBeInTheDocument();
  });

  it('oferece o download do .ics', async () => {
    setup();
    const link = await screen.findByRole('link', { name: /baixar \.ics/i });
    expect(link).toHaveAttribute('href', '/api/calendar.ics');
    expect(link).toHaveAttribute('download', 'edumind-agenda.ics');
  });

  it('erro da API de aulas vira estado de erro', async () => {
    stubApi({ 'GET /api/assignments': { items: [] } }); // sem rota de aulas: 404
    renderWithProviders(<CalendarPage />, { route: '/calendario' });
    expect(await screen.findByRole('alert')).toHaveTextContent('sem rota no teste: GET /api/lessons');
  });
});
