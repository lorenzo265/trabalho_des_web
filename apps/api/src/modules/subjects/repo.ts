import type { Db } from '../../db/db';
import { all, one } from '../../db/db';
import type { SubjectRow } from '../../db/rows';
import { notFound } from '../../lib/errors';

export const SUBJECT_SQL = `
  select s.*,
    (select count(*) from topics t where t.subject_id = s.id) as topic_count,
    (select count(*) from topics t where t.subject_id = s.id and t.status = 'concluido') as done_count
  from subjects s`;

export const getSubject = (db: Db, userId: number, id: number) =>
  one<SubjectRow>(db, `${SUBJECT_SQL} where s.id = ? and s.user_id = ?`, id, userId);

/** Disciplina do usuário ou 404 (disciplina de outro usuário também é 404). */
export function requireSubject(db: Db, userId: number, id: number): SubjectRow {
  const s = getSubject(db, userId, id);
  if (!s) throw notFound('Disciplina');
  return s;
}

/** Comparação sem caixa e sem espaços nas pontas, com Unicode (o NOCASE do SQLite só cobre ASCII). */
export const normalizeName = (s: string): string => s.trim().toLocaleLowerCase('pt-BR');

export const subjectNameTaken = (db: Db, userId: number, name: string, exceptId = -1): boolean => {
  const wanted = normalizeName(name);
  return all<{ name: string }>(db, 'select name from subjects where user_id = ? and id != ?', userId, exceptId).some(
    (r) => normalizeName(r.name) === wanted,
  );
};
