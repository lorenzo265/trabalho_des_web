import { Router, type Request, type Response } from 'express';
import {
  loginInputSchema,
  profilePatchSchema,
  registerInputSchema,
} from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, one, run } from '../../db/db';
import type { AccessLogRow } from '../../db/rows';
import { HttpError, notFound, tooMany } from '../../lib/errors';
import { clientIp, intParam, pagination, parseBody } from '../../lib/http';
import { toAccessLog, toUser } from '../../lib/mappers';
import { hashPassword, verifyPassword } from '../../lib/password';
import { DAY } from '../../clock';
import { SESSION_COOKIE, requireAuth } from '../../middleware/auth';
import { activeSessionsOfUser } from '../access/repo';
import { findUserByEmail, findUserById, insertUser } from './users';

export function authRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db, config, limiters, access } = ctx;

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.cookieSecure,
    path: '/',
  };
  const setSessionCookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, { ...cookieOpts, maxAge: config.sessionDays * DAY });
  const clearSessionCookie = (res: Response) => res.clearCookie(SESSION_COOKIE, cookieOpts);
  const meta = (req: Request) => ({ userAgent: req.get('user-agent') ?? undefined, ip: clientIp(req) });

  r.post('/auth/register', async (req, res) => {
    const input = parseBody(registerInputSchema, req.body);
    const ip = clientIp(req);
    const wait = limiters.register.retryAfter(ip);
    if (wait !== null) throw tooMany(wait);
    limiters.register.hit(ip);

    if (findUserByEmail(db, input.email)) {
      throw new HttpError(409, 'email_taken', 'Este e-mail já está cadastrado.');
    }
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = insertUser(db, { name: input.name, email: input.email, passwordHash, createdAt: ctx.now() });
    } catch (e) {
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new HttpError(409, 'email_taken', 'Este e-mail já está cadastrado.');
      }
      throw e;
    }
    const { token } = access.openSession(user, 'password', meta(req));
    setSessionCookie(res, token);
    res.status(201).json({ user: toUser(findUserById(db, user.id)!) });
  });

  r.post('/auth/login', async (req, res) => {
    const input = parseBody(loginInputSchema, req.body);
    const key = `${clientIp(req)}|${input.email}`;
    const wait = limiters.login.retryAfter(key);
    if (wait !== null) throw tooMany(wait);

    const user = findUserByEmail(db, input.email);
    // Sempre gasta o tempo de um scrypt, exista a conta ou não.
    const ok = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || !ok) {
      limiters.login.hit(key);
      throw new HttpError(401, 'invalid_credentials', 'E-mail ou senha incorretos.');
    }
    if (user.is_active !== 1) {
      throw new HttpError(403, 'account_disabled', 'Conta desativada. Fale com o administrador.');
    }
    limiters.login.reset(key);
    const { token } = access.openSession(user, 'password', meta(req));
    setSessionCookie(res, token);
    res.json({ user: toUser(findUserById(db, user.id)!) });
  });

  // Idempotente: sem sessão válida também responde 204 (e limpa o cookie).
  r.post('/auth/logout', (req, res) => {
    if (req.auth) access.endSession(req.auth.session.id, 'manual');
    clearSessionCookie(res);
    res.status(204).end();
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: toUser(req.auth!.user) });
  });

  r.patch('/me', requireAuth, (req, res) => {
    const patch = parseBody(profilePatchSchema, req.body);
    const id = req.auth!.user.id;
    run(
      db,
      `update users set name = coalesce(?, name), level = coalesce(?, level),
         weekly_goal_minutes = coalesce(?, weekly_goal_minutes) where id = ?`,
      patch.name ?? null, patch.level ?? null, patch.weeklyGoalMinutes ?? null, id,
    );
    res.json({ user: toUser(findUserById(db, id)!) });
  });

  // Acessos do próprio usuário (nome, data, login, logout, dispositivo).
  r.get('/me/access-log', requireAuth, (req, res) => {
    const { limit, offset } = pagination(req);
    const id = req.auth!.user.id;
    const total = one<{ c: number }>(db, 'select count(*) c from access_logs where user_id = ?', id)!.c;
    const rows = all<AccessLogRow>(
      db,
      'select * from access_logs where user_id = ? order by login_at desc, id desc limit ? offset ?',
      id, limit, offset,
    );
    res.json({ items: rows.map(toAccessLog), total });
  });

  // Dispositivos conectados (acesso em qualquer dispositivo).
  r.get('/me/sessions', requireAuth, (req, res) => {
    const { user, session } = req.auth!;
    res.json({ items: activeSessionsOfUser(db, user.id, ctx.now(), session.id) });
  });

  r.delete('/me/sessions/:id', requireAuth, (req, res) => {
    const { user, session } = req.auth!;
    const id = intParam(req);
    const target = one<{ id: number }>(
      db,
      'select id from sessions where id = ? and user_id = ? and revoked_at is null',
      id, user.id,
    );
    if (!target) throw notFound('Dispositivo');
    if (id === session.id) {
      access.endSession(id, 'manual');
      clearSessionCookie(res);
    } else {
      access.endSession(id, 'revoked');
    }
    res.status(204).end();
  });

  return r;
}
