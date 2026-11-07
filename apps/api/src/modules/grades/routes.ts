import { Router } from 'express';
import type { Ctx } from '../../context';
import { all } from '../../db/db';
import type { AssignmentRow } from '../../db/rows';
import { intParam } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';
import { computeProjection } from './calc';

/** Média ponderada e "quanto preciso tirar" de uma disciplina do aluno. */
export function gradeRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use('/subjects/:id/grades', requireAuth);

  r.get('/subjects/:id/grades', (req, res) => {
    const subject = requireSubject(db, req.auth!.user.id, intParam(req));
    const rows = all<AssignmentRow>(
      db,
      `select a.*, s.name as subject_name, s.color as subject_color
       from assignments a join subjects s on s.id = a.subject_id
       where a.subject_id = ? and a.user_id = ?`,
      subject.id, req.auth!.user.id,
    );
    res.json(
      computeProjection(
        subject.id,
        subject.target_average,
        rows.map((a) => ({ id: a.id, title: a.title, dueDate: a.due_date, status: a.status, grade: a.grade, weight: a.weight })),
      ),
    );
  });

  return r;
}
