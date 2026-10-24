import { Router } from 'express';
import { scrapeResultSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { insert, one, run } from '../../db/db';
import type { SyncRunRow } from '../../db/rows';
import { HttpError } from '../../lib/errors';
import { toSyncRun } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { importScrape } from './import';

const SCRAPE_TIMEOUT_MS = 5 * 60_000;

export function syncRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db, config } = ctx;
  r.use('/sync', requireAuth);

  const latest = (userId: number, running: boolean) =>
    one<SyncRunRow>(
      db,
      `select * from sync_runs where user_id = ? and status ${running ? "=" : "!="} 'running' order by id desc limit 1`,
      userId,
    );

  r.get('/sync', (req, res) => {
    const userId = req.auth!.user.id;
    const current = latest(userId, true);
    const last = latest(userId, false);
    res.json({
      source: config.scraperSource,
      current: current ? toSyncRun(current) : null,
      last: last ? toSyncRun(last) : null,
    });
  });

  // Dispara a leitura em segundo plano (202). As credenciais do portal vêm do ambiente, nunca do cliente.
  r.post('/sync', (req, res) => {
    const userId = req.auth!.user.id;
    if (latest(userId, true)) throw new HttpError(409, 'sync_running', 'Já existe uma sincronização em andamento.');
    const runId = insert(
      db,
      "insert into sync_runs (user_id, source, status, started_at) values (?, ?, 'running', ?)",
      userId, config.scraperSource, ctx.now(),
    );

    const job = runSync(ctx, userId, runId).finally(() => ctx.pendingSyncs.delete(job));
    ctx.pendingSyncs.add(job);

    res.status(202).json(toSyncRun(one<SyncRunRow>(db, 'select * from sync_runs where id = ?', runId)!));
  });

  return r;
}

async function runSync(ctx: Ctx, userId: number, runId: number): Promise<void> {
  const { db, config } = ctx;
  const finish = (status: 'ok' | 'error', stats: unknown, error: string | null) =>
    run(
      db,
      'update sync_runs set status = ?, finished_at = ?, stats_json = ?, error = ? where id = ?',
      status, ctx.now(), stats ? JSON.stringify(stats) : null, error, runId,
    );

  let timer: NodeJS.Timeout | undefined;
  try {
    const raw = await Promise.race([
      ctx.scrape({
        source: config.scraperSource,
        baseUrl: config.portalUrl,
        username: config.portalUser,
        password: config.portalPassword,
        chromiumPath: config.chromiumPath,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('tempo esgotado ao ler a plataforma')), SCRAPE_TIMEOUT_MS);
      }),
    ]);
    const parsed = scrapeResultSchema.safeParse(raw);
    if (!parsed.success) throw new Error('a plataforma retornou dados em formato inesperado');
    finish('ok', importScrape(db, userId, parsed.data, ctx.now()), null);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split(config.portalPassword).join('***');
    finish('error', null, `Não foi possível sincronizar: ${msg}`.slice(0, 300));
  } finally {
    clearTimeout(timer);
  }
}
