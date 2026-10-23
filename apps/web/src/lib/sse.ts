import { messageSchema, sseErrorSchema, sseTokenSchema, type Message } from '@edumind/contracts';
import { ApiError, errorFromResponse } from './api';

export interface SseEvent {
  event: string;
  data: string;
}

/** Separa eventos SSE completos (terminados por linha em branco) e devolve o resto do buffer. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: SseEvent[] = [];
  for (const part of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith(':')) continue; // comentário/heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

export interface ChatStreamHandlers {
  onUserMessage?: (m: Message) => void;
  onToken: (text: string) => void;
  onDone: (m: Message) => void;
  onError: (e: { code: string; message: string }) => void;
}

/** Envia a pergunta e entrega a resposta do tutor em streaming (POST + leitura incremental do corpo). */
export async function streamChat(
  threadId: number,
  content: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/chats/${threadId}/messages`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ content }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    throw new ApiError(0, 'network', 'Não foi possível falar com o servidor.');
  }
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) throw new ApiError(0, 'no_stream', 'Seu navegador não suporta resposta em tempo real.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSse(buffer);
      buffer = rest;
      for (const ev of events) dispatch(ev, handlers);
    }
    buffer += decoder.decode();
    if (buffer.trim()) for (const ev of parseSse(buffer + '\n\n').events) dispatch(ev, handlers);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    throw e;
  }
}

function dispatch(ev: SseEvent, h: ChatStreamHandlers) {
  let json: unknown;
  try {
    json = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (ev.event === 'token') {
    const t = sseTokenSchema.safeParse(json);
    if (t.success) h.onToken(t.data.t);
  } else if (ev.event === 'user') {
    const m = messageSchema.safeParse(json);
    if (m.success) h.onUserMessage?.(m.data);
  } else if (ev.event === 'done') {
    const m = messageSchema.safeParse(json);
    if (m.success) h.onDone(m.data);
  } else if (ev.event === 'error') {
    const e = sseErrorSchema.safeParse(json);
    h.onError(e.success ? e.data : { code: 'ai_unavailable', message: 'O Professor Tutor não está disponível agora.' });
  }
}
