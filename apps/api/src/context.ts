import type { ScrapeResult } from '@edumind/contracts';
import type { ApiConfig } from './config';
import type { Clock } from './clock';
import type { Db } from './db/db';
import type { LlmClient } from './modules/chat/llm';
import type { AccessService } from './modules/access/service';
import type { RateLimiter } from './lib/rate-limit';

/** Opções entregues ao scraper (interface implementada por `@edumind/scraper`). */
export interface ScrapeOptions {
  source: 'mock' | 'portal';
  baseUrl: string;
  username: string;
  password: string;
  chromiumPath?: string;
}
export type ScrapeFn = (opts: ScrapeOptions) => Promise<ScrapeResult>;

/** Dependências injetáveis (testes trocam relógio, IA e scraper). */
export interface AppDeps {
  db: Db;
  config: ApiConfig;
  clock?: Clock;
  llm: LlmClient;
  scrape: ScrapeFn;
}

/** Contexto compartilhado pelos módulos de rota. */
export interface Ctx {
  db: Db;
  config: ApiConfig;
  clock: Clock;
  now: () => string;
  access: AccessService;
  llm: LlmClient;
  scrape: ScrapeFn;
  limiters: { login: RateLimiter; register: RateLimiter; chat: RateLimiter };
  /** Usuários com resposta do tutor em andamento (1 stream por usuário). */
  activeStreams: Set<number>;
  /** Sincronizações em segundo plano (testes aguardam por elas). */
  pendingSyncs: Set<Promise<void>>;
}
