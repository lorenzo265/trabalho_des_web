import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import type { ScrapeResult } from '@edumind/contracts';
import { createApp, type AppServices } from '../src/app';
import { FakeClock } from '../src/clock';
import { loadConfig, type ApiConfig } from '../src/config';
import type { AppDeps, ScrapeFn } from '../src/context';
import { openDb } from '../src/db/db';
import { DemoLlm } from '../src/modules/chat/demo';
import type { LlmClient } from '../src/modules/chat/llm';
import { bootstrapAdmin } from '../src/modules/auth/users';

export const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
};

export const T0 = '2026-10-23T15:00:00.000Z';

export const sampleScrape = (): ScrapeResult => ({
  source: 'mock',
  fetchedAt: T0,
  courses: [
    {
      externalId: 'c1',
      name: 'Desenvolvimento Móvel',
      professor: 'Prof. João',
      room: 'Sala 311 · Prédio 01',
      lessons: [
        { externalId: 'c1-l1', date: '2026-10-23', start: '19:00', end: '20:30', topic: 'Dicas de telas', room: 'Sala 311' },
        { externalId: 'c1-l2', date: '2026-10-30', start: '19:00', end: '20:30', topic: null, room: null },
      ],
      assignments: [
        { externalId: 'c1-a1', title: 'Projeto G2', description: 'Telas e DER', dueDate: '2026-10-23', status: 'pendente', grade: null },
      ],
    },
    {
      externalId: 'c2',
      name: 'Inteligência Artificial',
      professor: 'Profa. Carla',
      room: 'Prédio 1',
      lessons: [{ externalId: 'c2-l1', date: '2026-10-27', start: '19:00', end: '20:30', topic: 'Busca A*', room: null }],
      assignments: [],
    },
  ],
});

export function makeApp(
  opts: { llm?: LlmClient; scrape?: ScrapeFn; config?: Partial<ApiConfig> } = {},
) {
  const clock = new FakeClock(T0);
  const db = openDb(':memory:');
  const config: ApiConfig = { ...loadConfig({}), dbPath: ':memory:', ...opts.config };
  const scrape = vi.fn<ScrapeFn>(opts.scrape ?? (async () => sampleScrape()));
  const llm = opts.llm ?? new DemoLlm({ delayMs: 0 });
  const deps: AppDeps = { db, config, clock: clock.now, llm, scrape };
  const app: Express = createApp(deps);
  const services = app.locals.services as AppServices;
  return { app, db, clock, scrape, llm, services, config };
}
export type TestApp = ReturnType<typeof makeApp>;

/** Cliente com cookie próprio = um "dispositivo". */
export function device(app: Express, ua = UA.chromeWin) {
  return request.agent(app).set('User-Agent', ua);
}

let seq = 0;
export async function signup(app: Express, over: Partial<{ name: string; email: string; password: string }> = {}, ua = UA.chromeWin) {
  seq++;
  const body = { name: `Aluno ${seq}`, email: `aluno${seq}@teste.com`, password: 'senha-forte-1', ...over };
  const agent = device(app, ua);
  const res = await agent.post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`signup falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: number; email: string; name: string }, body };
}

export async function adminAgent(t: TestApp, ua = UA.chromeWin) {
  await bootstrapAdmin(t.db, { email: 'admin@teste.com', password: 'admin-12345', name: 'Admin' }, t.clock.now().toISOString());
  const agent = device(t.app, ua);
  const res = await agent.post('/api/auth/login').send({ email: 'admin@teste.com', password: 'admin-12345' });
  if (res.status !== 200) throw new Error(`login admin falhou: ${res.status}`);
  return agent;
}

/** Interpreta um corpo `text/event-stream` em eventos. */
export function parseSse(text: string): { event: string; data: any }[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

/** Parser de supertest que devolve o corpo SSE como texto. */
export const sseParser = (res: any, cb: (err: Error | null, body: string) => void) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (c: string) => (data += c));
  res.on('end', () => cb(null, data));
};
