import { fileURLToPath } from 'node:url';

/** Base do LEX (Blackboard Learn Ultra da La Salle). */
export const LEX_URL = (process.env.LEX_URL || 'https://lex.lasalle.edu.br').replace(/\/+$/, '');

/** Sessão do aluno (cookies). Vale como senha enquanto estiver ativa: fica só local e fora do git (data/). */
export const SESSION_FILE =
  process.env.LEX_SESSION_FILE || fileURLToPath(new URL('../../../../data/lex-session.json', import.meta.url));

export const PROBE_FILE = fileURLToPath(new URL('../../../../data/lex-probe.txt', import.meta.url));
