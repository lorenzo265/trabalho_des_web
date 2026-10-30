import type { Db } from '../../db/db';
import { all, insert, one } from '../../db/db';

export interface NewStudySession {
  subjectId: number;
  startedAt: string;
  day: string;
  minutes: number;
}

export const insertStudySession = (db: Db, userId: number, s: NewStudySession): number =>
  insert(
    db,
    'insert into study_sessions (user_id, subject_id, started_at, day, minutes) values (?, ?, ?, ?, ?)',
    userId, s.subjectId, s.startedAt, s.day, s.minutes,
  );

/** Minutos estudados por dia, entre duas datas (inclusive). Dias sem estudo não aparecem. */
export const minutesPerDay = (db: Db, userId: number, from: string, to: string): Map<string, number> =>
  new Map(
    all<{ day: string; m: number }>(
      db,
      `select day, sum(minutes) m from study_sessions
       where user_id = ? and day between ? and ? group by day`,
      userId, from, to,
    ).map((x) => [x.day, x.m]),
  );

export interface SubjectMinutes {
  subjectId: number;
  name: string;
  color: string;
  minutes: number;
}

/** Minutos por disciplina entre duas datas (inclusive), da mais estudada para a menos. */
export const minutesPerSubject = (db: Db, userId: number, from: string, to: string): SubjectMinutes[] =>
  all<{ id: number; name: string; color: string; m: number }>(
    db,
    `select s.id, s.name, s.color, sum(ss.minutes) m
     from study_sessions ss join subjects s on s.id = ss.subject_id
     where ss.user_id = ? and ss.day between ? and ?
     group by s.id order by m desc, s.name`,
    userId, from, to,
  ).map((x) => ({ subjectId: x.id, name: x.name, color: x.color, minutes: x.m }));

/** Disciplina concluída = ≥ 1 tópico e todos concluídos. */
export const subjectCounts = (db: Db, userId: number): { total: number; completed: number } =>
  one<{ total: number; completed: number }>(
    db,
    `select count(*) total, coalesce(sum(case when tc > 0 and tc = dc then 1 else 0 end), 0) completed
     from (select
             (select count(*) from topics t where t.subject_id = s.id) tc,
             (select count(*) from topics t where t.subject_id = s.id and t.status = 'concluido') dc
           from subjects s where s.user_id = ?)`,
    userId,
  )!;
