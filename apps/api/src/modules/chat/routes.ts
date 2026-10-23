import { Router, type Response } from 'express';
import { messageInputSchema, threadInputSchema } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, insert, one, run } from '../../db/db';
import type { MessageRow, ThreadRow } from '../../db/rows';
import { HttpError, notFound, tooMany } from '../../lib/errors';
import { intParam, parseBody, qsInt } from '../../lib/http';
import { toMessage, toThread } from '../../lib/mappers';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';
import { LlmError } from './llm';
import { buildSystemPrompt } from './prompt';

const THREAD_SQL = `
  select c.*, s.name as subject_name, s.color as subject_color
  from chat_threads c left join subjects s on s.id = c.subject_id`;

const HISTORY_SIZE = 12;
const INTERRUPTED = '\n\n_[resposta interrompida]_';

const makeTitle = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 59).trimEnd()}…` : flat;
};

export function chatRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db, llm } = ctx;
  r.use('/chats', requireAuth);

  const ownedThread = (userId: number, id: number): ThreadRow => {
    const t = one<ThreadRow>(db, `${THREAD_SQL} where c.id = ? and c.user_id = ?`, id, userId);
    if (!t) throw notFound('Conversa');
    return t;
  };
  const addMessage = (threadId: number, role: 'user' | 'assistant', content: string): MessageRow => {
    const now = ctx.now();
    const id = insert(
      db,
      'insert into chat_messages (thread_id, role, content, created_at) values (?, ?, ?, ?)',
      threadId, role, content, now,
    );
    run(db, 'update chat_threads set updated_at = ? where id = ?', now, threadId);
    return one<MessageRow>(db, 'select * from chat_messages where id = ?', id)!;
  };

  r.get('/chats', (req, res) => {
    const subjectId = qsInt(req, 'subjectId');
    const rows = all<ThreadRow>(
      db,
      `${THREAD_SQL} where c.user_id = ? ${subjectId === undefined ? '' : 'and c.subject_id = ?'}
       order by c.updated_at desc, c.id desc`,
      req.auth!.user.id, ...(subjectId === undefined ? [] : [subjectId]),
    );
    res.json({ items: rows.map(toThread) });
  });

  r.post('/chats', (req, res) => {
    const userId = req.auth!.user.id;
    const input = parseBody(threadInputSchema, req.body);
    if (input.subjectId !== null) requireSubject(db, userId, input.subjectId);
    const now = ctx.now();
    const id = insert(
      db,
      'insert into chat_threads (user_id, subject_id, title, created_at, updated_at) values (?, ?, ?, ?, ?)',
      userId, input.subjectId, input.title, now, now,
    );
    res.status(201).json(toThread(ownedThread(userId, id)));
  });

  r.get('/chats/:id/messages', (req, res) => {
    const thread = ownedThread(req.auth!.user.id, intParam(req));
    const rows = all<MessageRow>(db, 'select * from chat_messages where thread_id = ? order by id', thread.id);
    res.json({ thread: toThread(thread), items: rows.map(toMessage) });
  });

  r.delete('/chats/:id', (req, res) => {
    const thread = ownedThread(req.auth!.user.id, intParam(req));
    run(db, 'delete from chat_threads where id = ?', thread.id);
    res.status(204).end();
  });

  // Envia a pergunta e devolve a resposta do tutor em streaming (SSE: user, token, done, error).
  r.post('/chats/:id/messages', async (req, res) => {
    const { user } = req.auth!;
    const thread = ownedThread(user.id, intParam(req));
    const input = parseBody(messageInputSchema, req.body);

    // Limites ANTES de abrir o stream, para responder com JSON e o status certo.
    const wait = ctx.limiters.chat.retryAfter(String(user.id));
    if (wait !== null) throw tooMany(wait);
    if (ctx.activeStreams.has(user.id)) {
      throw new HttpError(429, 'stream_busy', 'Aguarde o Professor Tutor terminar a resposta anterior.');
    }
    ctx.limiters.chat.hit(String(user.id));
    ctx.activeStreams.add(user.id);

    const userMessage = addMessage(thread.id, 'user', input.content);
    if (!thread.title) {
      run(db, "update chat_threads set title = ? where id = ? and (title is null or title = '')", makeTitle(input.content), thread.id);
    }
    const history = all<MessageRow>(
      db,
      `select * from (select * from chat_messages where thread_id = ? order by id desc limit ?) order by id`,
      thread.id, HISTORY_SIZE,
    ).map((m) => ({ role: m.role, content: m.content }));

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    const send = (event: string, data: unknown) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort(); // aluno fechou a aba / desconectou
    });

    let text = '';
    let failure: LlmError | null = null;
    try {
      send('user', toMessage(userMessage));
      const stream = llm.stream({
        system: buildSystemPrompt({ firstName: user.name.split(/\s+/)[0] ?? user.name, subjectName: thread.subject_name, level: user.level }),
        history,
        context: { firstName: user.name.split(/\s+/)[0] ?? user.name, subjectName: thread.subject_name, level: user.level },
        signal: abort.signal,
      });
      for await (const piece of stream) {
        text += piece;
        send('token', { t: piece });
      }
    } catch (e) {
      failure =
        e instanceof LlmError
          ? e
          : new LlmError('ai_unavailable', 'O Professor Tutor não conseguiu responder agora. Tente novamente em instantes.');
      if (!(e instanceof LlmError)) console.error('[api] falha no stream do tutor:', e);
    }

    try {
      if (abort.signal.aborted) {
        // Cliente saiu no meio: guarda o que já foi gerado, marcado como interrompido.
        if (text) addMessage(thread.id, 'assistant', text + INTERRUPTED);
      } else if (failure) {
        if (text) addMessage(thread.id, 'assistant', text + INTERRUPTED);
        send('error', { code: failure.code, message: failure.message });
      } else if (!text.trim()) {
        send('error', { code: 'ai_empty', message: 'O Professor Tutor não retornou resposta. Tente reformular a pergunta.' });
      } else {
        send('done', toMessage(addMessage(thread.id, 'assistant', text)));
      }
    } finally {
      ctx.activeStreams.delete(user.id);
      endSse(res);
    }
  });

  return r;
}

function endSse(res: Response): void {
  if (!res.writableEnded) res.end();
}
