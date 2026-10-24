import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { scrapeResultSchema, type ScrapedCourse, type ScrapeResult } from '@edumind/contracts';
import { ZodError } from 'zod';
import { createMockPortalAdapter } from './adapters/mock-portal';
import { createPortalAdapter } from './adapters/portal';
import type { SourceAdapter } from './adapters/types';
import { ScrapeError } from './errors';

export interface ScrapeOptions {
  source: 'mock' | 'portal';
  baseUrl: string;
  username: string;
  password: string;
  /** Caminho do Chromium; padrão: `CHROMIUM_PATH` ou o navegador instalado pelo Playwright. */
  chromiumPath?: string;
  /** Pausa educada entre páginas, em ms (padrão 150). */
  delayMs?: number;
  /** Timeout de cada passo, em ms (padrão 15000). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function adapterFor(opts: ScrapeOptions): SourceAdapter {
  return opts.source === 'mock' ? createMockPortalAdapter(opts.baseUrl) : createPortalAdapter(opts.baseUrl);
}

/** Traduz qualquer falha (Playwright, rede, zod) num `ScrapeError` com código estável. */
export function classifyError(err: unknown, baseUrl = ''): ScrapeError {
  if (err instanceof ScrapeError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (err instanceof ZodError) {
    return new ScrapeError('layout_changed', undefined, { cause: err });
  }
  if (/net::ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|CONNECTION_RESET|CONNECTION_TIMED_OUT|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|UNSAFE_PORT|INVALID_URL)|ECONNREFUSED|ENOTFOUND/.test(msg)) {
    return new ScrapeError('unreachable', `Não foi possível acessar a plataforma da faculdade (${baseUrl}). Confira PORTAL_URL e a conexão.`, { cause: err });
  }
  if (name === 'TimeoutError') {
    if (/page\.goto|navigat/i.test(msg) && !/locator/i.test(msg)) {
      return new ScrapeError('unreachable', `A plataforma da faculdade (${baseUrl}) demorou demais para responder.`, { cause: err });
    }
    return new ScrapeError('layout_changed', undefined, { cause: err });
  }
  return new ScrapeError('unknown', undefined, { cause: err });
}

function resolveExecutable(opts: ScrapeOptions): string | undefined {
  const path = opts.chromiumPath || process.env.CHROMIUM_PATH || undefined;
  if (path && !existsSync(path)) {
    throw new ScrapeError('browser_unavailable', `Chromium não encontrado em "${path}". Ajuste CHROMIUM_PATH ou rode: npx playwright-core install chromium`);
  }
  return path;
}

async function launch(opts: ScrapeOptions): Promise<Browser> {
  const executablePath = resolveExecutable(opts);
  try {
    return await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  } catch (err) {
    throw new ScrapeError('browser_unavailable', undefined, { cause: err });
  }
}

/** `true` se o Chromium sobe nesta máquina (usado para pular os testes de integração). */
export async function browserAvailable(chromiumPath?: string): Promise<boolean> {
  try {
    const browser = await launch({ source: 'mock', baseUrl: '', username: '', password: '', ...(chromiumPath ? { chromiumPath } : {}) });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê disciplinas, aulas e trabalhos da plataforma e devolve um `ScrapeResult` validado.
 * Somente leitura: o Chromium bloqueia qualquer requisição que não seja GET/HEAD (exceto o
 * POST do login). O navegador é sempre fechado, mesmo em erro.
 */
export async function scrape(opts: ScrapeOptions, deps: { adapter?: SourceAdapter } = {}): Promise<ScrapeResult> {
  const adapter = deps.adapter ?? adapterFor(opts);
  const delayMs = opts.delayMs ?? 150;
  const timeoutMs = opts.timeoutMs ?? 15_000;

  let browser: Browser | undefined;
  try {
    browser = await launch(opts);
    const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    context.setDefaultTimeout(timeoutMs);
    context.setDefaultNavigationTimeout(timeoutMs);

    // Trava de somente leitura + economia de banda (sem imagens/mídia/fontes).
    await context.route('**/*', (route) => {
      const req = route.request();
      if (['image', 'media', 'font'].includes(req.resourceType())) return route.abort();
      if (req.method() === 'GET' || req.method() === 'HEAD') return route.continue();
      const path = new URL(req.url()).pathname;
      return adapter.writePaths.includes(path) ? route.continue() : route.abort();
    });

    const page = await context.newPage();
    await adapter.login(page, { username: opts.username, password: opts.password });

    const refs = await adapter.listCourses(page);
    const courses: ScrapedCourse[] = [];
    for (const ref of refs) {
      await sleep(delayMs);
      courses.push(await adapter.readCourse(page, ref));
    }

    await adapter.logout?.(page).catch(() => undefined);

    return scrapeResultSchema.parse({
      source: adapter.source,
      fetchedAt: new Date().toISOString(),
      courses,
    });
  } catch (err) {
    throw classifyError(err, opts.baseUrl);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
