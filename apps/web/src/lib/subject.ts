import type { Subject } from '@edumind/contracts';

/** Progresso da disciplina = tópicos concluídos ÷ total (0 quando não há tópicos). */
export function subjectProgress(s: Pick<Subject, 'topicCount' | 'doneCount'>): number {
  return s.topicCount === 0 ? 0 : s.doneCount / s.topicCount;
}
