import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fakeAssignment, fakeLesson, fakeSyncRun, renderWithProviders, stubApi } from '../test/utils';
import { LessonsPage } from './Lessons';

const CONFIG = { appName: 'EduMind', aiMode: 'demo', googleEnabled: false, scraperSource: 'mock' };
const idle = { source: 'mock', current: null, last: null };

function routes(extra: Record<string, unknown> = {}) {
  return {
    'GET /api/config': CONFIG,
    'GET /api/sync': idle,
    'GET /api/lessons': { items: [fakeLesson({ id: 1, date: '2026-11-06', start: '19:00', subjectName: 'Redes', topic: 'Roteamento' }), fakeLesson({ id: 2, date: '2026-11-09', subjectName: 'Banco de Dados', topic: 'Joins' })] },
    'GET /api/assignments': {
      items: [
        fakeAssignment({ id: 1, title: 'Lista de SQL', status: 'pendente', dueDate: '2026-11-08' }),
        fakeAssignment({ id: 2, title: 'Relatório entregue', status: 'entregue', dueDate: '2026-11-01' }),
        fakeAssignment({ id: 3, title: 'Prova corrigida', status: 'corrigido', dueDate: '2026-10-20', grade: 9 }),
      ],
    },
    'GET /api/changes': { items: [], unseen: 0 },
    ...extra,
  };
}

describe('LessonsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('antes de sincronizar: mostra a fonte e que ainda não houve sincronização', async () => {
    stubApi(routes());
    renderWithProviders(<LessonsPage />);
    expect(await screen.findByText('Ainda não sincronizado.')).toBeInTheDocument();
    expect(await screen.findByText(/Fonte: Portal de demonstração \(local\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sincronizar/ })).toBeEnabled();
  });

  it('última sincronização com sucesso mostra as contagens; com erro mostra o motivo', async () => {
    stubApi(routes({ 'GET /api/sync': { ...idle, last: fakeSyncRun() } }));
    const { unmount } = renderWithProviders(<LessonsPage />);
    const card = within(await screen.findByRole('region', { name: /Sincronizar com a faculdade/ }));
    expect(await card.findByText('OK')).toBeInTheDocument();
    expect(card.getByText(/5 disciplinas, 31 aulas, 12 trabalhos/)).toBeInTheDocument();
    unmount();

    stubApi(routes({ 'GET /api/sync': { ...idle, last: fakeSyncRun({ status: 'error', stats: null, error: 'Não foi possível sincronizar: portal fora do ar' }) } }));
    renderWithProviders(<LessonsPage />);
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
    expect(screen.getByText(/portal fora do ar/)).toBeInTheDocument();
  });

  it('Sincronizar: dispara o POST, mostra o andamento e avisa quantas novidades chegaram', async () => {
    let phase: 'idle' | 'running' | 'done' = 'idle';
    let polls = 0;
    const api = stubApi(
      routes({
        'GET /api/sync': () => {
          if (phase === 'idle') return idle;
          if (phase === 'running' && ++polls >= 2) phase = 'done';
          return phase === 'running'
            ? { source: 'mock', current: fakeSyncRun({ id: 7, status: 'running', finishedAt: null, stats: null }), last: null }
            : { source: 'mock', current: null, last: fakeSyncRun({ id: 7, stats: { subjects: 5, lessons: 3, assignments: 1, created: 2, updated: 1, changes: 2 } }) };
        },
        'POST /api/sync': () => ((phase = 'running'), fakeSyncRun({ id: 7, status: 'running', finishedAt: null, stats: null })),
      }),
    );
    renderWithProviders(<LessonsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Sincronizar$/ }));
    expect(await screen.findByRole('button', { name: /Sincronizando…/ })).toBeDisabled();
    expect(api.called('POST /api/sync')).toHaveLength(1);

    // quando termina: aviso com as novidades e recarga de aulas, trabalhos e novidades
    expect(await screen.findByText('Sincronizado: 3 aulas e 1 trabalhos · 2 novidades.', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Sincronizar$/ })).toBeEnabled());
    expect(api.called('GET /api/changes').length).toBeGreaterThanOrEqual(2);
    expect(api.called('GET /api/assignments').length).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('falha na sincronização mostra o erro em um aviso e libera o botão', async () => {
    let phase: 'idle' | 'running' | 'done' = 'idle';
    stubApi(
      routes({
        'GET /api/sync': () =>
          phase === 'idle'
            ? idle
            : { source: 'mock', current: null, last: fakeSyncRun({ id: 8, status: 'error', stats: null, error: 'Não foi possível sincronizar: senha inválida' }) },
        'POST /api/sync': () => ((phase = 'done'), fakeSyncRun({ id: 8, status: 'running', finishedAt: null, stats: null })),
      }),
    );
    renderWithProviders(<LessonsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Sincronizar$/ }));
    expect((await screen.findAllByText(/senha inválida/, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Sincronizar$/ })).toBeEnabled());
  }, 12000);

  it('agenda da semana: aulas por dia, "hoje" marcado, e navegação pede a semana certa', async () => {
    const api = stubApi(routes());
    renderWithProviders(<LessonsPage />);
    const agenda = within(await screen.findByRole('region', { name: /Agenda/ }));
    expect(await agenda.findByText('Redes')).toBeInTheDocument();
    expect(agenda.getByText('hoje')).toBeInTheDocument();
    expect(api.called('GET /api/lessons')[0]!.query).toBe('?from=2026-11-02&to=2026-11-08');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    await waitFor(() => expect(api.called('GET /api/lessons').at(-1)!.query).toBe('?from=2026-11-09&to=2026-11-15'));
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(api.called('GET /api/lessons').at(-1)!.query).toBe('?from=2026-11-02&to=2026-11-08'));
  });

  it('semana sem aulas mostra o estado vazio', async () => {
    stubApi(routes({ 'GET /api/lessons': { items: [] } }));
    renderWithProviders(<LessonsPage />);
    expect(await screen.findByText('Nenhuma aula nesta semana')).toBeInTheDocument();
  });

  it('trabalhos: só os pendentes por padrão; "Mostrar concluídos" inclui os outros', async () => {
    stubApi(routes());
    renderWithProviders(<LessonsPage />);
    const box = within(await screen.findByRole('region', { name: 'Trabalhos e prazos' }));
    expect(await box.findByText('Lista de SQL')).toBeInTheDocument();
    expect(box.queryByText('Relatório entregue')).not.toBeInTheDocument();
    expect(box.queryByText('Prova corrigida')).not.toBeInTheDocument();

    await userEvent.click(box.getByRole('checkbox', { name: 'Mostrar concluídos' }));
    expect(box.getByText('Relatório entregue')).toBeInTheDocument();
    expect(box.getByText('Prova corrigida')).toBeInTheDocument();
    expect(box.getByText('Nota 9')).toBeInTheDocument();
  });

  it('inclui o cartão de novidades e o atalho para o calendário', async () => {
    stubApi(routes({ 'GET /api/changes': { unseen: 0, items: [] } }));
    renderWithProviders(<LessonsPage />);
    expect(await screen.findByRole('region', { name: 'Novidades da faculdade' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Calendário/ })).toHaveAttribute('href', '/calendario');
  });
});
