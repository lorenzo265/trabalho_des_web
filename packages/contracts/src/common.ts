import { z } from 'zod';

/** Timestamp ISO-8601 em UTC (ex.: 2026-10-23T22:00:00.000Z). */
export const isoDateTime = z.iso.datetime();
/** Data de calendário AAAA-MM-DD (data local do aluno). */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD');
/** Hora HH:mm (24 h). */
export const timeOnly = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (#RRGGBB)');

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int() });
export type Page<T> = { items: T[]; total: number };

export const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });
export type List<T> = { items: T[] };

/** Limites de validação (iguais no front e no back). */
export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  passwordMin: 8,
  passwordMax: 72,
  subjectNameMax: 60,
  professorMax: 80,
  roomMax: 60,
  topicTitleMax: 120,
  notesMax: 2000,
  goalDescriptionMax: 200,
  goalMinutesMax: 600,
  studyMinutesMax: 720,
  chatMessageMax: 4000,
} as const;

/** Paleta padrão para as disciplinas. */
export const SUBJECT_COLORS = [
  '#2563EB', '#D97706', '#059669', '#DB2777', '#7C3AED', '#DC2626', '#0891B2', '#65A30D',
] as const;
