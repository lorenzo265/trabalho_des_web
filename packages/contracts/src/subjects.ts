import { z } from 'zod';
import { dateOnly, hexColor, isoDateTime, LIMITS } from './common';

export const subjectSourceSchema = z.enum(['manual', 'scraper']);

/** Disciplina (Tela 3): nome, professor, local da aula e cor temática. */
export const subjectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  professor: z.string().nullable(),
  /** Texto livre, ex.: "Sala 311 · Prédio 01". */
  room: z.string().nullable(),
  color: z.string(),
  source: subjectSourceSchema,
  createdAt: isoDateTime,
  topicCount: z.number().int(),
  doneCount: z.number().int(),
});
export type Subject = z.infer<typeof subjectSchema>;

export const subjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da disciplina.').max(LIMITS.subjectNameMax),
  professor: z.string().trim().max(LIMITS.professorMax).nullish().transform((v) => v || null),
  room: z.string().trim().max(LIMITS.roomMax).nullish().transform((v) => v || null),
  color: hexColor,
});
export type SubjectInput = z.input<typeof subjectInputSchema>;

export const subjectPatchSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.subjectNameMax).optional(),
  professor: z.string().trim().max(LIMITS.professorMax).nullable().optional(),
  room: z.string().trim().max(LIMITS.roomMax).nullable().optional(),
  color: hexColor.optional(),
});
export type SubjectPatch = z.input<typeof subjectPatchSchema>;

export const topicStatusSchema = z.enum(['pendente', 'estudando', 'concluido']);
export type TopicStatus = z.infer<typeof topicStatusSchema>;

export const topicSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  title: z.string(),
  notes: z.string().nullable(),
  position: z.number().int(),
  status: topicStatusSchema,
  dueDate: dateOnly.nullable(),
  doneAt: isoDateTime.nullable(),
});
export type Topic = z.infer<typeof topicSchema>;

export const topicInputSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título do tópico.').max(LIMITS.topicTitleMax),
  notes: z.string().max(LIMITS.notesMax).nullish().transform((v) => v || null),
  dueDate: dateOnly.nullish().transform((v) => v || null),
});
export type TopicInput = z.input<typeof topicInputSchema>;

export const topicPatchSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.topicTitleMax).optional(),
  notes: z.string().max(LIMITS.notesMax).nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  status: topicStatusSchema.optional(),
});
export type TopicPatch = z.input<typeof topicPatchSchema>;
