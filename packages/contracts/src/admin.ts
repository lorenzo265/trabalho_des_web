import { z } from 'zod';
import { dateOnly, isoDateTime } from './common';
import { roleSchema } from './auth';

export const adminOverviewSchema = z.object({
  usersTotal: z.number().int(),
  usersActive: z.number().int(),
  adminsTotal: z.number().int(),
  /** Sessões abertas agora (dispositivos conectados). */
  activeSessions: z.number().int(),
  loginsToday: z.number().int(),
  subjectsTotal: z.number().int(),
  messagesTotal: z.number().int(),
  /** Últimos 14 dias (UTC), preenchendo zeros. */
  loginsByDay: z.array(z.object({ date: dateOnly, count: z.number().int() })),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export const adminUserRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
  createdAt: isoDateTime,
  lastLoginAt: isoDateTime.nullable(),
  activeSessions: z.number().int(),
  subjectsCount: z.number().int(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminUserPatchSchema = z.object({
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type AdminUserPatch = z.infer<typeof adminUserPatchSchema>;
