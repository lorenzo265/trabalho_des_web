import type { LogoutReason } from '@edumind/contracts';
import type { ApiConfig } from '../../config';
import { DAY, type Clock } from '../../clock';
import { all, one, run, type Db } from '../../db/db';
import type { SessionRow, UserRow } from '../../db/rows';
import { hashToken, newSessionToken } from '../../lib/tokens';
import { describeDevice } from '../../lib/user-agent';
import { insertAccessLog, insertSession } from './repo';

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

/** Sessões por dispositivo + log de acesso (login_at / logout_at), sempre juntos. */
export function createAccessService(db: Db, clock: Clock, config: ApiConfig) {
  const nowIso = () => clock().toISOString();

  /** Login bem-sucedido: cria a sessão do dispositivo e abre a linha do log, numa só transação. */
  function openSession(
    user: UserRow,
    method: 'password' | 'google',
    meta: SessionMeta,
  ): { token: string; sessionId: number } {
    const token = newSessionToken();
    const now = clock();
    const iso = now.toISOString();
    const device = describeDevice(meta.userAgent);
    const ip = meta.ip || null;
    const sessionId = db.transaction(() => {
      const id = insertSession(db, {
        userId: user.id,
        tokenHash: hashToken(token),
        device,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip,
        createdAt: iso,
        lastSeenAt: iso,
        expiresAt: new Date(now.getTime() + config.sessionDays * DAY).toISOString(),
      });
      insertAccessLog(db, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        sessionId: id,
        method,
        device,
        ip,
        loginAt: iso,
      });
      run(db, 'update users set last_login_at = ? where id = ?', iso, user.id);
      return id;
    })();
    return { token, sessionId };
  }

  /** Encerra a sessão e grava o logout no log — uma única vez. Retorna `false` se já estava encerrada. */
  function endSession(sessionId: number, reason: LogoutReason, at: string = nowIso()): boolean {
    return db.transaction(() => {
      const r = run(
        db,
        'update sessions set revoked_at = ?, revoke_reason = ? where id = ? and revoked_at is null',
        at, reason, sessionId,
      );
      run(
        db,
        'update access_logs set logout_at = ?, logout_reason = ? where session_id = ? and logout_at is null',
        at, reason, sessionId,
      );
      return r.changes > 0;
    })();
  }

  /** Fecha as sessões vencidas (logout = validade, motivo `expired`). */
  function sweepExpired(): number {
    const rows = all<Pick<SessionRow, 'id' | 'expires_at'>>(
      db,
      'select id, expires_at from sessions where revoked_at is null and expires_at <= ?',
      nowIso(),
    );
    for (const r of rows) endSession(r.id, 'expired', r.expires_at);
    return rows.length;
  }

  /** Encerra todas as sessões abertas do usuário (exceto `exceptId`). */
  function endAllForUser(userId: number, reason: LogoutReason, exceptId?: number): number {
    sweepExpired(); // as vencidas ficam como `expired`, não como `reason`
    const rows = all<{ id: number }>(
      db,
      'select id from sessions where user_id = ? and revoked_at is null and id != ?',
      userId, exceptId ?? -1,
    );
    for (const r of rows) endSession(r.id, reason);
    return rows.length;
  }

  /** Valida o token do cookie. Sessão vencida é fechada na hora (fechamento preguiçoso). */
  function authenticate(token: string): AuthContext | null {
    const session = one<SessionRow>(db, 'select * from sessions where token_hash = ?', hashToken(token));
    if (!session || session.revoked_at) return null;
    const now = clock();
    if (session.expires_at <= now.toISOString()) {
      endSession(session.id, 'expired', session.expires_at);
      return null;
    }
    const user = one<UserRow>(db, 'select * from users where id = ?', session.user_id);
    if (!user || user.is_active !== 1) return null;
    if (Date.parse(session.last_seen_at) + 60_000 < now.getTime()) {
      run(db, 'update sessions set last_seen_at = ? where id = ?', now.toISOString(), session.id);
    }
    return { user, session };
  }

  return { openSession, endSession, endAllForUser, sweepExpired, authenticate };
}

export type AccessService = ReturnType<typeof createAccessService>;

