/** Utilitários de data AAAA-MM-DD (calendário, sem fuso). */

export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const parse = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const utcDate = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDate(d);
}

/** Segunda-feira da semana que contém `date`. */
export function mondayOf(date: string): string {
  const dow = parse(date).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/** Todas as datas de `from` a `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
