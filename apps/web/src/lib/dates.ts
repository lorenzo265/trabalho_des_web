/** Utilitários de data. Datas de calendário trafegam como AAAA-MM-DD (data local do aluno). */

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export const todayLocal = () => toLocalDate(new Date());

export function addDays(date: string, n: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

/** Segunda-feira da semana de [date]. */
export function weekStartOf(date: string): string {
  const d = parseLocalDate(date);
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - dow);
  return toLocalDate(d);
}

export function diffDays(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const weekdayShort = (date: string) => WEEKDAYS_SHORT[parseLocalDate(date).getDay()] ?? '';

export function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseLocalDate(date));
}

export function formatDayMonth(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(parseLocalDate(date));
}

export function formatDayMonthLong(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(parseLocalDate(date)).replace('.', '');
}

export function formatDateBR(isoOrDate: string): string {
  const d = isoOrDate.length === 10 ? parseLocalDate(isoOrDate) : new Date(isoOrDate);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDateBR(iso)} ${formatTime(iso)}`;
}

/** "hoje", "amanhã", "em 3 dias", "ontem", "há 2 dias". */
export function relativeDay(date: string, today = todayLocal()): string {
  const n = diffDays(today, date);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

/** 150 → "2h 30min"; 45 → "45 min"; 120 → "2h". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h}h` : `${h}h ${pad(r)}min`;
}

/** 840 → "14 h" (uma casa decimal quando não é inteiro: "2,5 h"). */
export function formatHours(min: number): string {
  const h = min / 60;
  const rounded = Math.round(h * 10) / 10;
  return `${rounded.toLocaleString('pt-BR')} h`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "há 5 min", "há 2 h", "ontem", "12/10". */
export function relativeTime(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return formatDateBR(iso).slice(0, 5);
}
