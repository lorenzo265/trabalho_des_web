import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrape, ScrapeError } from './index';

/** `npm run scrape`: executa o scraper com as variáveis de ambiente e grava data/scrapes/latest.json. */
async function main(): Promise<void> {
  const source = process.env.SCRAPER_SOURCE === 'portal' ? 'portal' : 'mock';
  const baseUrl = process.env.PORTAL_URL || 'http://localhost:4010';
  const username = process.env.PORTAL_USER || 'aluno@portal.local';
  const password = process.env.PORTAL_PASSWORD || 'aluno123';
  const chromiumPath = process.env.CHROMIUM_PATH || undefined;

  console.log(`Lendo "${source}" em ${baseUrl} …`);
  const result = await scrape({ source, baseUrl, username, password, ...(chromiumPath ? { chromiumPath } : {}) });

  const lessons = result.courses.reduce((n, c) => n + c.lessons.length, 0);
  const assignments = result.courses.reduce((n, c) => n + c.assignments.length, 0);
  const file = fileURLToPath(new URL('../../../data/scrapes/latest.json', import.meta.url));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(result, null, 2), 'utf8');

  console.log(`OK: ${result.courses.length} disciplinas, ${lessons} aulas, ${assignments} trabalhos.`);
  console.log(`Gravado em ${file}`);
}

main().catch((err: unknown) => {
  if (err instanceof ScrapeError) {
    console.error(`Falha (${err.code}): ${err.message}`);
  } else {
    console.error('Falha inesperada:', err);
  }
  process.exit(1);
});
