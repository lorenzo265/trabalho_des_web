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

/** Fuso padrão do app (briefing D7), usado quando o cliente não informa a data local. */
export const APP_TIMEZONE = 'America/Sao_Paulo';

/** Data de calendário (AAAA-MM-DD) de um instante num fuso IANA. */
export function dateInZone(d: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Dias de `from` até `to` (negativo se `to` for anterior). */
export function diffDays(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

const WEEKDAYS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const weekdayName = (date: string): string => WEEKDAYS_PT[parse(date).getUTCDay()]!;
