import { createServer as createNetServer, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scrapeResultSchema } from '@edumind/contracts';
import { buildFixtures } from './portal-mock/fixtures';
import { createPortalServer } from './portal-mock/server';
import { browserAvailable, scrape } from './scrape';
import { ScrapeError } from './errors';

const TODAY = '2026-10-23';
const USER = 'aluno@portal.local';
const PASSWORD = 'aluno123';

const chromiumOk = await browserAvailable();
if (!chromiumOk) {
  console.warn(
    '[scraper] Chromium não encontrado — testes de integração PULADOS. Rode: npx playwright-core install chromium (ou defina CHROMIUM_PATH).',
  );
}

describe.skipIf(!chromiumOk)('scrape() contra o portal mock (Chromium real)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createPortalServer({ user: USER, password: PASSWORD, today: () => TODAY });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const opts = () => ({ source: 'mock' as const, baseUrl, username: USER, password: PASSWORD, delayMs: 0 });

  it('lê tudo e valida no scrapeResultSchema', async () => {
    const result = await scrape(opts());
    expect(scrapeResultSchema.safeParse(result).success).toBe(true);
    expect(result.source).toBe('mock');
    expect(result.courses).toHaveLength(5);

    const fixtures = buildFixtures(TODAY);
    for (const fx of fixtures) {
      const got = result.courses.find((c) => c.externalId === fx.id)!;
      expect(got, fx.id).toBeDefined();
      expect(got.name).toBe(fx.name);
      expect(got.professor).toBe(fx.professor);
      expect(got.room).toBe(fx.room);
      expect(got.lessons).toEqual(
        fx.lessons.map((l) => ({
          externalId: l.id,
          date: l.date,
          start: l.start,
          end: l.end,
          topic: l.topic,
          room: l.room,
        })),
      );
      expect(got.assignments).toEqual(
        fx.assignments.map((a) => ({
          externalId: a.id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate,
          status: a.status === 'Corrigido' ? 'corrigido' : a.status === 'Enviado' ? 'entregue' : 'pendente',
          grade: a.grade,
        })),
      );
    }
  });

  it('normaliza formatos diferentes de horário ("19h às 20h30") e sala ausente ("—")', async () => {
    const result = await scrape(opts());
    const ia = result.courses.find((c) => c.externalId === 'ia')!;
    expect(ia.lessons.every((l) => l.start === '19:00' && l.end === '20:30')).toBe(true);
    const redes = result.courses.find((c) => c.externalId === 'redes')!;
    expect(redes.lessons.some((l) => l.room === null)).toBe(true);
  });

  it('repetir a execução devolve o mesmo resultado (exceto fetchedAt)', async () => {
    const a = await scrape(opts());
    const b = await scrape(opts());
    expect({ ...a, fetchedAt: '' }).toEqual({ ...b, fetchedAt: '' });
  });

  it('senha errada → invalid_credentials', async () => {
    const err = await scrape({ ...opts(), password: 'errada' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeError);
    expect((err as ScrapeError).code).toBe('invalid_credentials');
  });

  it('servidor fora do ar → unreachable', async () => {
    // Reserva uma porta livre e a fecha: ninguém escuta nela.
    const probe = createNetServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const closedPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const err = await scrape({ ...opts(), baseUrl: `http://127.0.0.1:${closedPort}` }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeError);
    expect((err as ScrapeError).code).toBe('unreachable');
  });

  it('adaptador da faculdade real ainda não implementado → erro amigável', async () => {
    const err = await scrape({ ...opts(), source: 'portal' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeError);
    expect((err as ScrapeError).message).toMatch(/ainda não implementado/);
  });
});

describe('scrape() sem navegador', () => {
  it('CHROMIUM_PATH inexistente → browser_unavailable', async () => {
    const err = await scrape({
      source: 'mock',
      baseUrl: 'http://127.0.0.1:1',
      username: 'x',
      password: 'y',
      chromiumPath: '/caminho/que/nao/existe/chrome',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeError);
    expect((err as ScrapeError).code).toBe('browser_unavailable');
  });
});
