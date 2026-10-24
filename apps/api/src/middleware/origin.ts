import type { NextFunction, Request, Response } from 'express';
import type { ApiConfig } from '../config';
import { HttpError } from '../lib/errors';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Proteção CSRF extra (além do cookie SameSite=Strict): em métodos que alteram estado,
 * se o navegador enviar `Origin`, ele precisa ser o próprio Host ou uma origem permitida.
 * Clientes sem `Origin` (curl, testes) passam.
 */
export function originCheck(config: ApiConfig) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (!UNSAFE.has(req.method) || !origin) return next();
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* origem inválida cai no erro abaixo */
    }
    const own = req.headers.host;
    const forwarded = config.trustProxy ? req.headers['x-forwarded-host'] : undefined;
    if (host && (host === own || host === forwarded || config.allowedOrigins.includes(origin))) {
      return next();
    }
    next(new HttpError(403, 'bad_origin', 'Origem não permitida.'));
  };
}
