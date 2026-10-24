import { insert, one, type Db } from '../../db/db';
import type { UserRow } from '../../db/rows';
import { hashPassword } from '../../lib/password';

export const findUserById = (db: Db, id: number) => one<UserRow>(db, 'select * from users where id = ?', id);
export const findUserByEmail = (db: Db, email: string) =>
  one<UserRow>(db, 'select * from users where email = ?', email);

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role?: 'user' | 'admin';
  level?: UserRow['level'];
  isActive?: boolean;
  createdAt: string;
}

export function insertUser(db: Db, u: NewUser): UserRow {
  const id = insert(
    db,
    `insert into users (email, name, password_hash, level, role, is_active, created_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
    u.email, u.name, u.passwordHash, u.level ?? 'superior', u.role ?? 'user', u.isActive === false ? 0 : 1, u.createdAt,
  );
  return findUserById(db, id)!;
}

/** Cria (ou promove) o administrador inicial. Idempotente; nunca troca a senha de uma conta existente. */
export async function bootstrapAdmin(
  db: Db,
  admin: { email: string; password: string; name: string },
  nowIso: string,
): Promise<'created' | 'promoted' | 'unchanged'> {
  const email = admin.email.trim().toLowerCase();
  const existing = findUserByEmail(db, email);
  if (!existing) {
    insertUser(db, {
      name: admin.name,
      email,
      passwordHash: await hashPassword(admin.password),
      role: 'admin',
      createdAt: nowIso,
    });
    return 'created';
  }
  if (existing.role === 'admin' && existing.is_active === 1) return 'unchanged';
  db.prepare("update users set role = 'admin', is_active = 1 where id = ?").run(existing.id);
  return 'promoted';
}
