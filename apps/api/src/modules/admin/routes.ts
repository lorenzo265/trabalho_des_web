import { Router } from 'express';
import { adminUserPatchSchema, type AdminOverview, type AdminUserRow } from '@edumind/contracts';
import type { Ctx } from '../../context';
import { all, one, run } from '../../db/db';
import type { UserRow } from '../../db/rows';
import { addDays, daysBetween, utcDate } from '../../lib/dates';
import { toCsv } from '../../lib/csv';
import { HttpError, notFound } from '../../lib/errors';
import { intParam, likeEscape, pagination, parseBody, qs, qsDate, qsInt } from '../../lib/http';
import { requireAdmin } from '../../middleware/auth';
import { activeSessionsAll, exportAccessLogs, listAccessLogs, type AccessLogFilter } from '../access/repo';
import { findUserById } from '../auth/users';

const METHOD_LABEL = { password: 'E-mail e senha', google: 'Google' } as const;
const REASON_LABEL = {
  manual: 'Saiu do app',
  expired: 'Sessão expirada',
  revoked: 'Dispositivo desconectado',
  admin: 'Encerrada pelo administrador',
} as const;

const pad = (n: number) => String(n).padStart(2, '0');

export function adminRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db, access } = ctx;
  r.use('/admin', requireAdmin);

  const userRow = (id: number): AdminUserRow | undefined => {
    const u = one<UserRow & { active_sessions: number; subjects_count: number }>(
      db,
      `select u.*,
         (select count(*) from sessions s where s.user_id = u.id and s.revoked_at is null and s.expires_at > ?) active_sessions,
         (select count(*) from subjects b where b.user_id = u.id) subjects_count
       from users u where u.id = ?`,
      ctx.now(), id,
    );
    return u && toAdminRow(u);
  };

  r.get('/admin/overview', (_req, res) => {
    const now = ctx.now();
    const today = now.slice(0, 10);
    const from = addDays(today, -13);
    const count = (sql: string, ...p: unknown[]) => one<{ c: number }>(db, sql, ...p)!.c;
    const byDay = new Map(
      all<{ d: string; c: number }>(
        db,
        `select substr(login_at, 1, 10) d, count(*) c from access_logs
         where substr(login_at, 1, 10) between ? and ? group by d`,
        from, today,
      ).map((x) => [x.d, x.c]),
    );
    const body: AdminOverview = {
      usersTotal: count('select count(*) c from users'),
      usersActive: count('select count(*) c from users where is_active = 1'),
      adminsTotal: count("select count(*) c from users where role = 'admin'"),
      activeSessions: count(
        'select count(*) c from sessions where revoked_at is null and expires_at > ?', now,
      ),
      loginsToday: byDay.get(today) ?? 0,
      subjectsTotal: count('select count(*) c from subjects'),
      messagesTotal: count('select count(*) c from chat_messages'),
      loginsByDay: daysBetween(from, today).map((date) => ({ date, count: byDay.get(date) ?? 0 })),
    };
    res.json(body);
  });

  r.get('/admin/users', (req, res) => {
    const { limit, offset } = pagination(req);
    const q = qs(req, 'q')?.trim();
    const where = q ? "where (u.name like ? escape '\\' or u.email like ? escape '\\')" : '';
    const params = q ? [`%${likeEscape(q)}%`, `%${likeEscape(q)}%`] : [];
    const total = one<{ c: number }>(db, `select count(*) c from users u ${where}`, ...params)!.c;
    const rows = all<UserRow & { active_sessions: number; subjects_count: number }>(
      db,
      `select u.*,
         (select count(*) from sessions s where s.user_id = u.id and s.revoked_at is null and s.expires_at > ?) active_sessions,
         (select count(*) from subjects b where b.user_id = u.id) subjects_count
       from users u ${where} order by u.created_at desc, u.id desc limit ? offset ?`,
      ctx.now(), ...params, limit, offset,
    );
    res.json({ items: rows.map(toAdminRow), total });
  });

  r.patch('/admin/users/:id', (req, res) => {
    const patch = parseBody(adminUserPatchSchema, req.body);
    const target = findUserById(db, intParam(req));
    if (!target) throw notFound('Usuário');
    const actorId = req.auth!.user.id;
    const demoting = patch.role === 'user' && target.role === 'admin';
    const blocking = patch.isActive === false && target.is_active === 1;
    if (target.id === actorId && (demoting || blocking)) {
      throw new HttpError(409, 'cannot_modify_self', 'Você não pode rebaixar nem bloquear a si mesmo.');
    }
    if ((demoting || blocking) && target.role === 'admin' && target.is_active === 1 && activeAdmins() <= 1) {
      throw new HttpError(409, 'last_admin', 'Não é possível remover o último administrador ativo.');
    }
    db.transaction(() => {
      run(
        db,
        'update users set role = coalesce(?, role), is_active = coalesce(?, is_active) where id = ?',
        patch.role ?? null, patch.isActive === undefined ? null : patch.isActive ? 1 : 0, target.id,
      );
      if (blocking) access.endAllForUser(target.id, 'admin');
    })();
    res.json(userRow(target.id));
  });

  r.delete('/admin/users/:id', (req, res) => {
    const target = findUserById(db, intParam(req));
    if (!target) throw notFound('Usuário');
    if (target.id === req.auth!.user.id) {
      throw new HttpError(409, 'cannot_modify_self', 'Você não pode excluir a si mesmo.');
    }
    if (target.role === 'admin' && target.is_active === 1 && activeAdmins() <= 1) {
      throw new HttpError(409, 'last_admin', 'Não é possível excluir o último administrador ativo.');
    }
    db.transaction(() => {
      access.endAllForUser(target.id, 'admin'); // fecha os logs abertos antes de apagar a conta
      run(db, 'delete from users where id = ?', target.id);
    })();
    res.status(204).end();
  });

  const logFilter = (req: Parameters<typeof qs>[0]): AccessLogFilter => ({
    userId: qsInt(req, 'userId'),
    q: qs(req, 'q')?.trim(),
    from: qsDate(req, 'from'),
    to: qsDate(req, 'to'),
  });

  r.get('/admin/access-logs', (req, res) => {
    const { limit, offset } = pagination(req);
    res.json(listAccessLogs(db, logFilter(req), limit, offset));
  });

  // `tzOffsetMinutes` = minutos a SOMAR ao UTC para obter a hora local (Brasil: -180).
  r.get('/admin/access-logs.csv', (req, res) => {
    const offset = Math.max(-14 * 60, Math.min(14 * 60, qsInt(req, 'tzOffsetMinutes') ?? 0));
    const local = (iso: string) => {
      const d = new Date(Date.parse(iso) + offset * 60_000);
      return {
        date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
        time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
      };
    };
    const rows = exportAccessLogs(db, logFilter(req)).map((e) => {
      const login = local(e.loginAt);
      const logout = e.logoutAt ? local(e.logoutAt) : null;
      return [
        e.userName,
        e.userEmail,
        login.date,
        login.time,
        logout ? `${logout.date} ${logout.time}` : '',
        e.logoutAt ? Math.round((Date.parse(e.logoutAt) - Date.parse(e.loginAt)) / 60_000) : '',
        e.device,
        METHOD_LABEL[e.method],
        e.logoutReason ? REASON_LABEL[e.logoutReason] : 'Em andamento',
      ];
    });
    const csv = toCsv(
      ['Nome', 'E-mail', 'Data', 'Hora login', 'Hora logout', 'Duração (min)', 'Dispositivo', 'Método', 'Motivo'],
      rows,
    );
    res
      .type('text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="acessos-${utcDate(ctx.clock())}.csv"`);
    res.send(csv);
  });

  r.get('/admin/sessions', (req, res) => {
    const { limit, offset } = pagination(req);
    res.json(activeSessionsAll(db, ctx.now(), limit, offset));
  });

  r.delete('/admin/sessions/:id', (req, res) => {
    const id = intParam(req);
    const ended = one<{ id: number }>(db, 'select id from sessions where id = ? and revoked_at is null', id);
    if (!ended) throw notFound('Sessão');
    access.endSession(id, 'admin');
    res.status(204).end();
  });

  function activeAdmins(): number {
    return one<{ c: number }>(db, "select count(*) c from users where role = 'admin' and is_active = 1")!.c;
  }

  return r;
}

function toAdminRow(u: UserRow & { active_sessions: number; subjects_count: number }): AdminUserRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.is_active === 1,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    activeSessions: u.active_sessions,
    subjectsCount: u.subjects_count,
  };
}

