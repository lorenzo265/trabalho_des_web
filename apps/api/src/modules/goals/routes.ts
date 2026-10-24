import { Router } from 'express';
import { goalInputSchema, goalPatchSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, insert, one, run } from '../../db/db';
import type { GoalRow } from '../../db/rows';
import { HttpError, notFound } from '../../lib/errors';
import { assertRealDate, intParam, parseBody, qsDate } from '../../lib/http';
import { toGoal } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';

const GOAL_SQL = `
  select g.*, s.name as subject_name, s.color as subject_color
  from daily_goals g join subjects s on s.id = g.subject_id`;

export function goalRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use('/goals', requireAuth);

  const ownedGoal = (userId: number, id: number): GoalRow => {
    const g = one<GoalRow>(db, `${GOAL_SQL} where g.id = ? and g.user_id = ?`, id, userId);
    if (!g) throw notFound('Meta');
    return g;
  };

  r.get('/goals', (req, res) => {
    const date = qsDate(req, 'date');
    if (!date) throw new HttpError(422, 'validation_error', 'Informe a data (date=AAAA-MM-DD).');
    const rows = all<GoalRow>(
      db,
      `${GOAL_SQL} where g.user_id = ? and g.goal_date = ? order by g.done, g.id`,
      req.auth!.user.id, date,
    );
    res.json({ items: rows.map(toGoal) });
  });

  r.post('/goals', (req, res) => {
    const userId = req.auth!.user.id;
    const input = parseBody(goalInputSchema, req.body);
    assertRealDate(input.goalDate);
    requireSubject(db, userId, input.subjectId);
    const id = insert(
      db,
      `insert into daily_goals (user_id, subject_id, goal_date, description, target_minutes)
       values (?, ?, ?, ?, ?)`,
      userId, input.subjectId, input.goalDate, input.description, input.targetMinutes,
    );
    res.status(201).json(toGoal(ownedGoal(userId, id)));
  });

  r.patch('/goals/:id', (req, res) => {
    const userId = req.auth!.user.id;
    const current = ownedGoal(userId, intParam(req));
    const patch = parseBody(goalPatchSchema, req.body);
    if (patch.goalDate) assertRealDate(patch.goalDate);
    const done = patch.done === undefined ? current.done === 1 : patch.done;
    const doneAt = done ? (current.done === 1 ? current.done_at : ctx.now()) : null;
    run(
      db,
      'update daily_goals set description = ?, target_minutes = ?, goal_date = ?, done = ?, done_at = ? where id = ?',
      patch.description ?? current.description,
      patch.targetMinutes === undefined ? current.target_minutes : patch.targetMinutes,
      patch.goalDate ?? current.goal_date,
      done ? 1 : 0,
      doneAt,
      current.id,
    );
    res.json(toGoal(ownedGoal(userId, current.id)));
  });

  r.delete('/goals/:id', (req, res) => {
    const g = ownedGoal(req.auth!.user.id, intParam(req));
    run(db, 'delete from daily_goals where id = ?', g.id);
    res.status(204).end();
  });

  return r;
}
