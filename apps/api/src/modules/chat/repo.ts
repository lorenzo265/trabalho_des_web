import type { Db } from '../../db/db';
import { all, insert, one, run } from '../../db/db';
import type { MessageRow, ThreadRow } from '../../db/rows';
import { notFound } from '../../lib/errors';

const THREAD_SQL = `
  select c.*, s.name as subject_name, s.color as subject_color
  from chat_threads c left join subjects s on s.id = c.subject_id`;

/** Conversa do usuário ou 404. */
export function requireThread(db: Db, userId: number, id: number): ThreadRow {
  const t = one<ThreadRow>(db, `${THREAD_SQL} where c.id = ? and c.user_id = ?`, id, userId);
  if (!t) throw notFound('Conversa');
  return t;
}

/** Conversas do usuário, da mais recente para a mais antiga; `subjectId` filtra por disciplina. */
export const listThreads = (db: Db, userId: number, subjectId?: number): ThreadRow[] =>
  all<ThreadRow>(
    db,
    `${THREAD_SQL} where c.user_id = ? ${subjectId === undefined ? '' : 'and c.subject_id = ?'}
     order by c.updated_at desc, c.id desc`,
    userId, ...(subjectId === undefined ? [] : [subjectId]),
  );

export const insertThread = (
  db: Db,
  userId: number,
  subjectId: number | null,
  title: string | null,
  now: string,
): number =>
  insert(
    db,
    'insert into chat_threads (user_id, subject_id, title, created_at, updated_at) values (?, ?, ?, ?, ?)',
    userId, subjectId, title, now, now,
  );

export const deleteThread = (db: Db, id: number): void => {
  run(db, 'delete from chat_threads where id = ?', id);
};

/** Dá título à conversa só se ela ainda não tiver um. */
export const setThreadTitleIfEmpty = (db: Db, id: number, title: string): void => {
  run(db, "update chat_threads set title = ? where id = ? and (title is null or title = '')", title, id);
};

export const listMessages = (db: Db, threadId: number): MessageRow[] =>
  all<MessageRow>(db, 'select * from chat_messages where thread_id = ? order by id', threadId);

/** As últimas `limit` mensagens, em ordem cronológica. */
export const recentMessages = (db: Db, threadId: number, limit: number): MessageRow[] =>
  all<MessageRow>(
    db,
    `select * from (select * from chat_messages where thread_id = ? order by id desc limit ?) order by id`,
    threadId, limit,
  );

/** Grava a mensagem e atualiza `updated_at` da conversa. */
export function insertMessage(
  db: Db,
  threadId: number,
  role: MessageRow['role'],
  content: string,
  now: string,
): MessageRow {
  const id = insert(
    db,
    'insert into chat_messages (thread_id, role, content, created_at) values (?, ?, ?, ?)',
    threadId, role, content, now,
  );
  run(db, 'update chat_threads set updated_at = ? where id = ?', now, threadId);
  return one<MessageRow>(db, 'select * from chat_messages where id = ?', id)!;
}
