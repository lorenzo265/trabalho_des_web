/**
 * "Forma" de uma resposta JSON: as chaves e o TIPO de cada valor, nunca os valores.
 * Serve para descobrir endpoints internos do portal (ADR-002, nível 2) sem vazar dados:
 * `{"nome":"Maria","nota":8.5}` vira `{"nome":"string","nota":"number"}`.
 */

export type Shape = string | Shape[] | { [key: string]: Shape };

const MAX_DEPTH = 6;
const MAX_KEYS = 40;
const SAMPLE_ITEMS = 5;

/** Dica de formato para strings (útil para o parser de datas/horas), sem revelar o conteúdo. */
function stringHint(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return 'string(data-hora ISO)';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'string(data ISO)';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return 'string(data dd/mm/aaaa)';
  if (/^\d{1,2}[:h]\d{2}/.test(s)) return 'string(hora)';
  if (/^https?:\/\//i.test(s)) return 'string(url)';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'string(email)';
  if (/^\d+([.,]\d+)?$/.test(s)) return 'string(numérica)';
  if (s === '') return 'string(vazia)';
  return 'string';
}

function merge(a: Shape, b: Shape): Shape {
  if (typeof a === 'object' && !Array.isArray(a) && typeof b === 'object' && !Array.isArray(b)) {
    const out: { [key: string]: Shape } = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? merge(out[k] as Shape, v) : v;
    return out;
  }
  return a;
}

/** `maskKey` permite esconder chaves que parecem dado (e-mail, id numérico como chave). */
export function jsonShape(value: unknown, maskKey: (key: string) => string = (k) => k, depth = 0): Shape {
  if (value === null) return 'null';
  if (typeof value === 'string') return stringHint(value);
  if (typeof value === 'number') return Number.isInteger(value) ? 'number(inteiro)' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (depth >= MAX_DEPTH) return '…(profundo demais)';

  if (Array.isArray(value)) {
    if (value.length === 0) return ['(lista vazia)'];
    const shapes = value.slice(0, SAMPLE_ITEMS).map((v) => jsonShape(v, maskKey, depth + 1));
    return [shapes.reduce((acc, s) => merge(acc, s))];
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const out: { [key: string]: Shape } = {};
    for (const [k, v] of entries.slice(0, MAX_KEYS)) {
      const key = /^\d+$/.test(k) ? '<id>' : maskKey(k);
      const shape = jsonShape(v, maskKey, depth + 1);
      out[key] = key in out ? merge(out[key] as Shape, shape) : shape;
    }
    if (entries.length > MAX_KEYS) out['…'] = `+${entries.length - MAX_KEYS} chaves`;
    return out;
  }
  return typeof value;
}
