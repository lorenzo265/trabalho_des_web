import type { LlmClient, LlmRequest } from './llm';
import { levelLabel } from './prompt';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

const excerpt = (s: string, max = 140) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

const TOM = {
  medio: 'Vou explicar de um jeito bem simples e com calma.',
  superior: 'Vamos aprofundar com um pouco mais de rigor.',
  concurso: 'Vou focar no que costuma aparecer em prova.',
} as const;

/** Resposta didática determinística, claramente identificada como demonstração. */
export function demoAnswer(req: LlmRequest): string {
  const question = excerpt(req.history.filter((t) => t.role === 'user').at(-1)?.content ?? '');
  const tema = req.context.subjectName ?? 'o assunto';
  return [
    '> 🧪 **Modo demonstração** — esta resposta é simulada, não vem de uma IA. Configure `OPENROUTER_API_KEY` para conversar com o Professor Tutor de verdade.',
    '',
    `Olá, ${req.context.firstName}! Vamos pensar juntos sobre **${tema}** (${levelLabel(req.context.level)}). ${TOM[req.context.level]}`,
    '',
    `Sobre a sua dúvida — "${question}":`,
    '',
    '1. **Ideia central:** resuma em uma frase o que você quer descobrir.',
    `2. **Exemplo concreto:** escolha um caso pequeno de ${tema} e resolva passo a passo, no papel.`,
    '3. **Conferência:** compare o resultado com o que você esperava e anote onde ficou em dúvida.',
    '',
    `**Para checar o entendimento:** com as suas palavras, qual é a parte mais difícil de "${question}" para você agora?`,
  ].join('\n');
}

export class DemoLlm implements LlmClient {
  readonly mode = 'demo' as const;
  /** Atraso entre palavras (use 0 nos testes). */
  constructor(private readonly opts: { delayMs?: number } = {}) {}

  async *stream(req: LlmRequest): AsyncGenerator<string> {
    // Palavras com o espaço/quebra de linha que vem depois, para preservar o Markdown.
    for (const piece of demoAnswer(req).match(/\S+\s*/g) ?? []) {
      if (req.signal?.aborted) return;
      yield piece;
      await sleep(this.opts.delayMs ?? 25, req.signal);
    }
  }
}
