import { z } from 'zod';
import { isoDateTime } from './common';

/**
 * Novidades detectadas a cada sincronização com a faculdade (comparando com o que já estava salvo).
 * A primeira sincronização com sucesso é só a "linha de base": não gera novidades.
 */
export const changeKindSchema = z.enum([
  'subject_new', // disciplina nova
  'assignment_new', // trabalho novo
  'assignment_due_changed', // prazo alterado (old → new = datas AAAA-MM-DD)
  'grade_posted', // nota lançada (new = nota)
  'grade_changed', // nota alterada (old → new)
  'assignment_status_changed', // situação mudou (old → new = pendente/entregue/corrigido)
  'lesson_new', // aula nova (new = "AAAA-MM-DD HH:mm–HH:mm")
  'lessons_added', // várias aulas novas de uma vez (new = quantidade)
  'lesson_rescheduled', // aula remarcada (old → new = "AAAA-MM-DD HH:mm–HH:mm")
  'lesson_room_changed', // sala alterada (old → new)
]);
export type ChangeKind = z.infer<typeof changeKindSchema>;

export const changeEventSchema = z.object({
  id: z.number().int(),
  kind: changeKindSchema,
  subjectId: z.number().int(),
  subjectName: z.string(),
  subjectColor: z.string(),
  /** Título do trabalho, tópico da aula ou nome da disciplina. */
  title: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  createdAt: isoDateTime,
  seen: z.boolean(),
});
export type ChangeEvent = z.infer<typeof changeEventSchema>;

export const changesSchema = z.object({
  items: z.array(changeEventSchema),
  /** Quantas ainda não foram marcadas como vistas (no total, não só nesta página). */
  unseen: z.number().int(),
});
export type Changes = z.infer<typeof changesSchema>;
