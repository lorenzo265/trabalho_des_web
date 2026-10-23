import { LlmError, type LlmClient, type LlmRequest } from './llm';

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Tempo máximo total de uma resposta. */
  timeoutMs?: number;
}

const FRIENDLY: Record<number, [string, string]> = {
  401: ['ai_not_configured', 'A chave da IA parece inválida. Avise o administrador.'],
  402: ['ai_no_credit', 'A conta da IA está sem créditos no momento.'],
  403: ['ai_not_configured', 'A chave da IA não tem permissão para este modelo.'],
  429: ['ai_busy', 'A IA está muito ocupada agora. Tente de novo em instantes.'],
};
const UNAVAILABLE = 'O Professor Tutor não conseguiu responder agora. Tente novamente em instantes.';

/** Cliente da OpenRouter (API compatível com OpenAI) com streaming SSE. */
export class OpenRouterLlm implements LlmClient {
  readonly mode = 'openrouter' as const;
  constructor(private readonly o: OpenRouterOptions) {}

  async *stream(req: LlmRequest): AsyncGenerator<string> {
    const timeout = AbortSignal.timeout(this.o.timeoutMs ?? 90_000);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(`${this.o.baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${this.o.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'EduMind',
        },
        body: JSON.stringify({
          model: this.o.model,
          stream: true,
          temperature: 0.4,
          max_tokens: 700,
          messages: [{ role: 'system', content: req.system }, ...req.history],
        }),
      });
    } catch {
      if (req.signal?.aborted) return;
      throw new LlmError('ai_unavailable', UNAVAILABLE);
    }

    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined);
      const [code, message] = FRIENDLY[res.status] ?? ['ai_unavailable', UNAVAILABLE];
      throw new LlmError(code, message);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          // Linhas de comentário (": OPENROUTER PROCESSING") e vazias são ignoradas.
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          let json: { choices?: { delta?: { content?: unknown } }[]; error?: unknown };
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (json.error) throw new LlmError('ai_unavailable', UNAVAILABLE);
          const piece = json.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece) yield piece;
        }
      }
    } catch (e) {
      if (req.signal?.aborted) return;
      if (e instanceof LlmError) throw e;
      throw new LlmError('ai_unavailable', UNAVAILABLE);
    }
  }
}
