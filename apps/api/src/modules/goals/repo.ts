import type { Db } from '../../db/db';
import { all, insert, one, run } from '../../db/db';
import type { GoalRow } from '../../db/rows';
import { notFound } from '../../lib/errors';

const GOAL_SQL = `
  select g.*, s.name as subject_name, s.color as subject_color
  from daily_goals g join subjects s on s.id = g.subject_id`;

export interface NewGoal {
  subjectId: number;
  goalDate: string;
  description: string;
  targetMinutes: number | null;
}

export interface GoalChanges {
  description: string;
  targetMinutes: number | null;
  goalDate: string;
  done: boolean;
  doneAt: string | null;
}

/** Meta do usuário ou 404. */
export function requireGoal(db: Db, userId: number, id: number): GoalRow {
  const g = one<GoalRow>(db, `${GOAL_SQL} where g.id = ? and g.user_id = ?`, id, userId);
  if (!g) throw notFound('Meta');
  return g;
}

export const listGoalsOfDay = (db: Db, userId: number, date: string): GoalRow[] =>
  all<GoalRow>(db, `${GOAL_SQL} where g.user_id = ? and g.goal_date = ? order by g.done, g.id`, userId, date);

export const insertGoal = (db: Db, userId: number, g: NewGoal): number =>
  insert(
    db,
    `insert into daily_goals (user_id, subject_id, goal_date, description, target_minutes)
     values (?, ?, ?, ?, ?)`,
    userId, g.subjectId, g.goalDate, g.description, g.targetMinutes,
  );

export const updateGoal = (db: Db, id: number, c: GoalChanges): void => {
  run(
    db,
    'update daily_goals set description = ?, target_minutes = ?, goal_date = ?, done = ?, done_at = ? where id = ?',
    c.description, c.targetMinutes, c.goalDate, c.done ? 1 : 0, c.doneAt, id,
  );
};

export const deleteGoal = (db: Db, id: number): void => {
  run(db, 'delete from daily_goals where id = ?', id);
};

/** Metas do dia: total e quantas já foram cumpridas. */
export const goalCountsOfDay = (db: Db, userId: number, date: string): { total: number; done: number } =>
  one<{ total: number; done: number }>(
    db,
    `select count(*) total, coalesce(sum(done), 0) done from daily_goals where user_id = ? and goal_date = ?`,
    userId, date,
  )!;
