/** CSV para o Excel em português: separador `;`, BOM UTF-8 e quebras CRLF. */
const SEP = ';';

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Proteção contra "CSV injection": células que o Excel interpretaria como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(SEP));
  return `﻿${lines.join('\r\n')}\r\n`;
}
