import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type Db = Database.Database;

/** Migrações em ordem: a posição (1, 2, …) é o `user_version` depois de aplicada. */
const MIGRATIONS = ['schema.sql'];

/** Aplica as migrações pendentes. Idempotente. */
export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = readFileSync(new URL(MIGRATIONS[v]!, import.meta.url), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

/** Abre (criando a pasta, se preciso) e migra o banco. `:memory:` serve para testes. */
export function openDb(path: string): Db {
  const inMemory = path === ':memory:';
  if (!inMemory) mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (!inMemory) db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

// Atalhos de consulta. Parâmetros devem ser string | number | null (sem boolean/undefined).
export const one = <T>(db: Db, sql: string, ...params: unknown[]): T | undefined =>
  db.prepare(sql).get(...params) as T | undefined;
export const all = <T>(db: Db, sql: string, ...params: unknown[]): T[] =>
  db.prepare(sql).all(...params) as T[];
export const run = (db: Db, sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
export const insert = (db: Db, sql: string, ...params: unknown[]): number =>
  Number(run(db, sql, ...params).lastInsertRowid);
