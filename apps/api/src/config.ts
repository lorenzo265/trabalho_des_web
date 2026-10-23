import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

export interface ApiConfig {
  port: number;
  dbPath: string;
  appName: string;
  cookieSecure: boolean;
  /** Confia em X-Forwarded-For (atrás de proxy reverso). */
  trustProxy: boolean;
  sessionDays: number;
  /** Origens de navegador aceitas além do próprio Host (ex.: o Vite em dev). */
  allowedOrigins: string[];
  adminEmail?: string;
  adminPassword?: string;
  adminName: string;
  openRouterApiKey?: string;
  llmModel: string;
  openRouterBaseUrl: string;
  scraperSource: 'mock' | 'portal';
  portalUrl: string;
  portalUser: string;
  portalPassword: string;
  chromiumPath?: string;
}

/** Raiz do repositório (apps/api/src → ../../..). Caminhos relativos do .env partem daqui. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const str = (k: string): string | undefined => {
    const v = env[k]?.trim();
    return v ? v : undefined;
  };
  const flag = (k: string): boolean => ['true', '1', 'yes'].includes((str(k) ?? '').toLowerCase());
  const dbPath = str('DB_PATH') ?? './data/edumind.db';

  return {
    port: Number(str('API_PORT') ?? 3001),
    dbPath: dbPath === ':memory:' || isAbsolute(dbPath) ? dbPath : resolve(REPO_ROOT, dbPath),
    appName: str('APP_NAME') ?? 'EduMind',
    cookieSecure: flag('COOKIE_SECURE'),
    trustProxy: flag('TRUST_PROXY'),
    sessionDays: Number(str('SESSION_DAYS') ?? 7),
    allowedOrigins: (str('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminEmail: str('ADMIN_EMAIL'),
    adminPassword: str('ADMIN_PASSWORD'),
    adminName: str('ADMIN_NAME') ?? 'Administrador',
    openRouterApiKey: str('OPENROUTER_API_KEY'),
    llmModel: str('LLM_MODEL') ?? 'anthropic/claude-haiku-4.5',
    openRouterBaseUrl: (str('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    scraperSource: str('SCRAPER_SOURCE') === 'portal' ? 'portal' : 'mock',
    portalUrl: str('PORTAL_URL') ?? 'http://localhost:4010',
    portalUser: str('PORTAL_USER') ?? 'aluno@portal.local',
    portalPassword: str('PORTAL_PASSWORD') ?? 'aluno123',
    chromiumPath: str('CHROMIUM_PATH'),
  };
}
