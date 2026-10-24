import { Router } from 'express';
import { subjectInputSchema, subjectPatchSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, insert, run } from '../../db/db';
import type { SubjectRow } from '../../db/rows';
import { HttpError } from '../../lib/errors';
import { intParam, parseBody } from '../../lib/http';
import { toSubject } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { SUBJECT_SQL, requireSubject, subjectNameTaken } from './repo';

const NAME_TAKEN = new HttpError(409, 'name_taken', 'Você já tem uma disciplina com esse nome.');

export function subjectRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use('/subjects', requireAuth);

  r.get('/subjects', (req, res) => {
    const rows = all<SubjectRow>(db, `${SUBJECT_SQL} where s.user_id = ? order by s.id`, req.auth!.user.id);
    // Ordem alfabética em português (o collate do SQLite não entende acentos).
    const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });
    res.json({ items: rows.map(toSubject).sort((a, b) => byName.compare(a.name, b.name)) });
  });

  r.post('/subjects', (req, res) => {
    const userId = req.auth!.user.id;
    const input = parseBody(subjectInputSchema, req.body);
    if (subjectNameTaken(db, userId, input.name)) throw NAME_TAKEN;
    const id = insert(
      db,
      `insert into subjects (user_id, name, professor, room, color, source, created_at)
       values (?, ?, ?, ?, ?, 'manual', ?)`,
      userId, input.name, input.professor, input.room, input.color, ctx.now(),
    );
    res.status(201).json(toSubject(requireSubject(db, userId, id)));
  });

  r.get('/subjects/:id', (req, res) => {
    res.json(toSubject(requireSubject(db, req.auth!.user.id, intParam(req))));
  });

  r.patch('/subjects/:id', (req, res) => {
    const userId = req.auth!.user.id;
    const current = requireSubject(db, userId, intParam(req));
    const patch = parseBody(subjectPatchSchema, req.body);
    if (patch.name !== undefined && subjectNameTaken(db, userId, patch.name, current.id)) throw NAME_TAKEN;
    // Texto vazio em professor/sala limpa o campo.
    const text = (v: string | null | undefined, keep: string | null) =>
      v === undefined ? keep : v === null || v === '' ? null : v;
    run(
      db,
      'update subjects set name = ?, professor = ?, room = ?, color = ? where id = ?',
      patch.name ?? current.name,
      text(patch.professor, current.professor),
      text(patch.room, current.room),
      patch.color ?? current.color,
      current.id,
    );
    res.json(toSubject(requireSubject(db, userId, current.id)));
  });

  // Tópicos, metas, aulas, trabalhos e conversas ligados caem em cascata.
  r.delete('/subjects/:id', (req, res) => {
    const s = requireSubject(db, req.auth!.user.id, intParam(req));
    run(db, 'delete from subjects where id = ?', s.id);
    res.status(204).end();
  });

  return r;
}
