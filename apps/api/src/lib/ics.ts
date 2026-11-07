import { addDays, APP_TIMEZONE } from './dates';

/**
 * Gerador de arquivo iCalendar (RFC 5545) para exportar aulas e prazos.
 * Puro: não lê banco nem relógio. Detalhes que costumam dar problema e estão cobertos por testes:
 * linhas terminam em CRLF; linhas longas são "dobradas" a cada 75 BYTES (não caracteres, por causa dos acentos);
 * vírgula, ponto e vírgula, barra invertida e quebra de linha são escapados nos textos; evento de dia inteiro
 * tem DTEND no dia SEGUINTE (fim exclusivo); UID estável para reimportar atualiza em vez de duplicar.
 */

export interface IcsTimedEvent {
  uid: string;
  summary: string;
  description?: string | undefined;
  location?: string | undefined;
  /** Data AAAA-MM-DD e hora HH:mm, no fuso do app. */
  date: string;
  start: string;
  end: string;
  /** ISO UTC da última alteração (opcional). */
  modifiedAt?: string | undefined;
}

export interface IcsAllDayEvent {
  uid: string;
  summary: string;
  description?: string | undefined;
  /** Data AAAA-MM-DD. */
  date: string;
  modifiedAt?: string | undefined;
}

export interface IcsCalendar {
  name: string;
  /** ISO UTC do momento da geração (vira DTSTAMP). */
  generatedAt: string;
  timed: IcsTimedEvent[];
  allDay: IcsAllDayEvent[];
}

const CRLF = '\r\n';

/** Escapa texto conforme a seção 3.3.11 do RFC 5545. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Dobra a linha em pedaços de até 75 bytes UTF-8, sem partir um caractere no meio; continuações começam com um espaço. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // a continuação gasta 1 byte com o espaço inicial
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const compactDate = (date: string): string => date.replace(/-/g, '');
const compactTime = (hhmm: string): string => `${hhmm.replace(':', '')}00`;
/** 2026-11-06T20:50:00.000Z → 20261106T205000Z */
export const utcStamp = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const VTIMEZONE_SAO_PAULO = [
  'BEGIN:VTIMEZONE',
  `TZID:${APP_TIMEZONE}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0300',
  'TZOFFSETTO:-0300',
  'TZNAME:-03',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function buildIcs(cal: IcsCalendar): string {
  const stamp = utcStamp(cal.generatedAt);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EduMind//PoC local//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    `X-WR-TIMEZONE:${APP_TIMEZONE}`,
    ...VTIMEZONE_SAO_PAULO,
  ];

  const common = (e: { uid: string; summary: string; description?: string | undefined; modifiedAt?: string | undefined }) => [
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    ...(e.modifiedAt ? [`LAST-MODIFIED:${utcStamp(e.modifiedAt)}`] : []),
    `SUMMARY:${escapeText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
  ];

  for (const e of cal.timed) {
    lines.push(
      'BEGIN:VEVENT',
      ...common(e),
      `DTSTART;TZID=${APP_TIMEZONE}:${compactDate(e.date)}T${compactTime(e.start)}`,
      `DTEND;TZID=${APP_TIMEZONE}:${compactDate(e.date)}T${compactTime(e.end)}`,
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      'END:VEVENT',
    );
  }
  for (const e of cal.allDay) {
    lines.push(
      'BEGIN:VEVENT',
      ...common(e),
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(e.date, 1))}`, // fim exclusivo
      'TRANSP:TRANSPARENT', // prazo não deixa o aluno "ocupado" o dia todo
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
