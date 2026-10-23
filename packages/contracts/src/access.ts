import { z } from 'zod';
import { isoDateTime } from './common';

export const authMethodSchema = z.enum(['password', 'google']);
export type AuthMethod = z.infer<typeof authMethodSchema>;

export const logoutReasonSchema = z.enum(['manual', 'expired', 'revoked', 'admin']);
export type LogoutReason = z.infer<typeof logoutReasonSchema>;

/** Uma linha do log de acesso: nome do usuário, data, hora de login e hora de logout. */
export const accessLogEntrySchema = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  userName: z.string(),
  userEmail: z.string(),
  method: authMethodSchema,
  device: z.string(),
  ip: z.string().nullable(),
  loginAt: isoDateTime,
  /** `null` = sessão ainda em andamento. */
  logoutAt: isoDateTime.nullable(),
  logoutReason: logoutReasonSchema.nullable(),
});
export type AccessLogEntry = z.infer<typeof accessLogEntrySchema>;

/** Sessão ativa = um dispositivo conectado (acesso em qualquer dispositivo). */
export const deviceSessionSchema = z.object({
  id: z.number().int(),
  device: z.string(),
  ip: z.string().nullable(),
  createdAt: isoDateTime,
  lastSeenAt: isoDateTime,
  expiresAt: isoDateTime,
  /** `true` na sessão que fez a requisição. */
  current: z.boolean(),
  /** Só na visão do administrador. */
  userId: z.number().int().nullable().optional(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().nullable().optional(),
});
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
