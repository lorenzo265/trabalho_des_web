import { Router } from 'express';
import { studySessionInputSchema, type StudySession, type WeekStats } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { addDays, daysBetween, mondayOf } from '../../lib/dates';
import { assertRealDate, parseBody, qsDate } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { goalCountsOfDay } from '../goals/repo';
import { requireSubject } from '../subjects/repo';
import { insertStudySession, minutesPerDay, minutesPerSubject, subjectCounts } from './repo';

export function studyRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  r.use(['/study-sessions', '/stats'], requireAuth);

  r.post('/study-sessions', (req, res) => {
    const userId = req.auth!.user.id;
    const input = parseBody(studySessionInputSchema, req.body);
    assertRealDate(input.day, 'Dia');
    requireSubject(db, userId, input.subjectId);
    const id = insertStudySession(db, userId, input);
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

    const perDay = minutesPerDay(db, user.id, weekStart, weekEnd);
    const byDay = daysBetween(weekStart, weekEnd).map((date) => ({ date, minutes: perDay.get(date) ?? 0 }));
    const goals = goalCountsOfDay(db, user.id, today);
    const subjects = subjectCounts(db, user.id);

    const body: WeekStats = {
      weekStart,
      totalMinutes: byDay.reduce((a, d) => a + d.minutes, 0),
      weeklyGoalMinutes: user.weekly_goal_minutes,
      byDay,
      bySubject: minutesPerSubject(db, user.id, weekStart, weekEnd),
      goalsToday: goals.total,
      goalsTodayDone: goals.done,
      subjectsTotal: subjects.total,
      subjectsCompleted: subjects.completed,
    };
    res.json(body);
  });

  return r;
}
