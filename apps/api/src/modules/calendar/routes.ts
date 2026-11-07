import { Router } from 'express';
import type { Ctx } from '../../context';
import { all } from '../../db/db';
import type { AssignmentRow, LessonRow } from '../../db/rows';
import { qsDate } from '../../lib/http';
import { buildIcs } from '../../lib/ics';
import { requireAuth } from '../../middleware/auth';

const STATUS_LABEL = { pendente: 'Pendente', entregue: 'Entregue', corrigido: 'Corrigido' } as const;
const fmtGrade = (g: number): string => String(Math.round(g * 100) / 100).replace('.', ',');

/** Exporta aulas e prazos do aluno como arquivo .ics (download autenticado, para importar na agenda). */
export function calendarRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use('/calendar.ics', requireAuth);

  r.get('/calendar.ics', (req, res) => {
    const userId = req.auth!.user.id;
    const from = qsDate(req, 'from');
    const to = qsDate(req, 'to');
    const range = (col: string) => ({
      sql: `${from ? ` and ${col} >= ?` : ''}${to ? ` and ${col} <= ?` : ''}`,
      params: [...(from ? [from] : []), ...(to ? [to] : [])],
    });

    const lr = range('l.date');
    const lessons = all<LessonRow>(
      db,
      `select l.*, s.name as subject_name, s.color as subject_color
       from lessons l join subjects s on s.id = l.subject_id
       where l.user_id = ?${lr.sql} order by l.date, l.start_time, l.id limit 2000`,
      userId, ...lr.params,
    );
    const ar = range('a.due_date');
    const assignments = all<AssignmentRow>(
      db,
      `select a.*, s.name as subject_name, s.color as subject_color
       from assignments a join subjects s on s.id = a.subject_id
       where a.user_id = ?${ar.sql} order by a.due_date, a.id limit 2000`,
      userId, ...ar.params,
    );

    const body = buildIcs({
      name: `${ctx.config.appName} — aulas e prazos`,
      generatedAt: ctx.now(),
      timed: lessons.map((l) => ({
        uid: `lesson-${l.id}@edumind.local`,
        summary: l.topic ? `${l.subject_name}: ${l.topic}` : l.subject_name,
        description: `Disciplina: ${l.subject_name}${l.topic ? `\nConteúdo: ${l.topic}` : ''}`,
        location: l.room ?? undefined,
        date: l.date,
        start: l.start_time,
        end: l.end_time,
        modifiedAt: l.updated_at,
      })),
      allDay: assignments.map((a) => ({
        uid: `assignment-${a.id}@edumind.local`,
        summary: `Prazo: ${a.title} (${a.subject_name})`,
        description: [
          `Disciplina: ${a.subject_name}`,
          `Situação: ${STATUS_LABEL[a.status]}`,
          ...(a.grade !== null ? [`Nota: ${fmtGrade(a.grade)}`] : []),
          ...(a.description ? [a.description] : []),
        ].join('\n'),
        date: a.due_date,
        modifiedAt: a.updated_at,
      })),
    });

    res
      .status(200)
      .set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="edumind-agenda.ics"',
        'Cache-Control': 'no-store',
      })
      .send(body);
  });

  return r;
}
