import { Router } from 'express';
import { topicInputSchema, topicPatchSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { assertRealDate, intParam, parseBody } from '../../lib/http';
import { toTopic } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';
import { deleteTopic, insertTopic, listTopics, requireTopic, updateTopic } from './repo';

export function topicRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use(['/subjects/:id/topics', '/topics'], requireAuth);

  r.get('/subjects/:id/topics', (req, res) => {
    const subject = requireSubject(db, req.auth!.user.id, intParam(req));
    res.json({ items: listTopics(db, subject.id).map(toTopic) });
  });

  r.post('/subjects/:id/topics', (req, res) => {
    const subject = requireSubject(db, req.auth!.user.id, intParam(req));
    const input = parseBody(topicInputSchema, req.body);
    if (input.dueDate) assertRealDate(input.dueDate, 'Prazo');
    const id = insertTopic(db, subject.id, input);
    res.status(201).json(toTopic(requireTopic(db, req.auth!.user.id, id)));
  });

  r.patch('/topics/:id', (req, res) => {
    const userId = req.auth!.user.id;
    const current = requireTopic(db, userId, intParam(req));
    const patch = parseBody(topicPatchSchema, req.body);
    if (patch.dueDate) assertRealDate(patch.dueDate, 'Prazo');
    const status = patch.status ?? current.status;
    // done_at coerente: preenche ao concluir, mantém se já estava concluído, limpa ao reabrir.
    const doneAt = status === 'concluido' ? (current.status === 'concluido' ? current.done_at : ctx.now()) : null;
    updateTopic(db, current.id, {
      title: patch.title ?? current.title,
      notes: patch.notes === undefined ? current.notes : patch.notes || null,
      dueDate: patch.dueDate === undefined ? current.due_date : patch.dueDate,
      status,
      doneAt,
    });
    res.json(toTopic(requireTopic(db, userId, current.id)));
  });

  r.delete('/topics/:id', (req, res) => {
    const t = requireTopic(db, req.auth!.user.id, intParam(req));
    deleteTopic(db, t.id);
    res.status(204).end();
  });

  return r;
}
