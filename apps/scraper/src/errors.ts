export type ScrapeErrorCode =
  | 'invalid_credentials'
  | 'layout_changed'
  | 'unreachable'
  | 'browser_unavailable'
  | 'unknown';

const DEFAULT_MESSAGES: Record<ScrapeErrorCode, string> = {
  invalid_credentials: 'Usuário ou senha da faculdade inválidos. Confira PORTAL_USER e PORTAL_PASSWORD.',
  layout_changed:
    'A página da faculdade mudou de formato e não foi possível ler os dados. O último dado bom foi mantido.',
  unreachable: 'Não foi possível acessar a plataforma da faculdade. Confira PORTAL_URL e a conexão.',
  browser_unavailable:
    'Navegador do scraper não encontrado. Rode: npx playwright-core install chromium (ou defina CHROMIUM_PATH).',
  unknown: 'Falha inesperada ao ler a plataforma da faculdade.',
};

/** Erro do scraper com um código estável e mensagem amigável (PT-BR) para mostrar ao aluno. */
export class ScrapeError extends Error {
  override readonly name = 'ScrapeError';

  constructor(
    readonly code: ScrapeErrorCode,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? DEFAULT_MESSAGES[code], options);
  }
}
