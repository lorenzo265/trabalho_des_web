import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, 'not_found', 'Rota não encontrada.'));
}

/** Converte qualquer erro em `{ error: { code, message } }`. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof HttpError) {
    for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'JSON inválido.' } });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'Corpo da requisição grande demais.' } });
    return;
  }
  console.error('[api] erro inesperado:', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Erro interno. Tente novamente.' } });
}
