import type { ChangeKind } from '@edumind/contracts';
import { all, insert, one, run, type Db } from '../../db/db';
import type { ChangeRow } from '../../db/rows';

export interface ChangeInput {
  subjectId: number;
  kind: ChangeKind;
  title: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export function recordChange(db: Db, userId: number, syncRunId: number | null, nowIso: string, c: ChangeInput): number {
  return insert(
    db,
    `insert into change_events (user_id, subject_id, sync_run_id, kind, title, old_value, new_value, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, c.subjectId, syncRunId, c.kind, c.title, c.oldValue ?? null, c.newValue ?? null, nowIso,
  );
}

export function listChanges(db: Db, userId: number, limit: number): { items: ChangeRow[]; unseen: number } {
  const items = all<ChangeRow>(
    db,
    `select c.*, s.name as subject_name, s.color as subject_color
     from change_events c join subjects s on s.id = c.subject_id
     where c.user_id = ? order by c.id desc limit ?`,
    userId, limit,
  );
  const unseen = one<{ n: number }>(db, 'select count(*) as n from change_events where user_id = ? and seen_at is null', userId)!.n;
  return { items, unseen };
}

export function markAllSeen(db: Db, userId: number, nowIso: string): number {
  return run(db, 'update change_events set seen_at = ? where user_id = ? and seen_at is null', nowIso, userId).changes;
}
