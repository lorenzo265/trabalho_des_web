import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { ConfirmProvider } from '../components/ui/Confirm';
import { ToastProvider } from '../components/ui/Toast';

/** Mostra o endereço atual (`data-testid="location"`) para testar navegação. */
function LocationProbe() {
  const l = useLocation();
  return <output data-testid="location">{`${l.pathname}${l.search}`}</output>;
}

/**
 * Renderiza com os mesmos providers do app (query, rotas em memória, toasts, confirmação).
 * Com `path` (ex.: "/tutor/:threadId?") a página é montada nessa rota, para `useParams` funcionar, e a sonda de endereço aparece.
 */
export function renderWithProviders(ui: ReactElement, { route = '/', path }: { route?: string; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <ConfirmProvider>
            {path ? (
              <>
                <Routes>
                  <Route path={path} element={ui} />
                </Routes>
                <LocationProbe />
              </>
            ) : (
              ui
            )}
          </ConfirmProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export interface ApiCall {
  method: string;
  path: string;
  query: string;
  body: unknown;
}
type Handler = ((call: ApiCall) => unknown) | object | string | number | boolean | null;
// (a função pode ser assíncrona: devolver uma Promise segura a resposta, útil para testar estados "carregando"/otimistas)

/**
 * Troca o `fetch` por uma API de mentira. Chaves no formato `"GET /api/changes"` (sem query string).
 * Valor: o JSON da resposta, `null` (204), uma `Response`, ou uma função que decide (e pode guardar estado).
 * Rotas sem handler respondem 404 com o formato de erro da API, para o teste falhar com uma mensagem clara.
 */
export function stubApi(routes: Record<string, Handler>) {
  const calls: ApiCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const call: ApiCall = {
      method,
      path: url.pathname,
      query: url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const key = `${method} ${url.pathname}`;
    if (!(key in routes)) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: `sem rota no teste: ${key}` } }), { status: 404 });
    }
    const h = routes[key];
    const out = await (typeof h === 'function' ? (h as (c: ApiCall) => unknown)(call) : h);
    if (out instanceof Response) return out;
    if (out === null) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn, called: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key) };
}

export const fakeChange = (over: Record<string, unknown> = {}) => ({
  id: 1,
  kind: 'assignment_due_changed',
  subjectId: 1,
  subjectName: 'Desenvolvimento Móvel',
  subjectColor: '#2563EB',
  title: 'Projeto G2',
  oldValue: '2026-10-23',
  newValue: '2026-10-30',
  createdAt: new Date().toISOString(),
  seen: false,
  ...over,
});

// ---------- Dados de exemplo que passam nos schemas de `packages/contracts` ----------
const ISO = '2026-11-06T12:00:00.000Z';

export const fakeUser = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'Gustavo Peixoto', email: 'aluno@edumind.local', role: 'user', level: 'superior', weeklyGoalMinutes: 600, createdAt: ISO, lastLoginAt: ISO, ...over,
});

export const fakeSubject = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'Banco de Dados', professor: 'Prof. Marcos', room: 'Lab 2', color: '#2563EB', source: 'manual', createdAt: ISO, topicCount: 4, doneCount: 1, targetAverage: 7, ...over,
});

export const fakeDevice = (over: Record<string, unknown> = {}) => ({
  id: 1, device: 'Chrome · Windows', ip: '127.0.0.1', createdAt: ISO, lastSeenAt: ISO, expiresAt: '2026-11-13T12:00:00.000Z', current: true, ...over,
});

export const fakeAccess = (over: Record<string, unknown> = {}) => ({
  id: 1, userId: 1, userName: 'Gustavo Peixoto', userEmail: 'aluno@edumind.local', method: 'password', device: 'Chrome · Windows', ip: '127.0.0.1', loginAt: ISO, logoutAt: null, logoutReason: null, ...over,
});

export const fakeThread = (over: Record<string, unknown> = {}) => ({
  id: 3, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', title: 'O que é normalização?', createdAt: ISO, updatedAt: ISO, ...over,
});

export const fakeMessage = (over: Record<string, unknown> = {}) => ({
  id: 1, threadId: 3, role: 'user', content: 'Olá', createdAt: ISO, ...over,
});

/** Resposta SSE do Tutor (`event: user|token|done|error`). Com `hang`, o fluxo nunca termina (para testar "Parar"). */
export function sseResponse(events: { event: string; data: unknown }[], { hang = false }: { hang?: boolean } = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      if (!hang) c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export const jsonError = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

export const fakeGoal = (over: Record<string, unknown> = {}) => ({
  id: 1, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', goalDate: '2026-11-06', description: 'Revisar joins', targetMinutes: 30, done: false, doneAt: null, ...over,
});

export const fakeLesson = (over: Record<string, unknown> = {}) => ({
  id: 1, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', date: '2026-11-06', start: '19:00', end: '20:30', topic: 'Joins', room: 'Lab 2', ...over,
});

export const fakeAssignment = (over: Record<string, unknown> = {}) => ({
  id: 1, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', title: 'Lista de SQL', description: null, dueDate: '2026-11-08', status: 'pendente', grade: null, weight: 1, ...over,
});

export const fakeWeekStats = (over: Record<string, unknown> = {}) => ({
  weekStart: '2026-11-02', totalMinutes: 840, weeklyGoalMinutes: 1200,
  byDay: ['02', '03', '04', '05', '06', '07', '08'].map((d) => ({ date: `2026-11-${d}`, minutes: 0 })),
  bySubject: [], goalsToday: 2, goalsTodayDone: 1, subjectsTotal: 2, subjectsCompleted: 0, ...over,
});

export const fakeSyncRun = (over: Record<string, unknown> = {}) => ({
  id: 1, source: 'mock', status: 'ok', startedAt: '2026-11-06T11:59:00.000Z', finishedAt: '2026-11-06T12:00:00.000Z',
  stats: { subjects: 5, lessons: 31, assignments: 12, created: 0, updated: 0, changes: 0 }, error: null, ...over,
});

export const fakeAdminUser = (over: Record<string, unknown> = {}) => ({
  id: 2, name: 'Maria Souza', email: 'maria@edumind.local', role: 'user', isActive: true, createdAt: ISO, lastLoginAt: ISO, activeSessions: 1, subjectsCount: 3, ...over,
});

export const fakeAdminOverview = (over: Record<string, unknown> = {}) => ({
  usersTotal: 5, usersActive: 4, adminsTotal: 1, activeSessions: 3, loginsToday: 7, subjectsTotal: 12, messagesTotal: 40,
  loginsByDay: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(24 + (i % 7)).padStart(2, '0')}`, count: i })), ...over,
});
