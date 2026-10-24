import { z } from 'zod';
import { dateOnly, isoDateTime, timeOnly } from './common';

/** Aula extraída da plataforma da faculdade (módulo de scrapers). */
export const lessonSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  subjectName: z.string(),
  subjectColor: z.string(),
  date: dateOnly,
  start: timeOnly,
  end: timeOnly,
  topic: z.string().nullable(),
  room: z.string().nullable(),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const assignmentStatusSchema = z.enum(['pendente', 'entregue', 'corrigido']);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

/** Trabalho/atividade com prazo, vindo da plataforma da faculdade (somente leitura). */
export const assignmentSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  subjectName: z.string(),
  subjectColor: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: dateOnly,
  status: assignmentStatusSchema,
  grade: z.number().nullable(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const syncStatusValueSchema = z.enum(['running', 'ok', 'error']);

export const syncRunSchema = z.object({
  id: z.number().int(),
  source: z.enum(['mock', 'portal']),
  status: syncStatusValueSchema,
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  /** Contagens do que foi lido/gravado; `null` enquanto roda ou se falhou. */
  stats: z
    .object({
      subjects: z.number().int(),
      lessons: z.number().int(),
      assignments: z.number().int(),
      created: z.number().int(),
      updated: z.number().int(),
    })
    .nullable(),
  error: z.string().nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;

export const syncStatusSchema = z.object({
  source: z.enum(['mock', 'portal']),
  current: syncRunSchema.nullable(),
  last: syncRunSchema.nullable(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;
