import { GRADE_MAX, type GradeItem, type GradeProjection, type ProjectionStatus } from '@edumind/contracts';

/**
 * Cálculo da média ponderada e da projeção ("quanto preciso tirar"). Puro, sem banco.
 * Os testes cobrem os casos de borda: sem notas, tudo lançado, meta já garantida e meta impossível.
 */

export interface GradeInput {
  id: number;
  title: string;
  dueDate: string;
  status: GradeItem['status'];
  grade: number | null;
  weight: number;
}

/** Tolerância para comparar números de ponto flutuante (ex.: 6.999999999 vs 7). */
const EPS = 1e-9;
const round = (n: number, places = 2): number => {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
};
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function computeProjection(subjectId: number, target: number, input: readonly GradeInput[]): GradeProjection {
  const items = [...input].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
  const graded = items.filter((i) => i.grade !== null);
  const remaining = items.filter((i) => i.grade === null);

  const gradedWeight = sum(graded.map((i) => i.weight));
  const remainingWeight = sum(remaining.map((i) => i.weight));
  const totalWeight = gradedWeight + remainingWeight;
  const points = sum(graded.map((i) => (i.grade as number) * i.weight));

  const average = gradedWeight > 0 ? points / gradedWeight : null;
  const hasItems = items.length > 0;
  const worstCase = hasItems ? points / totalWeight : null;
  const bestCase = hasItems ? (points + GRADE_MAX * remainingWeight) / totalWeight : null;

  let status: ProjectionStatus;
  let needed: number | null = null;
  if (!hasItems) {
    status = 'no_data';
  } else if (remaining.length === 0) {
    status = (average as number) + EPS >= target ? 'final_ok' : 'final_fail';
  } else {
    needed = (target * totalWeight - points) / remainingWeight;
    if (needed <= EPS) {
      status = 'achieved';
      needed = 0;
    } else if (needed > GRADE_MAX + EPS) {
      status = 'impossible';
    } else if (average !== null && needed <= average + EPS) {
      status = 'on_track';
    } else {
      status = 'possible';
    }
  }

  return {
    subjectId,
    target,
    average: average === null ? null : round(average),
    totalWeight: round(totalWeight),
    gradedWeight: round(gradedWeight),
    remainingWeight: round(remainingWeight),
    gradedCount: graded.length,
    remainingCount: remaining.length,
    needed: needed === null ? null : round(needed),
    worstCase: worstCase === null ? null : round(worstCase),
    bestCase: bestCase === null ? null : round(bestCase),
    status,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      dueDate: i.dueDate,
      status: i.status,
      grade: i.grade,
      weight: i.weight,
      share: totalWeight > 0 ? round((i.weight / totalWeight) * 100, 1) : 0,
    })),
  };
}
