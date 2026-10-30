/**
 * Resume um JSON mostrando só a ESTRUTURA (nomes de campos e tipos), sem os valores, para o aluno
 * poder colar o resultado sem expor dados pessoais. Só os campos da lista `SHOW` mostram o valor.
 */
const SHOW = new Set([
  'courseId', 'externalId', 'name', 'title', 'courseName', 'type', 'calendarName', 'calendarNameLocalizable',
  'startDate', 'endDate', 'dueDate', 'start', 'end', 'availability', 'role', 'contentHandler', 'gradable',
]);
const MAX_DEPTH = 5;
const MAX_VALUE = 60;

const type = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export function shapeOf(value: unknown, key = '', depth = 0, indent = ''): string[] {
  if (Array.isArray(value)) {
    const head = `${indent}${key ? `${key}: ` : ''}array(${value.length})`;
    if (value.length === 0 || depth >= MAX_DEPTH) return [head];
    return [head, ...shapeOf(value[0], '[0]', depth + 1, `${indent}  `)];
  }
  if (value !== null && typeof value === 'object') {
    const head = `${indent}${key ? `${key}: ` : ''}object`;
    if (depth >= MAX_DEPTH) return [head];
    const lines = [head];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) lines.push(...shapeOf(v, k, depth + 1, `${indent}  `));
    return lines;
  }
  const shown =
    SHOW.has(key) && value !== null && value !== undefined
      ? ` = ${JSON.stringify(String(value).slice(0, MAX_VALUE))}`
      : typeof value === 'string'
        ? `(${value.length})`
        : '';
  return [`${indent}${key ? `${key}: ` : ''}${type(value)}${shown}`];
}
