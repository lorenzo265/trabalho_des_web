import express, { type Express } from 'express';
import type { AppDeps, Ctx } from './context';
import { systemClock, MINUTE } from './clock';
import { RateLimiter } from './lib/rate-limit';
import { attachAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { originCheck } from './middleware/origin';
import { securityHeaders } from './middleware/security';
import { createAccessService } from './modules/access/service';
import { adminRoutes } from './modules/admin/routes';
import { authRoutes } from './modules/auth/routes';
import { chatRoutes } from './modules/chat/routes';
import { goalRoutes } from './modules/goals/routes';
import { lessonRoutes } from './modules/lessons/routes';
import { studyRoutes } from './modules/study/routes';
import { subjectRoutes } from './modules/subjects/routes';
import { syncRoutes } from './modules/sync/routes';
import { topicRoutes } from './modules/topics/routes';

/** Serviços expostos em `app.locals.services` (varredura de sessões e espera de sync, usados em testes). */
export interface AppServices {
  sweepExpired: () => number;
  waitForSyncs: () => Promise<void>;
}

export function createApp(deps: AppDeps): Express {
  const clock = deps.clock ?? systemClock;
  const { db, config } = deps;

  const ctx: Ctx = {
    db,
    config,
    clock,
    now: () => clock().toISOString(),
    access: createAccessService(db, clock, config),
    llm: deps.llm,
    scrape: deps.scrape,
    limiters: {
      login: new RateLimiter(10, 10 * MINUTE, clock),
      register: new RateLimiter(10, 10 * MINUTE, clock),
      chat: new RateLimiter(20, MINUTE, clock),
    },
    activeStreams: new Set(),
    pendingSyncs: new Set(),
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  app.use(express.json({ limit: '100kb' }));
  app.use(originCheck(config));
  app.use(attachAuth(ctx));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.get('/config', (_req, res) => {
    res.json({
      appName: config.appName,
      aiMode: ctx.llm.mode,
      googleEnabled: false,
      scraperSource: config.scraperSource,
    });
  });
  api.use(
    authRoutes(ctx),
    adminRoutes(ctx),
    subjectRoutes(ctx),
    topicRoutes(ctx),
    goalRoutes(ctx),
    studyRoutes(ctx),
    chatRoutes(ctx),
    lessonRoutes(ctx),
    syncRoutes(ctx),
  );
  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const services: AppServices = {
    sweepExpired: ctx.access.sweepExpired,
    waitForSyncs: async () => {
      while (ctx.pendingSyncs.size) await Promise.all([...ctx.pendingSyncs]);
    },
  };
  app.locals.services = services;
  return app;
}
