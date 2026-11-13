import { Router } from 'express';
import type { Ctx } from '../../context';
import { pagination } from '../../lib/http';
import { toChange } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { listChanges, markAllSeen } from './repo';

/** Novidades do sync (somente do próprio usuário). */
export function changeRoutes(ctx: Ctx) {
  const r = Router();
  const { db } = ctx;
  r.use('/changes', requireAuth);

  r.get('/changes', (req, res) => {
    const { items, unseen } = listChanges(db, req.auth!.user.id, pagination(req).limit);
    res.json({ items: items.map(toChange), unseen });
  });

  r.post('/changes/seen', (req, res) => {
    markAllSeen(db, req.auth!.user.id, ctx.now());
    res.status(204).end();
  });

  return r;
}
