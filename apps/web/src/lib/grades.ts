import type { GradeProjection } from '@edumind/contracts';

/** Textos da projeção de notas (puro). Números sempre no formato brasileiro (vírgula). */

export const fmtNum = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const restantes = (n: number): string => (n === 1 ? '1 trabalho restante' : `${n} trabalhos restantes`);

export type ProjectionTone = 'success' | 'info' | 'warning' | 'danger';

export interface ProjectionText {
  tone: ProjectionTone;
  headline: string;
  detail: string;
}

export function describeProjection(p: GradeProjection): ProjectionText {
  const target = fmtNum(p.target);
  const left = restantes(p.remainingCount);
  switch (p.status) {
    case 'no_data':
      return { tone: 'info', headline: 'Sem trabalhos para calcular', detail: 'Quando houver trabalhos sincronizados, a média e a projeção aparecem aqui.' };
    case 'achieved':
      return {
        tone: 'success',
        headline: 'Meta garantida',
        detail: `Mesmo tirando zero em ${left}, sua média final fica em ${fmtNum(p.worstCase ?? 0)}, na meta de ${target} ou acima.`,
      };
    case 'on_track':
      return {
        tone: 'success',
        headline: `Precisa de ${fmtNum(p.needed ?? 0)} nos restantes`,
        detail: `Sua média atual é ${fmtNum(p.average ?? 0)}: manter o ritmo basta para fechar em ${target} (${left}).`,
      };
    case 'possible':
      return {
        tone: 'warning',
        headline: `Precisa de ${fmtNum(p.needed ?? 0)} nos restantes`,
        detail:
          p.average === null
            ? `Ainda sem notas lançadas: ${left} precisam ter média ${fmtNum(p.needed ?? 0)} para fechar em ${target}.`
            : `Sua média atual é ${fmtNum(p.average)}: é preciso subir o ritmo nos ${left} para fechar em ${target}.`,
      };
    case 'impossible':
      return {
        tone: 'danger',
        headline: 'Meta fora de alcance',
        detail: `Seria preciso média ${fmtNum(p.needed ?? 0)} nos restantes, e o máximo é 10. Tirando 10 em todos, a média final seria ${fmtNum(p.bestCase ?? 0)}.`,
      };
    case 'final_ok':
      return { tone: 'success', headline: 'Meta atingida', detail: `Média final ${fmtNum(p.average ?? 0)} (meta ${target}).` };
    case 'final_fail':
      return {
        tone: 'danger',
        headline: 'Abaixo da meta',
        detail: `Média final ${fmtNum(p.average ?? 0)} (meta ${target}): faltaram ${fmtNum(Math.round((p.target - (p.average ?? 0)) * 100) / 100)} pontos.`,
      };
  }
}

/** "7", "7,5", "7.5" → 7 / 7.5; vazio ou texto → NaN. */
export function parseDecimal(raw: string): number {
  const s = raw.trim().replace(',', '.');
  return s === '' || !/^\d*\.?\d+$|^\d+\.$/.test(s) ? NaN : Number(s);
}
