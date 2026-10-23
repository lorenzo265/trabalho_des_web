import { z } from 'zod';
import { dateOnly, timeOnly } from './common';

/**
 * Formato de saída de QUALQUER adaptador de scraper (mock ou faculdade real).
 * O backend só conhece este formato; descobrir/ler a plataforma é problema do scraper.
 * `externalId` identifica o item na plataforma de origem (importação idempotente).
 */
export const scrapedLessonSchema = z.object({
  externalId: z.string().min(1),
  date: dateOnly,
  start: timeOnly,
  end: timeOnly,
  topic: z.string().nullish().transform((v) => v || null),
  room: z.string().nullish().transform((v) => v || null),
});
export type ScrapedLesson = z.infer<typeof scrapedLessonSchema>;

export const scrapedAssignmentSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish().transform((v) => v || null),
  dueDate: dateOnly,
  status: z.enum(['pendente', 'entregue', 'corrigido']).default('pendente'),
  grade: z.number().nullish().transform((v) => v ?? null),
});
export type ScrapedAssignment = z.infer<typeof scrapedAssignmentSchema>;

export const scrapedCourseSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  professor: z.string().nullish().transform((v) => v || null),
  room: z.string().nullish().transform((v) => v || null),
  lessons: z.array(scrapedLessonSchema).default([]),
  assignments: z.array(scrapedAssignmentSchema).default([]),
});
export type ScrapedCourse = z.infer<typeof scrapedCourseSchema>;

export const scrapeResultSchema = z.object({
  source: z.enum(['mock', 'portal']),
  fetchedAt: z.iso.datetime(),
  courses: z.array(scrapedCourseSchema),
});
export type ScrapeResult = z.infer<typeof scrapeResultSchema>;
