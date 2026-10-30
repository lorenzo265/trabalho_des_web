import { Router } from 'express';
import type { Ctx } from '../../context';
import { qsDate, qsInt } from '../../lib/http';
import { toAssignment, toLesson } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { listAssignments, listLessons } from './repo';

/** Aulas e trabalhos lidos da faculdade (somente leitura para o aluno). */
export function lessonRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use(['/lessons', '/assignments'], requireAuth);

  r.get('/lessons', (req, res) => {
    const rows = listLessons(db, req.auth!.user.id, {
      from: qsDate(req, 'from'),
      to: qsDate(req, 'to'),
      subjectId: qsInt(req, 'subjectId'),
    });
    res.json({ items: rows.map(toLesson) });
  });

  r.get('/assignments', (req, res) => {
    res.json({ items: listAssignments(db, req.auth!.user.id).map(toAssignment) });
  });

  return r;
}
