import { describe, expect, it } from 'vitest';
import { shapeOf } from './shape';

describe('shapeOf', () => {
  it('mostra a estrutura e esconde valores fora da lista', () => {
    const json = { results: [{ courseId: '_123_1', userName: 'fulano', email: 'a@b.c', age: 30, course: { name: 'DDM', secret: 'x' } }], paging: {} };
    const text = shapeOf(json).join('\n');
    expect(text).toContain('results: array(1)');
    expect(text).toContain('courseId: string = "_123_1"');
    expect(text).toContain('name: string = "DDM"');
    expect(text).toContain('userName: string(6)');
    expect(text).not.toContain('fulano');
    expect(text).not.toContain('a@b.c');
    expect(text).not.toContain('"x"');
  });

  it('limita a profundidade e trata nulos e vazios', () => {
    expect(shapeOf([]).join()).toBe('array(0)');
    expect(shapeOf({ a: null }).join('\n')).toContain('a: null');
    expect(shapeOf({ a: { b: { c: { d: { e: { f: 1 } } } } } }).join('\n')).not.toContain('f:');
  });
});
