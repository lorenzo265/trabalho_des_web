import { apiErrorSchema } from '@edumind/contracts';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Chamado quando uma rota protegida responde 401 (sessão expirou ou foi encerrada). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

const NETWORK_MESSAGE = 'Não foi possível falar com o servidor. Verifique se a API está rodando.';

export async function errorFromResponse(res: Response): Promise<ApiError> {
  try {
    const parsed = apiErrorSchema.safeParse(await res.json());
    if (parsed.success) return new ApiError(res.status, parsed.data.error.code, parsed.data.error.message);
  } catch {
    /* corpo não é JSON */
  }
  return new ApiError(res.status, 'http_error', `Erro inesperado (${res.status}).`);
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<S extends z.ZodType | undefined>(
  method: Method,
  path: string,
  body?: unknown,
  schema?: S,
  signal?: AbortSignal,
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', NETWORK_MESSAGE);
  }
  if (!res.ok) {
    const err = await errorFromResponse(res);
    if (res.status === 401 && !path.startsWith('/auth/') && path !== '/me') onUnauthorized?.();
    throw err;
  }
  if (res.status === 204 || !schema) return undefined as never;
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error('Resposta fora do contrato', path, parsed.error);
    throw new ApiError(res.status, 'contract_mismatch', 'O servidor respondeu em um formato inesperado.');
  }
  return parsed.data as never;
}

export const api = {
  get: <S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal) =>
    request('GET', path, undefined, schema, signal),
  post: <S extends z.ZodType | undefined = undefined>(path: string, body?: unknown, schema?: S) =>
    request('POST', path, body ?? {}, schema),
  patch: <S extends z.ZodType>(path: string, body: unknown, schema: S) => request('PATCH', path, body, schema),
  del: (path: string) => request('DELETE', path),
};

export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
