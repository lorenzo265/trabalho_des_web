import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { fakeSyncRun, stubApi } from '../test/utils';
import { useRefreshOnSyncFinish } from './queries';

function setup(initial: unknown) {
  let payload = initial;
  const api = stubApi({ 'GET /api/sync': () => payload });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const invalidated = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  renderHook(() => useRefreshOnSyncFinish(), { wrapper });
  const invalidations = (key: string) => invalidated.mock.calls.filter(([f]) => (f as { queryKey?: unknown[] })?.queryKey?.[0] === key).length;
  const refreshed = (key: string) => invalidations(key) > 0;
  return {
    api,
    refreshed,
    invalidations,
    /** A API passa a responder `next` e a consulta de sincronização é refeita (como o polling faz). */
    async serverNow(next: unknown) {
      payload = next;
      await act(async () => {
        await client.refetchQueries({ queryKey: ['sync'] });
        // o TanStack Query avisa os componentes numa tarefa seguinte (setTimeout 0): deixa isso assentar antes de afirmar
        await new Promise((r) => setTimeout(r, 20));
      });
    },
    /** Espera os dados chegarem E o efeito do hook registrar a linha de base (senão um refetch cancelaria a 1ª busca). */
    async firstLoad() {
      await waitFor(() => expect(client.getQueryData(['sync'])).toBeDefined());
      await act(async () => undefined);
    },
  };
}
const status = (lastId: number | null, current: unknown = null) => ({ source: 'mock', current, last: lastId === null ? null : fakeSyncRun({ id: lastId }) });
const KEYS = ['subjects', 'lessons', 'assignments', 'stats', 'changes', 'grades'];

describe('useRefreshOnSyncFinish (roda em qualquer tela, não só em Aulas)', () => {
  it('a primeira leitura é só a linha de base: não recarrega nada', async () => {
    const t = setup(status(5));
    await t.firstLoad();
    await act(async () => undefined);
    for (const k of KEYS) expect(t.refreshed(k), k).toBe(false);
  });

  it('quando uma execução nova termina, recarrega aulas, trabalhos, novidades, notas…', async () => {
    const t = setup(status(5));
    await t.firstLoad();
    await t.serverNow(status(5, fakeSyncRun({ id: 6, status: 'running', finishedAt: null, stats: null }))); // rodando: ainda não
    for (const k of KEYS) expect(t.refreshed(k), `${k} (rodando)`).toBe(false);
    await t.serverNow(status(6)); // terminou
    for (const k of KEYS) expect(t.refreshed(k), k).toBe(true);
  });

  it('a primeira sincronização de todas (de "nunca" para a #1) também recarrega', async () => {
    const t = setup(status(null));
    await t.firstLoad();
    await t.serverNow(status(1));
    expect(t.refreshed('assignments')).toBe(true);
  });

  it('consultas repetidas sem execução nova não recarregam de novo', async () => {
    const t = setup(status(5));
    await t.firstLoad();
    await t.serverNow(status(6));
    const count = () => t.invalidations('assignments');
    expect(count()).toBe(1);
    await t.serverNow(status(6));
    await t.serverNow(status(6));
    expect(count()).toBe(1); // o id não mudou: nada de recarregar de novo
    await t.serverNow(status(7));
    expect(count()).toBe(2); // uma execução realmente nova recarrega
  });
});
