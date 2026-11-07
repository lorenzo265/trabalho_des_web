import { z } from 'zod';
import { dateOnly } from './common';
import { assignmentStatusSchema } from './lessons';

/**
 * Média ponderada e projeção de uma disciplina.
 *  - "lançado" = trabalho com nota; "restante" = sem nota (pendente ou entregue aguardando correção);
 *  - média atual = Σ(nota × peso) ÷ Σ(peso dos lançados);
 *  - necessária = nota média que os restantes precisam ter para a média FINAL (ponderada por todos os pesos) chegar à meta.
 */
export const projectionStatusSchema = z.enum([
  'no_data', // sem trabalhos
  'achieved', // a meta já está garantida (mesmo tirando zero nos restantes)
  'on_track', // precisa de menos que a média atual: manter o ritmo basta
  'possible', // precisa de mais que a média atual, mas é alcançável (≤ 10)
  'impossible', // precisaria de mais de 10
  'final_ok', // tudo lançado e a média atingiu a meta
  'final_fail', // tudo lançado e a média ficou abaixo da meta
]);
export type ProjectionStatus = z.infer<typeof projectionStatusSchema>;

export const gradeItemSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  dueDate: dateOnly,
  status: assignmentStatusSchema,
  grade: z.number().nullable(),
  weight: z.number(),
  /** Peso deste trabalho em % do total da disciplina (1 casa decimal). */
  share: z.number(),
});
export type GradeItem = z.infer<typeof gradeItemSchema>;

export const gradeProjectionSchema = z.object({
  subjectId: z.number().int(),
  target: z.number(),
  average: z.number().nullable(),
  totalWeight: z.number(),
  gradedWeight: z.number(),
  remainingWeight: z.number(),
  gradedCount: z.number().int(),
  remainingCount: z.number().int(),
  /** Nota média necessária nos restantes (pode passar de 10 se a meta for inalcançável); `null` sem restantes. */
  needed: z.number().nullable(),
  /** Média final se os restantes forem zero / dez. `null` sem trabalhos. */
  worstCase: z.number().nullable(),
  bestCase: z.number().nullable(),
  status: projectionStatusSchema,
  items: z.array(gradeItemSchema),
});
export type GradeProjection = z.infer<typeof gradeProjectionSchema>;

export const GRADE_MAX = 10;
export const WEIGHT_MAX = 100;

export const assignmentPatchSchema = z.object({
  weight: z.number().gt(0, 'O peso precisa ser maior que zero.').max(WEIGHT_MAX, `O peso máximo é ${WEIGHT_MAX}.`),
});
export type AssignmentPatch = z.input<typeof assignmentPatchSchema>;
