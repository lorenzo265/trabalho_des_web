import { z } from 'zod';
import { dateOnly, isoDateTime, LIMITS } from './common';

/** Meta do dia (Tela 2 — checklist "Metas de Hoje"). */
export const goalSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  subjectName: z.string(),
  subjectColor: z.string(),
  goalDate: dateOnly,
  description: z.string(),
  targetMinutes: z.number().int().nullable(),
  done: z.boolean(),
  doneAt: isoDateTime.nullable(),
});
export type Goal = z.infer<typeof goalSchema>;

export const goalInputSchema = z.object({
  subjectId: z.number().int(),
  goalDate: dateOnly,
  description: z.string().trim().min(1, 'Descreva a meta.').max(LIMITS.goalDescriptionMax),
  targetMinutes: z.number().int().min(1).max(LIMITS.goalMinutesMax).nullish().transform((v) => v ?? null),
});
export type GoalInput = z.input<typeof goalInputSchema>;

export const goalPatchSchema = z.object({
  description: z.string().trim().min(1).max(LIMITS.goalDescriptionMax).optional(),
  targetMinutes: z.number().int().min(1).max(LIMITS.goalMinutesMax).nullable().optional(),
  goalDate: dateOnly.optional(),
  done: z.boolean().optional(),
});
export type GoalPatch = z.input<typeof goalPatchSchema>;

/** Sessão de estudo registrada pelo cronômetro (Tela 5). */
export const studySessionSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  startedAt: isoDateTime,
  day: dateOnly,
  minutes: z.number().int(),
});
export type StudySession = z.infer<typeof studySessionSchema>;

export const studySessionInputSchema = z.object({
  subjectId: z.number().int(),
  startedAt: isoDateTime,
  /** Data local do aluno, usada para agrupar por dia. */
  day: dateOnly,
  minutes: z.number().int().min(1).max(LIMITS.studyMinutesMax),
});
export type StudySessionInput = z.infer<typeof studySessionInputSchema>;

/** Estatísticas da semana (Tela 5 — Progresso & Estatísticas). */
export const weekStatsSchema = z.object({
  /** Segunda-feira da semana (AAAA-MM-DD). */
  weekStart: dateOnly,
  totalMinutes: z.number().int(),
  weeklyGoalMinutes: z.number().int(),
  /** Sempre 7 itens, de segunda a domingo. */
  byDay: z.array(z.object({ date: dateOnly, minutes: z.number().int() })).length(7),
  bySubject: z.array(
    z.object({
      subjectId: z.number().int(),
      name: z.string(),
      color: z.string(),
      minutes: z.number().int(),
    }),
  ),
  goalsToday: z.number().int(),
  goalsTodayDone: z.number().int(),
  subjectsTotal: z.number().int(),
  /** Disciplinas com ≥ 1 tópico e todos concluídos. */
  subjectsCompleted: z.number().int(),
});
export type WeekStats = z.infer<typeof weekStatsSchema>;
