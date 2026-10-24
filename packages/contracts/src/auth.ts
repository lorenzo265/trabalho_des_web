import { z } from 'zod';
import { isoDateTime, LIMITS } from './common';

export const studyLevelSchema = z.enum(['medio', 'superior', 'concurso']);
export type StudyLevel = z.infer<typeof studyLevelSchema>;
export const roleSchema = z.enum(['user', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  level: studyLevelSchema,
  /** Meta semanal de estudo, em minutos (Tela 5 — Progresso). */
  weeklyGoalMinutes: z.number().int(),
  createdAt: isoDateTime,
  lastLoginAt: isoDateTime.nullable(),
});
export type User = z.infer<typeof userSchema>;

export const registerInputSchema = z.object({
  name: z.string().trim().min(LIMITS.nameMin, 'Informe seu nome.').max(LIMITS.nameMax),
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')),
  password: z
    .string()
    .min(LIMITS.passwordMin, `A senha precisa ter pelo menos ${LIMITS.passwordMin} caracteres.`)
    .max(LIMITS.passwordMax, `A senha é longa demais (máximo ${LIMITS.passwordMax}).`),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')),
  password: z.string().min(1, 'Informe a senha.').max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const profilePatchSchema = z.object({
  name: z.string().trim().min(LIMITS.nameMin).max(LIMITS.nameMax).optional(),
  level: studyLevelSchema.optional(),
  weeklyGoalMinutes: z.number().int().min(30).max(7 * 24 * 60).optional(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const authResponseSchema = z.object({ user: userSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const appConfigSchema = z.object({
  appName: z.string(),
  /** `demo` = tutor de demonstração (sem chave); `openrouter` = IA real. */
  aiMode: z.enum(['demo', 'openrouter']),
  /** Login com Google: fica `false` no PoC local (ver docs). */
  googleEnabled: z.boolean(),
  /** Fonte dos scrapers: `mock` (portal de demonstração local) ou `portal` (faculdade real). */
  scraperSource: z.enum(['mock', 'portal']),
});
export type AppConfig = z.infer<typeof appConfigSchema>;
