import { ScrapeError } from '../errors';
import type { SourceAdapter } from './types';

/**
 * ESQUELETO do adaptador da faculdade real — ainda NÃO implementado.
 *
 * O que falta (ver docs/superpowers/specs/2026-10-23-poc-estrutura-stack.md, §9):
 *  - D1: descobrir qual é a plataforma (Moodle, LEX, portal próprio…). Prioridade de abordagem:
 *        API oficial/token > endpoint interno (JSON) > leitura do DOM (último recurso).
 *  - D2: como é o login (usuário/senha simples, SSO, MFA, captcha). Com MFA/captcha o caminho é o
 *        "login assistido" (o aluno entra num navegador e reaproveitamos a sessão); nunca burlamos.
 *  - Mapear: lista de disciplinas, professor/local, aulas (data, horário, conteúdo, sala) e
 *        trabalhos (prazo, situação, nota) para `ScrapedCourse` (contracts/src/scrape.ts), usando
 *        os helpers de `../normalize`.
 *  - Termos de uso (D10): somente leitura, conta do próprio aluno, limite de taxa.
 *
 * Para implementar: copie `mock-portal.ts`, troque URLs/seletores e registre em `../scrape.ts`.
 */
const NOT_IMPLEMENTED = () =>
  new ScrapeError(
    'unknown',
    'Adaptador da faculdade real ainda não implementado (depende do reconhecimento da plataforma). ' +
      'Use SCRAPER_SOURCE=mock enquanto isso.',
  );

export function createPortalAdapter(_baseUrl: string): SourceAdapter {
  return {
    source: 'portal',
    writePaths: [],
    login: async () => {
      throw NOT_IMPLEMENTED();
    },
    listCourses: async () => {
      throw NOT_IMPLEMENTED();
    },
    readCourse: async () => {
      throw NOT_IMPLEMENTED();
    },
  };
}
