import { Router } from 'express';
import { topicInputSchema, topicPatchSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, insert, one, run } from '../../db/db';
import type { TopicRow } from '../../db/rows';
import { notFound } from '../../lib/errors';
import { assertRealDate, intParam, parseBody } from '../../lib/http';
import { toTopic } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';

export function topicRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use(['/subjects/:id/topics', '/topics'], requireAuth);

  /** Tópico do usuário (dono resolvido via disciplina) ou 404. */
  const ownedTopic = (userId: number, id: number): TopicRow => {
    const t = one<TopicRow>(
      db,
      `select t.* from topics t join subjects s on s.id = t.subject_id where t.id = ? and s.user_id = ?`,
      id, userId,
    );
    if (!t) throw notFound('Tópico');
    return t;
  };

  r.get('/subjects/:id/topics', (req, res) => {
    const subject = requireSubject(db, req.auth!.user.id, intParam(req));
    const rows = all<TopicRow>(db, 'select * from topics where subject_id = ? order by position, id', subject.id);
    res.json({ items: rows.map(toTopic) });
  });

  r.post('/subjects/:id/topics', (req, res) => {
    const subject = requireSubject(db, req.auth!.user.id, intParam(req));
    const input = parseBody(topicInputSchema, req.body);
    if (input.dueDate) assertRealDate(input.dueDate, 'Prazo');
    const next = one<{ p: number }>(
      db,
      'select coalesce(max(position), -1) + 1 p from topics where subject_id = ?',
      subject.id,
    )!.p;
    const id = insert(
      db,
      'insert into topics (subject_id, title, notes, position, due_date) values (?, ?, ?, ?, ?)',
      subject.id, input.title, input.notes, next, input.dueDate,
    );
    res.status(201).json(toTopic(ownedTopic(req.auth!.user.id, id)));
  });

  r.patch('/topics/:id', (req, res) => {
    const userId = req.auth!.user.id;
    const current = ownedTopic(userId, intParam(req));
    const patch = parseBody(topicPatchSchema, req.body);
    if (patch.dueDate) assertRealDate(patch.dueDate, 'Prazo');
    const status = patch.status ?? current.status;
    // done_at coerente: preenche ao concluir, mantém se já estava concluído, limpa ao reabrir.
    const doneAt = status === 'concluido' ? (current.status === 'concluido' ? current.done_at : ctx.now()) : null;
    run(
      db,
      'update topics set title = ?, notes = ?, due_date = ?, status = ?, done_at = ? where id = ?',
      patch.title ?? current.title,
      patch.notes === undefined ? current.notes : patch.notes || null,
      patch.dueDate === undefined ? current.due_date : patch.dueDate,
      status,
      doneAt,
      current.id,
    );
    res.json(toTopic(ownedTopic(userId, current.id)));
  });

  r.delete('/topics/:id', (req, res) => {
    const t = ownedTopic(req.auth!.user.id, intParam(req));
    run(db, 'delete from topics where id = ?', t.id);
    res.status(204).end();
  });

  return r;
}
