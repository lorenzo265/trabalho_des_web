/** Erro HTTP controlado: vira `{ error: { code, message } }` com o status certo. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, 'not_found', `${what} não encontrado.`);

export const tooMany = (retryAfterSeconds: number) =>
  new HttpError(
    429,
    'rate_limited',
    `Muitas tentativas. Tente de novo em ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min.`,
    { 'Retry-After': String(retryAfterSeconds) },
  );
