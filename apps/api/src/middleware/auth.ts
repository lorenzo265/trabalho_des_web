import type { NextFunction, Request, Response } from 'express';
import type { Ctx } from '../context';
import { HttpError } from '../lib/errors';
import { readCookie } from '../lib/tokens';
import type { AuthContext } from '../modules/access/service';

export const SESSION_COOKIE = 'edumind_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Presente quando o cookie de sessão é válido. */
      auth?: AuthContext;
    }
  }
}

/** Lê o cookie e, se a sessão for válida, preenche `req.auth` (não bloqueia a requisição). */
export function attachAuth(ctx: Ctx) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) {
      const auth = ctx.access.authenticate(token);
      if (auth) req.auth = auth;
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new HttpError(401, 'unauthenticated', 'Faça login para continuar.'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new HttpError(401, 'unauthenticated', 'Faça login para continuar.'));
  if (req.auth.user.role !== 'admin') {
    return next(new HttpError(403, 'forbidden', 'Acesso restrito a administradores.'));
  }
  next();
}
