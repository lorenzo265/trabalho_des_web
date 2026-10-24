import { createHash, randomBytes } from 'node:crypto';

/** Token de sessão opaco: 32 bytes aleatórios em base64url (vai só no cookie). */
export const newSessionToken = (): string => randomBytes(32).toString('base64url');

/** Só este hash é gravado no banco; o token em si nunca é guardado. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Lê um cookie do cabeçalho `Cookie`. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
