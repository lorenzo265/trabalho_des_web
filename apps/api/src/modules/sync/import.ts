import { SUBJECT_COLORS, type ScrapeResult } from '@edumind/contracts';
import { all, insert, one, run, type Db } from '../../db/db';
import { subjectNameTaken } from '../subjects/repo';

export interface ImportStats {
  subjects: number;
  lessons: number;
  assignments: number;
  created: number;
  updated: number;
}

interface SubjectLite {
  id: number;
  name: string;
  professor: string | null;
  room: string | null;
  external_id: string | null;
}

/**
 * Importação IDEMPOTENTE do resultado do scraper, numa transação:
 * rodar duas vezes com os mesmos dados não duplica nada e não conta mudanças.
 * Disciplina: por `external_id`; senão vincula pelo nome a uma existente; senão cria.
 */
export function importScrape(db: Db, userId: number, result: ScrapeResult, nowIso: string): ImportStats {
  const stats: ImportStats = { subjects: result.courses.length, lessons: 0, assignments: 0, created: 0, updated: 0 };

  db.transaction(() => {
    // Dados de demonstração do seed (external_id "seed:*") dão lugar aos dados reais da fonte.
    if (result.courses.length) {
      run(db, "delete from lessons where user_id = ? and external_id like 'seed:%'", userId);
      run(db, "delete from assignments where user_id = ? and external_id like 'seed:%'", userId);
    }
    for (const course of result.courses) {
      let subject = one<SubjectLite>(
        db,
        'select id, name, professor, room, external_id from subjects where user_id = ? and external_id = ?',
        userId, course.externalId,
      );

      if (subject) {
        // A faculdade é a fonte da verdade para nome, professor e sala.
        const name = course.name !== subject.name && !subjectNameTaken(db, userId, course.name, subject.id) ? course.name : subject.name;
        if (name !== subject.name || course.professor !== subject.professor || course.room !== subject.room) {
          run(db, 'update subjects set name = ?, professor = ?, room = ? where id = ?', name, course.professor, course.room, subject.id);
          stats.updated++;
        }
      } else {
        const byName = one<SubjectLite>(
          db,
          'select id, name, professor, room, external_id from subjects where user_id = ? and name = ? and external_id is null',
          userId, course.name,
        );
        if (byName) {
          run(
            db,
            'update subjects set external_id = ?, professor = coalesce(professor, ?), room = coalesce(room, ?) where id = ?',
            course.externalId, course.professor, course.room, byName.id,
          );
          subject = { ...byName, external_id: course.externalId };
          stats.updated++;
        } else {
          const count = one<{ c: number }>(db, 'select count(*) c from subjects where user_id = ?', userId)!.c;
          // Se o nome já existir com outro external_id, desambigua para respeitar a unicidade.
          const name = subjectNameTaken(db, userId, course.name) ? `${course.name} (${course.externalId})` : course.name;
          const id = insert(
            db,
            `insert into subjects (user_id, name, professor, room, color, source, external_id, created_at)
             values (?, ?, ?, ?, ?, 'scraper', ?, ?)`,
            userId, name, course.professor, course.room, SUBJECT_COLORS[count % SUBJECT_COLORS.length]!, course.externalId, nowIso,
          );
          subject = { id, name, professor: course.professor, room: course.room, external_id: course.externalId };
          stats.created++;
        }
      }
      const subjectId = subject.id;

      for (const l of course.lessons) {
        stats.lessons++;
        const cur = one<{ id: number; subject_id: number; date: string; start_time: string; end_time: string; topic: string | null; room: string | null }>(
          db, 'select * from lessons where user_id = ? and external_id = ?', userId, l.externalId,
        );
        if (!cur) {
          insert(
            db,
            `insert into lessons (user_id, subject_id, external_id, date, start_time, end_time, topic, room, updated_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            userId, subjectId, l.externalId, l.date, l.start, l.end, l.topic, l.room, nowIso,
          );
          stats.created++;
        } else if (
          cur.subject_id !== subjectId || cur.date !== l.date || cur.start_time !== l.start ||
          cur.end_time !== l.end || cur.topic !== l.topic || cur.room !== l.room
        ) {
          run(
            db,
            `update lessons set subject_id = ?, date = ?, start_time = ?, end_time = ?, topic = ?, room = ?, updated_at = ?
             where id = ?`,
            subjectId, l.date, l.start, l.end, l.topic, l.room, nowIso, cur.id,
          );
          stats.updated++;
        }
      }

      for (const a of course.assignments) {
        stats.assignments++;
        const cur = one<{ id: number; subject_id: number; title: string; description: string | null; due_date: string; status: string; grade: number | null }>(
          db, 'select * from assignments where user_id = ? and external_id = ?', userId, a.externalId,
        );
        if (!cur) {
          insert(
            db,
            `insert into assignments (user_id, subject_id, external_id, title, description, due_date, status, grade, updated_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            userId, subjectId, a.externalId, a.title, a.description, a.dueDate, a.status, a.grade, nowIso,
          );
          stats.created++;
        } else if (
          cur.subject_id !== subjectId || cur.title !== a.title || cur.description !== a.description ||
          cur.due_date !== a.dueDate || cur.status !== a.status || cur.grade !== a.grade
        ) {
          run(
            db,
            `update assignments set subject_id = ?, title = ?, description = ?, due_date = ?, status = ?, grade = ?, updated_at = ?
             where id = ?`,
            subjectId, a.title, a.description, a.dueDate, a.status, a.grade, nowIso, cur.id,
          );
          stats.updated++;
        }
      }
    }
  })();

  return stats;
}

/** Marca como erro as sincronizações que ficaram "rodando" quando o servidor foi reiniciado. */
export function recoverStaleSyncs(db: Db, nowIso: string): number {
  const stale = all<{ id: number }>(db, "select id from sync_runs where status = 'running'");
  for (const s of stale) {
    run(
      db,
      "update sync_runs set status = 'error', finished_at = ?, error = ? where id = ?",
      nowIso, 'Interrompida porque o servidor foi reiniciado.', s.id,
    );
  }
  return stale.length;
}
