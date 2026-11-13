import type { GradeProjection } from '@edumind/contracts';
import { describeProjection, fmtNum, parseDecimal } from './grades';

const base: GradeProjection = {
  subjectId: 1, target: 7, average: 6, totalWeight: 4, gradedWeight: 2, remainingWeight: 2, gradedCount: 2, remainingCount: 2,
  needed: 8, worstCase: 3, bestCase: 8, status: 'possible', items: [],
};
const d = (over: Partial<GradeProjection>) => describeProjection({ ...base, ...over });

describe('describeProjection', () => {
  it('possível: pede para subir o ritmo e cita a média atual', () => {
    expect(d({})).toEqual({
      tone: 'warning',
      headline: 'Precisa de 8 nos restantes',
      detail: 'Sua média atual é 6: é preciso subir o ritmo nos 2 trabalhos restantes para fechar em 7.',
    });
  });

  it('possível sem nenhuma nota ainda', () => {
    expect(d({ average: null, needed: 7, remainingCount: 3, gradedCount: 0 }).detail).toBe(
      'Ainda sem notas lançadas: 3 trabalhos restantes precisam ter média 7 para fechar em 7.',
    );
  });

  it('no ritmo: tom de sucesso', () => {
    expect(d({ status: 'on_track', average: 8.5, needed: 4 })).toMatchObject({
      tone: 'success',
      headline: 'Precisa de 4 nos restantes',
      detail: 'Sua média atual é 8,5: manter o ritmo basta para fechar em 7 (2 trabalhos restantes).',
    });
  });

  it('meta garantida usa o pior caso', () => {
    expect(d({ status: 'achieved', needed: 0, worstCase: 6.67, target: 6, remainingCount: 1 })).toMatchObject({
      tone: 'success',
      headline: 'Meta garantida',
      detail: 'Mesmo tirando zero em 1 trabalho restante, sua média final fica em 6,67, na meta de 6 ou acima.',
    });
  });

  it('fora de alcance: tom de perigo, mostra o necessário e o melhor caso', () => {
    expect(d({ status: 'impossible', needed: 17, bestCase: 4.67 })).toMatchObject({
      tone: 'danger',
      headline: 'Meta fora de alcance',
      detail: 'Seria preciso média 17 nos restantes, e o máximo é 10. Tirando 10 em todos, a média final seria 4,67.',
    });
  });

  it('tudo lançado: atingiu ou ficou abaixo (com a diferença)', () => {
    expect(d({ status: 'final_ok', average: 7, needed: null, remainingCount: 0 })).toMatchObject({ tone: 'success', headline: 'Meta atingida', detail: 'Média final 7 (meta 7).' });
    expect(d({ status: 'final_fail', average: 6.5, needed: null, remainingCount: 0 })).toMatchObject({
      tone: 'danger',
      headline: 'Abaixo da meta',
      detail: 'Média final 6,5 (meta 7): faltaram 0,5 pontos.',
    });
  });

  it('sem dados', () => {
    expect(d({ status: 'no_data', average: null, needed: null })).toMatchObject({ tone: 'info', headline: 'Sem trabalhos para calcular' });
  });
});

describe('fmtNum', () => {
  it.each([[7, '7'], [8.5, '8,5'], [6.666, '6,67'], [0, '0'], [10, '10']])('%s → %s', (n, s) => expect(fmtNum(n)).toBe(s));
});

describe('parseDecimal', () => {
  it.each([['7', 7], ['7,5', 7.5], ['7.5', 7.5], [' 8 ', 8], ['0,5', 0.5], ['.5', 0.5], ['10', 10]])('aceita %j', (raw, n) => expect(parseDecimal(raw)).toBe(n));
  it.each([[''], ['  '], ['abc'], ['7,5,2'], ['-1'], ['1e3'], ['7 8'], ['--']])('rejeita %j', (raw) => expect(parseDecimal(raw)).toBeNaN());
});
