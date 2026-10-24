import type { AccessLogEntry, DeviceSession } from '@edumind/contracts';
import { all, insert, one, type Db } from '../../db/db';
import type { AccessLogRow, SessionRow } from '../../db/rows';
import { likeEscape } from '../../lib/http';
import { toAccessLog, toDeviceSession } from '../../lib/mappers';

export interface NewSession {
  userId: number;
  tokenHash: string;
  device: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  revokeReason?: SessionRow['revoke_reason'];
}

export const insertSession = (db: Db, s: NewSession): number =>
  insert(
    db,
    `insert into sessions (user_id, token_hash, device, user_agent, ip, created_at, last_seen_at, expires_at, revoked_at, revoke_reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.userId, s.tokenHash, s.device, s.userAgent, s.ip, s.createdAt, s.lastSeenAt, s.expiresAt,
    s.revokedAt ?? null, s.revokeReason ?? null,
  );

export interface NewAccessLog {
  userId: number | null;
  userName: string;
  userEmail: string;
  sessionId: number | null;
  method: 'password' | 'google';
  device: string;
  ip: string | null;
  loginAt: string;
  logoutAt?: string | null;
  logoutReason?: AccessLogRow['logout_reason'];
}

export const insertAccessLog = (db: Db, l: NewAccessLog): number =>
  insert(
    db,
    `insert into access_logs (user_id, user_name, user_email, session_id, method, device, ip, login_at, logout_at, logout_reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    l.userId, l.userName, l.userEmail, l.sessionId, l.method, l.device, l.ip, l.loginAt,
    l.logoutAt ?? null, l.logoutReason ?? null,
  );

export interface AccessLogFilter {
  userId?: number;
  q?: string;
  /** AAAA-MM-DD (UTC), inclusive. */
  from?: string;
  to?: string;
}

function whereOf(f: AccessLogFilter): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.userId !== undefined) {
    parts.push('user_id = ?');
    params.push(f.userId);
  }
  if (f.from) {
    parts.push('substr(login_at, 1, 10) >= ?');
    params.push(f.from);
  }
  if (f.to) {
    parts.push('substr(login_at, 1, 10) <= ?');
    params.push(f.to);
  }
  if (f.q) {
    parts.push("(user_name like ? escape '\\' or user_email like ? escape '\\')");
    const like = `%${likeEscape(f.q)}%`;
    params.push(like, like);
  }
  return { sql: parts.length ? `where ${parts.join(' and ')}` : '', params };
}

export function listAccessLogs(
  db: Db,
  filter: AccessLogFilter,
  limit: number,
  offset: number,
): { items: AccessLogEntry[]; total: number } {
  const { sql, params } = whereOf(filter);
  const total = one<{ c: number }>(db, `select count(*) c from access_logs ${sql}`, ...params)!.c;
  const rows = all<AccessLogRow>(
    db,
    `select * from access_logs ${sql} order by login_at desc, id desc limit ? offset ?`,
    ...params, limit, offset,
  );
  return { items: rows.map(toAccessLog), total };
}

export function exportAccessLogs(db: Db, filter: AccessLogFilter, max = 50_000): AccessLogEntry[] {
  const { sql, params } = whereOf(filter);
  return all<AccessLogRow>(
    db,
    `select * from access_logs ${sql} order by login_at desc, id desc limit ?`,
    ...params, max,
  ).map(toAccessLog);
}

export function activeSessionsOfUser(db: Db, userId: number, nowIso: string, currentId?: number): DeviceSession[] {
  return all<SessionRow>(
    db,
    `select * from sessions where user_id = ? and revoked_at is null and expires_at > ?
     order by last_seen_at desc, id desc`,
    userId, nowIso,
  ).map((r) => toDeviceSession(r, currentId));
}

export function activeSessionsAll(
  db: Db,
  nowIso: string,
  limit: number,
  offset: number,
): { items: DeviceSession[]; total: number } {
  const total = one<{ c: number }>(
    db,
    'select count(*) c from sessions where revoked_at is null and expires_at > ?',
    nowIso,
  )!.c;
  const rows = all<SessionRow & { user_name: string; user_email: string }>(
    db,
    `select s.*, u.name as user_name, u.email as user_email
     from sessions s join users u on u.id = s.user_id
     where s.revoked_at is null and s.expires_at > ?
     order by s.last_seen_at desc, s.id desc limit ? offset ?`,
    nowIso, limit, offset,
  );
  return { items: rows.map((r) => toDeviceSession(r)), total };
}
