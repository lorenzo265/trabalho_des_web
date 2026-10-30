import type { Db } from '../../db/db';
import { all } from '../../db/db';
import type { AssignmentRow, LessonRow } from '../../db/rows';

export interface LessonFilter {
  /** AAAA-MM-DD, inclusive. */
  from?: string;
  to?: string;
  subjectId?: number;
}

export function listLessons(db: Db, userId: number, f: LessonFilter): LessonRow[] {
  const where = ['l.user_id = ?'];
  const params: unknown[] = [userId];
  if (f.from) (where.push('l.date >= ?'), params.push(f.from));
  if (f.to) (where.push('l.date <= ?'), params.push(f.to));
  if (f.subjectId !== undefined) (where.push('l.subject_id = ?'), params.push(f.subjectId));
  return all<LessonRow>(
    db,
    `select l.*, s.name as subject_name, s.color as subject_color
     from lessons l join subjects s on s.id = l.subject_id
     where ${where.join(' and ')} order by l.date, l.start_time, l.id limit 1000`,
    ...params,
  );
}

export const listAssignments = (db: Db, userId: number): AssignmentRow[] =>
  all<AssignmentRow>(
    db,
    `select a.*, s.name as subject_name, s.color as subject_color
     from assignments a join subjects s on s.id = a.subject_id
     where a.user_id = ? order by a.due_date, a.id limit 1000`,
    userId,
  );
