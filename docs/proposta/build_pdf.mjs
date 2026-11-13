#!/usr/bin/env node
/**
 * Gera docs/proposta/PropostaTrabalhoFinal_EduMind.pdf a partir de proposta.html
 * (e logo-edumind.png a partir de logo-edumind.svg).
 *
 * Uso: node docs/proposta/build_pdf.mjs
 * Requer playwright-core (já usado pelo scraper) e um Chromium: o do Playwright ou o caminho em CHROMIUM_PATH.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

function loadChromium() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return require(name).chromium;
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error('playwright-core não encontrado. Rode `npm install` na raiz do repositório.');
}

const FOOTER = `
  <div style="width:100%;padding:0 16mm;font-family:Inter,Arial,sans-serif;font-size:7.5px;color:#5b6b82;
              display:flex;justify-content:space-between">
    <span>EduMind · Proposta do Trabalho Final · Grupo EduMind</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;

const browser = await loadChromium().launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(here, 'proposta.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: join(here, 'PropostaTrabalhoFinal_EduMind.pdf'),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: FOOTER,
    margin: { top: '15mm', bottom: '16mm', left: '16mm', right: '16mm' },
  });

  const logo = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await logo.goto(pathToFileURL(join(here, 'logo-edumind.svg')).href);
  await logo.screenshot({ path: join(here, 'logo-edumind.png'), omitBackground: true });
} finally {
  await browser.close();
}
console.log('OK: PropostaTrabalhoFinal_EduMind.pdf e logo-edumind.png gerados em docs/proposta/');
