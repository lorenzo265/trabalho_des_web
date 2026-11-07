import { Router } from 'express';
import { assignmentPatchSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, one, run } from '../../db/db';
import type { AssignmentRow, LessonRow } from '../../db/rows';
import { notFound } from '../../lib/errors';
import { intParam, parseBody, qsDate, qsInt } from '../../lib/http';
import { toAssignment, toLesson } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';

/** Aulas e trabalhos lidos da faculdade (somente leitura para o aluno). */
export function lessonRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use(['/lessons', '/assignments'], requireAuth);

  r.get('/lessons', (req, res) => {
    const where = ['l.user_id = ?'];
    const params: unknown[] = [req.auth!.user.id];
    const from = qsDate(req, 'from');
    const to = qsDate(req, 'to');
    const subjectId = qsInt(req, 'subjectId');
    if (from) (where.push('l.date >= ?'), params.push(from));
    if (to) (where.push('l.date <= ?'), params.push(to));
    if (subjectId !== undefined) (where.push('l.subject_id = ?'), params.push(subjectId));
    const rows = all<LessonRow>(
      db,
      `select l.*, s.name as subject_name, s.color as subject_color
       from lessons l join subjects s on s.id = l.subject_id
       where ${where.join(' and ')} order by l.date, l.start_time, l.id limit 1000`,
      ...params,
    );
    res.json({ items: rows.map(toLesson) });
  });

  r.get('/assignments', (req, res) => {
    const rows = all<AssignmentRow>(
      db,
      `select a.*, s.name as subject_name, s.color as subject_color
       from assignments a join subjects s on s.id = a.subject_id
       where a.user_id = ? order by a.due_date, a.id limit 1000`,
      req.auth!.user.id,
    );
    res.json({ items: rows.map(toAssignment) });
  });

  // Só o PESO é do aluno; título, prazo, situação e nota vêm da faculdade (somente leitura).
  r.patch('/assignments/:id', (req, res) => {
    const userId = req.auth!.user.id;
    const id = intParam(req);
    const patch = parseBody(assignmentPatchSchema, req.body);
    if (!one(db, 'select 1 as x from assignments where id = ? and user_id = ?', id, userId)) throw notFound('Trabalho');
    run(db, 'update assignments set weight = ? where id = ? and user_id = ?', patch.weight, id, userId);
    const row = one<AssignmentRow>(
      db,
      `select a.*, s.name as subject_name, s.color as subject_color
       from assignments a join subjects s on s.id = a.subject_id where a.id = ?`,
      id,
    )!;
    res.json(toAssignment(row));
  });

  return r;
}
