import { Router } from 'express';
import { goalInputSchema, goalPatchSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { HttpError } from '../../lib/errors';
import { assertRealDate, intParam, parseBody, qsDate } from '../../lib/http';
import { toGoal } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';
import { deleteGoal, insertGoal, listGoalsOfDay, requireGoal, updateGoal } from './repo';

export function goalRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use('/goals', requireAuth);

  r.get('/goals', (req, res) => {
    const date = qsDate(req, 'date');
    if (!date) throw new HttpError(422, 'validation_error', 'Informe a data (date=AAAA-MM-DD).');
    res.json({ items: listGoalsOfDay(db, req.auth!.user.id, date).map(toGoal) });
  });

  r.post('/goals', (req, res) => {
    const userId = req.auth!.user.id;
    const input = parseBody(goalInputSchema, req.body);
    assertRealDate(input.goalDate);
    requireSubject(db, userId, input.subjectId);
    const id = insertGoal(db, userId, input);
    res.status(201).json(toGoal(requireGoal(db, userId, id)));
  });

  r.patch('/goals/:id', (req, res) => {
    const userId = req.auth!.user.id;
    const current = requireGoal(db, userId, intParam(req));
    const patch = parseBody(goalPatchSchema, req.body);
    if (patch.goalDate) assertRealDate(patch.goalDate);
    const done = patch.done === undefined ? current.done === 1 : patch.done;
    const doneAt = done ? (current.done === 1 ? current.done_at : ctx.now()) : null;
    updateGoal(db, current.id, {
      description: patch.description ?? current.description,
      targetMinutes: patch.targetMinutes === undefined ? current.target_minutes : patch.targetMinutes,
      goalDate: patch.goalDate ?? current.goal_date,
      done,
      doneAt,
    });
    res.json(toGoal(requireGoal(db, userId, current.id)));
  });

  r.delete('/goals/:id', (req, res) => {
    const g = requireGoal(db, req.auth!.user.id, intParam(req));
    deleteGoal(db, g.id);
    res.status(204).end();
  });

  return r;
}
