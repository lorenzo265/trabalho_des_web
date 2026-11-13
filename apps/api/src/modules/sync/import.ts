import { SUBJECT_COLORS, type ScrapeResult } from '@edumind/contracts';
import { all, insert, one, run, type Db } from '../../db/db';
import { recordChange, type ChangeInput } from '../changes/repo';
import { subjectNameTaken } from '../subjects/repo';

export interface ImportStats {
  subjects: number;
  lessons: number;
  assignments: number;
  created: number;
  updated: number;
  /** Novidades registradas (0 na primeira sincronização com sucesso, que é só a linha de base). */
  changes: number;
}

export interface ImportOptions {
  /** Execução de sync que originou a importação (liga as novidades a ela). */
  syncRunId?: number;
  /** Força (ou nega) a linha de base; por padrão: não houve nenhum sync com sucesso antes. */
  baseline?: boolean;
}

/** Quantas aulas novas de uma mesma disciplina viram um aviso só ("12 aulas novas"). */
const LESSON_GROUP_THRESHOLD = 3;

const lessonWhen = (date: string, start: string, end: string): string => `${date} ${start}–${end}`;

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
export function importScrape(
  db: Db,
  userId: number,
  result: ScrapeResult,
  nowIso: string,
  opts: ImportOptions = {},
): ImportStats {
  const stats: ImportStats = { subjects: result.courses.length, lessons: 0, assignments: 0, created: 0, updated: 0, changes: 0 };

  db.transaction(() => {
    // Linha de base: sem sync anterior bem-sucedido, tudo é "novo" e não vale como novidade.
    const baseline = opts.baseline ?? !one(db, "select 1 as x from sync_runs where user_id = ? and status = 'ok' limit 1", userId);
    const changes: ChangeInput[] = [];
    const newSubjectIds = new Set<number>(); // disciplina nova: o aviso é um só, não um por aula/trabalho
    const note = (c: ChangeInput) => {
      if (!baseline) changes.push(c);
    };

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
        // A faculdade é a fonte da verdade para nome, professor e sala (se ela não informar, mantém o último valor).
        const name = course.name !== subject.name && !subjectNameTaken(db, userId, course.name, subject.id) ? course.name : subject.name;
        const professor = course.professor ?? subject.professor;
        const room = course.room ?? subject.room;
        if (name !== subject.name || professor !== subject.professor || room !== subject.room) {
          run(db, 'update subjects set name = ?, professor = ?, room = ? where id = ?', name, professor, room, subject.id);
          stats.updated++;
        }
      } else {
        const byName = one<SubjectLite>(
          db,
          'select id, name, professor, room, external_id from subjects where user_id = ? and name = ? and external_id is null',
          userId, course.name,
        );
        if (byName) {
          // Mesma regra: ao vincular, professor e sala passam a ser os da faculdade (quando informados).
          const professor = course.professor ?? byName.professor;
          const room = course.room ?? byName.room;
          run(
            db,
            'update subjects set external_id = ?, name = ?, professor = ?, room = ? where id = ?',
            course.externalId, course.name, professor, room, byName.id, // mesmo nome, só a grafia oficial
          );
          subject = { ...byName, name: course.name, professor, room, external_id: course.externalId };
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
          newSubjectIds.add(id);
          note({ subjectId: id, kind: 'subject_new', title: name });
        }
      }
      const subjectId = subject.id;
      const subjectName = subject.name;
      const isNewSubject = newSubjectIds.has(subjectId);
      const newLessons: ChangeInput[] = [];

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
          if (!isNewSubject) {
            newLessons.push({ subjectId, kind: 'lesson_new', title: l.topic ?? subjectName, newValue: lessonWhen(l.date, l.start, l.end) });
          }
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
          const title = l.topic ?? cur.topic ?? subjectName;
          if (cur.date !== l.date || cur.start_time !== l.start || cur.end_time !== l.end) {
            note({
              subjectId, kind: 'lesson_rescheduled', title,
              oldValue: lessonWhen(cur.date, cur.start_time, cur.end_time), newValue: lessonWhen(l.date, l.start, l.end),
            });
          } else if (cur.room !== l.room) {
            note({ subjectId, kind: 'lesson_room_changed', title, oldValue: cur.room ?? '—', newValue: l.room ?? '—' });
          }
          // Mudança só do tópico (o professor preenche depois) não é novidade.
        }
      }
      if (newLessons.length > LESSON_GROUP_THRESHOLD) {
        note({ subjectId, kind: 'lessons_added', title: subjectName, newValue: String(newLessons.length) });
      } else {
        newLessons.forEach(note);
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
          if (!isNewSubject) note({ subjectId, kind: 'assignment_new', title: a.title, newValue: a.dueDate });
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
          if (cur.due_date !== a.dueDate) {
            note({ subjectId, kind: 'assignment_due_changed', title: a.title, oldValue: cur.due_date, newValue: a.dueDate });
          }
          const gradePosted = cur.grade === null && a.grade !== null;
          if (gradePosted) {
            note({ subjectId, kind: 'grade_posted', title: a.title, newValue: String(a.grade) });
          } else if (cur.grade !== null && a.grade !== null && cur.grade !== a.grade) {
            note({ subjectId, kind: 'grade_changed', title: a.title, oldValue: String(cur.grade), newValue: String(a.grade) });
          }
          // "corrigido" junto com a nota já é contado em "nota lançada".
          if (cur.status !== a.status && !(gradePosted && a.status === 'corrigido')) {
            note({ subjectId, kind: 'assignment_status_changed', title: a.title, oldValue: cur.status, newValue: a.status });
          }
        }
      }
    }

    for (const c of changes) recordChange(db, userId, opts.syncRunId ?? null, nowIso, c);
    stats.changes = changes.length;
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
