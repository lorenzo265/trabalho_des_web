import type { AssignmentStatus } from '@edumind/contracts';

/** Helpers puros que transformam o texto cru do portal no formato dos contratos. */

/** Colapsa espaços (inclusive nbsp e quebras de linha) e apara as pontas. */
export function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s ]+/g, ' ').trim();
}

/** Células vazias de tabela ("", "-", "—", "–") viram `null`. */
export function emptyToNull(s: string | null | undefined): string | null {
  const t = cleanText(s);
  return t === '' || /^[-–—]+$/.test(t) ? null : t;
}

/** "23/10/2026" (ou "qui, 23/10/2026 23:59") → "2026-10-23". Datas inexistentes → `null`. */
export function parseBrDate(s: string | null | undefined): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/.exec(s ?? '');
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  const real =
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  if (!real) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Faixa horária: "19:00 - 20:30", "19h às 20h30", "das 19:00 às 20:30" → { start, end } em HH:mm. */
export function parseTimeRange(s: string | null | undefined): { start: string; end: string } | null {
  const tokens = [...(s ?? '').matchAll(/(\d{1,2})[:hH](\d{2})?/g)];
  if (tokens.length < 2) return null;
  const toHHmm = (t: RegExpMatchArray): string | null => {
    const h = Number(t[1]);
    const m = t[2] === undefined ? 0 : Number(t[2]);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const start = toHHmm(tokens[0]!);
  const end = toHHmm(tokens[1]!);
  return start && end ? { start, end } : null;
}

/**
 * Situação do trabalho no portal → status do contrato.
 * "Corrigido/Avaliado" → corrigido · "Enviado/Entregue" → entregue · o resto
 * ("Pendente", "Em atraso", "Não enviado"…) → pendente.
 */
export function mapAssignmentStatus(s: string | null | undefined): AssignmentStatus {
  const t = cleanText(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/\bnao\b/.test(t) || t.includes('atras')) return 'pendente';
  if (t.includes('corrig') || t.includes('avali')) return 'corrigido';
  if (t.includes('entreg') || t.includes('enviad') || t.includes('submet')) return 'entregue';
  return 'pendente';
}

/** Nota "8,5" / "8.5" / "8,5 / 10" → 8.5. Sem número → `null`. */
export function parseGrade(s: string | null | undefined): number | null {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s ?? '');
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Remove itens repetidos pelo `externalId` (fica o último), preservando a ordem da primeira aparição. */
export function dedupeByExternalId<T extends { externalId: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.externalId, it);
  return [...map.values()];
}
