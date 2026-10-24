import { z } from 'zod';
import { isoDateTime, LIMITS } from './common';

export const threadSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int().nullable(),
  subjectName: z.string().nullable(),
  subjectColor: z.string().nullable(),
  title: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Thread = z.infer<typeof threadSchema>;

export const threadInputSchema = z.object({
  subjectId: z.number().int().nullish().transform((v) => v ?? null),
  title: z.string().trim().max(80).nullish().transform((v) => v || null),
});
export type ThreadInput = z.input<typeof threadInputSchema>;

export const chatRoleSchema = z.enum(['user', 'assistant']);

export const messageSchema = z.object({
  id: z.number().int(),
  threadId: z.number().int(),
  role: chatRoleSchema,
  content: z.string(),
  createdAt: isoDateTime,
});
export type Message = z.infer<typeof messageSchema>;

export const messageInputSchema = z.object({
  content: z.string().trim().min(1, 'Escreva uma mensagem.').max(LIMITS.chatMessageMax),
});
export type MessageInput = z.infer<typeof messageInputSchema>;

export const threadWithMessagesSchema = z.object({
  thread: threadSchema,
  items: z.array(messageSchema),
});
export type ThreadWithMessages = z.infer<typeof threadWithMessagesSchema>;

/**
 * Contrato SSE de `POST /api/chats/:id/messages` (corpo `{content}`):
 *   event: user   data: Message            (mensagem do aluno já gravada)
 *   event: token  data: {"t":"texto"}      (pedaços da resposta)
 *   event: done   data: Message            (resposta completa gravada)
 *   event: error  data: {"code","message"} (falha da IA; mensagem amigável)
 */
export const sseTokenSchema = z.object({ t: z.string() });
export const sseErrorSchema = z.object({ code: z.string(), message: z.string() });
