import type { Request } from 'express';
import { z } from 'zod';
import { HttpError, notFound } from './errors';
import { isRealDate } from './dates';

// Mensagens padrão do zod em português (as dos contratos já são PT-BR).
z.config(z.locales.pt());

/** Valida com o schema dos contratos; falha vira 422 `validation_error` (1ª mensagem). */
export function parseBody<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(422, 'validation_error', r.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return r.data;
}

/** `:id` da rota; inválido = 404 (não revela nada sobre o recurso). */
export function intParam(req: Request, name = 'id'): number {
  const raw = req.params[name];
  const n = typeof raw === 'string' && /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw notFound();
  return n;
}

/** Valor de query string simples (ignora arrays/objetos). */
export function qs(req: Request, name: string): string | undefined {
  const v = req.query[name];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export function qsDate(req: Request, name: string): string | undefined {
  const v = qs(req, name);
  if (v !== undefined && !isRealDate(v)) {
    throw new HttpError(422, 'validation_error', `Data inválida em "${name}" (use AAAA-MM-DD).`);
  }
  return v;
}

export function qsInt(req: Request, name: string): number | undefined {
  const v = qs(req, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(422, 'validation_error', `Número inválido em "${name}".`);
  return n;
}

export function pagination(req: Request): { limit: number; offset: number } {
  const limit = Math.min(200, Math.max(1, qsInt(req, 'limit') ?? 50));
  const offset = Math.max(0, qsInt(req, 'offset') ?? 0);
  return { limit, offset };
}

/** Garante data de calendário existente em entradas de corpo. */
export function assertRealDate(value: string, label = 'Data'): void {
  if (!isRealDate(value)) throw new HttpError(422, 'validation_error', `${label} inexistente.`);
}

/** IP do cliente (respeita X-Forwarded-For só com `trust proxy` ligado). */
export function clientIp(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  return ip.replace(/^::ffff:/, '');
}

/** Escapa `%`, `_` e `\` para uso em `LIKE ... ESCAPE '\'`. */
export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
