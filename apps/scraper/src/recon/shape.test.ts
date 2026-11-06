import { describe, expect, it } from 'vitest';
import { jsonShape } from './shape';

describe('jsonShape', () => {
  it('mostra chaves e tipos, nunca os valores', () => {
    const shape = jsonShape({
      nome: 'Maria Segredo',
      email: 'maria@x.com',
      nota: 8.5,
      faltas: 2,
      ativo: true,
      prazo: '2025-10-30',
      inicio: '2025-10-30T19:00:00Z',
      dia: '30/10/2025',
      hora: '19:00',
      site: 'https://x.com/a',
      vazio: null,
    });
    expect(shape).toEqual({
      nome: 'string',
      email: 'string(email)',
      nota: 'number',
      faltas: 'number(inteiro)',
      ativo: 'boolean',
      prazo: 'string(data ISO)',
      inicio: 'string(data-hora ISO)',
      dia: 'string(data dd/mm/aaaa)',
      hora: 'string(hora)',
      site: 'string(url)',
      vazio: 'null',
    });
    expect(JSON.stringify(shape)).not.toContain('Segredo');
  });

  it('une as chaves dos primeiros itens de uma lista', () => {
    expect(jsonShape([{ id: 1, a: 'x' }, { id: 2, b: 'y' }])).toEqual([{ id: 'number(inteiro)', a: 'string', b: 'string' }]);
    expect(jsonShape([])).toEqual(['(lista vazia)']);
  });

  it('chaves numéricas viram <id> e maskKey esconde chaves que parecem dado', () => {
    const shape = jsonShape({ '123': { x: 1 }, '456': { y: 2 }, 'a@b.com': 1 }, (k) => (k.includes('@') ? '[email]' : k));
    expect(shape).toEqual({ '<id>': { x: 'number(inteiro)', y: 'number(inteiro)' }, '[email]': 'number(inteiro)' });
  });

  it('limita profundidade e quantidade de chaves', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(jsonShape(deep))).toContain('profundo demais');
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    const shape = jsonShape(wide) as Record<string, unknown>;
    expect(Object.keys(shape)).toHaveLength(41);
    expect(shape['…']).toBe('+20 chaves');
  });
});
