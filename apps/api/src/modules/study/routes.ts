import { Router } from 'express';
import { studySessionInputSchema, type StudySession, type WeekStats } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, insert, one } from '../../db/db';
import { addDays, daysBetween, mondayOf } from '../../lib/dates';
import { assertRealDate, parseBody, qsDate } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireSubject } from '../subjects/repo';

export function studyRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use(['/study-sessions', '/stats'], requireAuth);

  r.post('/study-sessions', (req, res) => {
    const userId = req.auth!.user.id;
    const input = parseBody(studySessionInputSchema, req.body);
    assertRealDate(input.day, 'Dia');
    requireSubject(db, userId, input.subjectId);
    const id = insert(
      db,
      'insert into study_sessions (user_id, subject_id, started_at, day, minutes) values (?, ?, ?, ?, ?)',
      userId, input.subjectId, input.startedAt, input.day, input.minutes,
    );
    const body: StudySession = {
      id,
      subjectId: input.subjectId,
      startedAt: input.startedAt,
      day: input.day,
      minutes: input.minutes,
    };
    res.status(201).json(body);
  });

  // Semana de segunda a domingo. `today` = data local do aluno (padrão: hoje em UTC).
  r.get('/stats/week', (req, res) => {
    const { user } = req.auth!;
    const today = qsDate(req, 'today') ?? ctx.now().slice(0, 10);
    const weekStart = mondayOf(qsDate(req, 'weekStart') ?? today);
    const weekEnd = addDays(weekStart, 6);

    const perDay = new Map(
      all<{ day: string; m: number }>(
        db,
        `select day, sum(minutes) m from study_sessions
         where user_id = ? and day between ? and ? group by day`,
        user.id, weekStart, weekEnd,
      ).map((x) => [x.day, x.m]),
    );
    const byDay = daysBetween(weekStart, weekEnd).map((date) => ({ date, minutes: perDay.get(date) ?? 0 }));

    const bySubject = all<{ id: number; name: string; color: string; m: number }>(
      db,
      `select s.id, s.name, s.color, sum(ss.minutes) m
       from study_sessions ss join subjects s on s.id = ss.subject_id
       where ss.user_id = ? and ss.day between ? and ?
       group by s.id order by m desc, s.name`,
      user.id, weekStart, weekEnd,
    ).map((x) => ({ subjectId: x.id, name: x.name, color: x.color, minutes: x.m }));

    const goals = one<{ total: number; done: number }>(
      db,
      `select count(*) total, coalesce(sum(done), 0) done from daily_goals where user_id = ? and goal_date = ?`,
      user.id, today,
    )!;
    // Disciplina concluída = ≥ 1 tópico e todos concluídos.
    const subjects = one<{ total: number; completed: number }>(
      db,
      `select count(*) total, coalesce(sum(case when tc > 0 and tc = dc then 1 else 0 end), 0) completed
       from (select
               (select count(*) from topics t where t.subject_id = s.id) tc,
               (select count(*) from topics t where t.subject_id = s.id and t.status = 'concluido') dc
             from subjects s where s.user_id = ?)`,
      user.id,
    )!;

    const body: WeekStats = {
      weekStart,
      totalMinutes: byDay.reduce((a, d) => a + d.minutes, 0),
      weeklyGoalMinutes: user.weekly_goal_minutes,
      byDay,
      bySubject,
      goalsToday: goals.total,
      goalsTodayDone: goals.done,
      subjectsTotal: subjects.total,
      subjectsCompleted: subjects.completed,
    };
    res.json(body);
  });

  return r;
}
