import type { Page } from 'playwright-core';
import type { ScrapedCourse } from '@edumind/contracts';

export interface Credentials {
  username: string;
  password: string;
}

/** Referência a uma disciplina na listagem do portal (ainda sem os detalhes). */
export interface CourseRef {
  externalId: string;
  name: string;
  url: string;
}

/**
 * Um adaptador sabe ler UMA plataforma e devolve dados já no formato dos contratos.
 * Regras: somente leitura (nada é enviado, editado ou apagado na plataforma) e erros
 * lançados como `ScrapeError`. Selectores e formatos de texto ficam aqui dentro.
 */
export interface SourceAdapter {
  readonly source: 'mock' | 'portal';

  /**
   * Caminhos em que um POST é permitido (formulário de login). Qualquer outra requisição
   * que não seja GET/HEAD é abortada pelo orquestrador — trava de "somente leitura".
   */
  readonly writePaths: readonly string[];

  login(page: Page, credentials: Credentials): Promise<void>;
  listCourses(page: Page): Promise<CourseRef[]>;
  readCourse(page: Page, ref: CourseRef): Promise<ScrapedCourse>;

  /** Encerra a sessão do próprio scraper (opcional, melhor esforço). */
  logout?(page: Page): Promise<void>;
}
