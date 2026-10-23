import type { Page } from 'playwright-core';
import type { ScrapedAssignment, ScrapedCourse, ScrapedLesson } from '@edumind/contracts';
import { ScrapeError } from '../errors';
import {
  cleanText,
  dedupeByExternalId,
  emptyToNull,
  mapAssignmentStatus,
  parseBrDate,
  parseGrade,
  parseTimeRange,
} from '../normalize';
import type { CourseRef, Credentials, SourceAdapter } from './types';

interface RawRow {
  id: string;
  cells: string[];
}

/** Lê as linhas de uma tabela: `id` do <tr> (sem o prefixo) e o texto de cada <td>. */
async function readRows(page: Page, selector: string): Promise<RawRow[]> {
  return page.locator(`${selector} tbody tr`).evaluateAll((rows) =>
    rows.map((r) => ({
      id: r.id,
      cells: Array.from(r.querySelectorAll('td'), (td) => td.textContent ?? ''),
    })),
  );
}

const layoutError = (what: string, cause?: unknown) =>
  new ScrapeError('layout_changed', undefined, { cause: cause ?? new Error(what) });

/** Adaptador do portal mock (HTML de um portal acadêmico genérico). Somente leitura. */
export function createMockPortalAdapter(baseUrl: string): SourceAdapter {
  const base = baseUrl.replace(/\/+$/, '');

  return {
    source: 'mock',
    writePaths: ['/login'],

    async login(page: Page, { username, password }: Credentials) {
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('E-mail').fill(username);
      await page.getByLabel('Senha').fill(password);
      await page.getByRole('button', { name: 'Entrar' }).click();
      // Resolve nos dois desfechos: erro de senha ou lista de disciplinas.
      await page.locator('.alert-danger, ul.lista-disciplinas').first().waitFor();
      if ((await page.locator('.alert-danger').count()) > 0) throw new ScrapeError('invalid_credentials');
      if (!new URL(page.url()).pathname.startsWith('/disciplinas')) throw layoutError('pós-login inesperado');
    },

    async listCourses(page: Page): Promise<CourseRef[]> {
      if (!new URL(page.url()).pathname.replace(/\/+$/, '').endsWith('/disciplinas')) {
        await page.goto(`${base}/disciplinas`, { waitUntil: 'domcontentloaded' });
      }
      await page.locator('ul.lista-disciplinas').waitFor();
      const links = await page
        .locator('ul.lista-disciplinas li.disciplina a')
        .evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href') ?? '', text: a.textContent ?? '' })));
      return links.map((l) => {
        const externalId = l.href.split('/').filter(Boolean).pop();
        const name = cleanText(l.text);
        if (!externalId || !name) throw layoutError('link de disciplina sem id/nome');
        return { externalId, name, url: new URL(l.href, `${base}/`).toString() };
      });
    },

    async readCourse(page: Page, ref: CourseRef): Promise<ScrapedCourse> {
      await page.goto(ref.url, { waitUntil: 'domcontentloaded' });
      await page.locator('h1.curso-titulo').waitFor();

      // Cabeçalho: pares <dt>/<dd> ("Professor(a)", "Local").
      const info = await page.locator('dl.curso-info').evaluate((dl) => {
        const out: Record<string, string> = {};
        dl.querySelectorAll('dt').forEach((dt) => {
          out[(dt.textContent ?? '').trim().toLowerCase()] = dt.nextElementSibling?.textContent ?? '';
        });
        return out;
      });
      const pick = (prefix: string): string | null => {
        const key = Object.keys(info).find((k) => k.startsWith(prefix));
        return key ? emptyToNull(info[key]) : null;
      };

      const lessons: ScrapedLesson[] = (await readRows(page, 'table.aulas')).map(({ id, cells }) => {
        const [dateCell, timeCell, topicCell, roomCell] = cells;
        const date = parseBrDate(dateCell);
        const time = parseTimeRange(timeCell);
        const externalId = id.replace(/^aula-/, '');
        if (!externalId || !date || !time) throw layoutError(`linha de aula ilegível: ${cleanText(cells.join(' | '))}`);
        return {
          externalId,
          date,
          start: time.start,
          end: time.end,
          topic: emptyToNull(topicCell),
          room: emptyToNull(roomCell),
        };
      });

      const assignments: ScrapedAssignment[] = (await readRows(page, 'table.trabalhos')).map(({ id, cells }) => {
        const [titleCell, descCell, dueCell, statusCell, gradeCell] = cells;
        const title = emptyToNull(titleCell);
        const dueDate = parseBrDate(dueCell);
        const externalId = id.replace(/^trabalho-/, '');
        if (!externalId || !title || !dueDate) throw layoutError(`linha de trabalho ilegível: ${cleanText(cells.join(' | '))}`);
        return {
          externalId,
          title,
          description: emptyToNull(descCell),
          dueDate,
          status: mapAssignmentStatus(statusCell),
          grade: parseGrade(gradeCell),
        };
      });

      const name = cleanText(await page.locator('h1.curso-titulo').textContent());
      return {
        externalId: ref.externalId,
        name: name || ref.name,
        professor: pick('professor'),
        room: pick('local'),
        lessons: dedupeByExternalId(lessons),
        assignments: dedupeByExternalId(assignments),
      };
    },

    async logout(page: Page) {
      // Encerra só a sessão do próprio scraper; não altera nenhum dado da plataforma.
      await page.goto(`${base}/sair`, { waitUntil: 'domcontentloaded' });
    },
  };
}
