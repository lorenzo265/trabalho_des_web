import type { StudyLevel } from '@edumind/contracts';

export interface LlmTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** Prompt de sistema já montado (usado pela IA real). */
  system: string;
  /** Últimas mensagens da conversa, incluindo a pergunta atual. */
  history: LlmTurn[];
  /** Contexto estruturado (usado pelo tutor de demonstração). */
  context: { firstName: string; subjectName: string | null; level: StudyLevel };
  signal?: AbortSignal;
}

/** Cliente do Professor Tutor: devolve a resposta em pedaços (streaming). */
export interface LlmClient {
  /** `demo` = resposta simulada (sem chave); `openrouter` = IA real. */
  readonly mode: 'demo' | 'openrouter';
  stream(req: LlmRequest): AsyncIterable<string>;
}

/** Falha da IA com mensagem já amigável para o aluno. */
export class LlmError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
