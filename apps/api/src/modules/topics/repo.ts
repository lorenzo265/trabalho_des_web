import type { Db } from '../../db/db';
import { all, insert, one, run } from '../../db/db';
import type { TopicRow } from '../../db/rows';
import { notFound } from '../../lib/errors';

export interface NewTopic {
  title: string;
  notes: string | null;
  dueDate: string | null;
}

export interface TopicChanges {
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: TopicRow['status'];
  doneAt: string | null;
}

/** Tópico do usuário (dono resolvido via disciplina) ou 404. */
export function requireTopic(db: Db, userId: number, id: number): TopicRow {
  const t = one<TopicRow>(
    db,
    `select t.* from topics t join subjects s on s.id = t.subject_id where t.id = ? and s.user_id = ?`,
    id, userId,
  );
  if (!t) throw notFound('Tópico');
  return t;
}

export const listTopics = (db: Db, subjectId: number): TopicRow[] =>
  all<TopicRow>(db, 'select * from topics where subject_id = ? order by position, id', subjectId);

/** Cria o tópico no fim da lista da disciplina e devolve o id. */
export function insertTopic(db: Db, subjectId: number, t: NewTopic): number {
  const next = one<{ p: number }>(
    db,
    'select coalesce(max(position), -1) + 1 p from topics where subject_id = ?',
    subjectId,
  )!.p;
  return insert(
    db,
    'insert into topics (subject_id, title, notes, position, due_date) values (?, ?, ?, ?, ?)',
    subjectId, t.title, t.notes, next, t.dueDate,
  );
}

export const updateTopic = (db: Db, id: number, c: TopicChanges): void => {
  run(
    db,
    'update topics set title = ?, notes = ?, due_date = ?, status = ?, done_at = ? where id = ?',
    c.title, c.notes, c.dueDate, c.status, c.doneAt, id,
  );
};

export const deleteTopic = (db: Db, id: number): void => {
  run(db, 'delete from topics where id = ?', id);
};
