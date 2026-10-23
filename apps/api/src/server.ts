import { loadConfig } from './config';
import { createApp } from './app';
import { systemClock, MINUTE } from './clock';
import type { ScrapeFn } from './context';
import { openDb } from './db/db';
import { bootstrapAdmin } from './modules/auth/users';
import { DemoLlm } from './modules/chat/demo';
import type { LlmClient } from './modules/chat/llm';
import { OpenRouterLlm } from './modules/chat/openrouter';
import { recoverStaleSyncs } from './modules/sync/import';

const config = loadConfig();
const db = openDb(config.dbPath);

const llm: LlmClient = config.openRouterApiKey
  ? new OpenRouterLlm({ apiKey: config.openRouterApiKey, model: config.llmModel, baseUrl: config.openRouterBaseUrl })
  : new DemoLlm();

// O scraper (Playwright) só é carregado quando o sync é disparado: a API sobe sem ele.
const scrape: ScrapeFn = async (opts) => {
  const specifier = '@edumind/scraper';
  const mod = (await import(specifier)) as { scrape: ScrapeFn };
  return mod.scrape(opts);
};

const nowIso = () => systemClock().toISOString();
recoverStaleSyncs(db, nowIso());

if (config.adminEmail && config.adminPassword) {
  if (config.adminPassword.length < 8) {
    console.warn('[api] ADMIN_PASSWORD precisa ter pelo menos 8 caracteres — administrador não criado.');
  } else {
    const r = await bootstrapAdmin(
      db,
      { email: config.adminEmail, password: config.adminPassword, name: config.adminName },
      nowIso(),
    );
    if (r !== 'unchanged') console.log(`[api] administrador ${config.adminEmail}: ${r === 'created' ? 'criado' : 'promovido'}.`);
  }
}

const app = createApp({ db, config, llm, scrape });
const { sweepExpired } = app.locals.services as { sweepExpired: () => number };
sweepExpired();
setInterval(sweepExpired, 5 * MINUTE).unref();

const server = app.listen(config.port, () => {
  console.log(`[api] ${config.appName} em http://localhost:${config.port} · tutor: ${llm.mode} · fonte: ${config.scraperSource}`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
