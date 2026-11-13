import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { createReconSession, type ReconSession } from './capture';

/**
 * `npm run recon -- <url> [--mask "Seu Nome"] [--mask 20231234]`
 *
 * Abre o portal num navegador VISÍVEL. Você faz o login sozinho(a) e navega; quando estiver numa
 * página que o adaptador precisa conhecer (login, lista de disciplinas, uma disciplina…), digite
 * `c` aqui no terminal. O programa nunca digita senha, não grava cookies nem cabeçalhos.
 */

const HELP = `
Uso: npm run recon -- <endereço-do-portal> [opções]

  --mask <texto>     Esconde esse texto (nome, matrícula, e-mail…) nos arquivos. Pode repetir.
  --out <pasta>      Onde gravar (padrão: data/recon/<data-hora>, que o Git ignora).
  --channel <nome>   Usa o Chrome/Edge já instalado (chrome, msedge) em vez do Chromium do Playwright.
  --headless         Sem janela (só para testes automáticos).
  -h, --help         Esta ajuda.

O endereço também pode vir da variável PORTAL_URL. Não coloque usuário e senha no endereço.
Para apontar para um Chromium específico, defina CHROMIUM_PATH.
`;

const COMMANDS = `
Comandos (digite aqui no terminal e tecle Enter):
  c [rótulo]   captura a página que está aberta no navegador (ex.: "c login", "c disciplinas")
  Enter        o mesmo, com o rótulo tirado do endereço
  q            termina e gera o relatório (fechar o navegador também termina)
  h            mostra esta lista
`;

const pad = (n: number): string => String(n).padStart(2, '0');
const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const parseCli = () =>
  parseArgs({
    allowPositionals: true,
    options: {
      mask: { type: 'string', multiple: true },
      out: { type: 'string' },
      channel: { type: 'string' },
      headless: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseCli>;
  try {
    parsed = parseCli();
  } catch (err) {
    fail(`${err instanceof Error ? err.message : String(err)}\n${HELP}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(HELP);
    return;
  }

  const rawUrl = positionals[0] ?? process.env.PORTAL_URL;
  if (!rawUrl) fail(`Faltou o endereço do portal.\n${HELP}`);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`Endereço inválido: "${rawUrl}". Use algo como https://portal.suafaculdade.edu.br`);
  }
  if (!/^https?:$/.test(url.protocol)) fail('Use um endereço http:// ou https://.');
  if (url.username || url.password) fail('Não coloque usuário e senha no endereço. Faça o login no navegador que vai abrir.');

  const maskTerms = values.mask ?? [];
  const outDir = values.out ?? fileURLToPath(new URL(`../../../../data/recon/${stamp(new Date())}`, import.meta.url));

  const executablePath = process.env.CHROMIUM_PATH || undefined;
  if (executablePath && !existsSync(executablePath)) {
    fail(`Chromium não encontrado em "${executablePath}". Ajuste CHROMIUM_PATH ou rode: npx playwright-core install chromium`);
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: values.headless,
      ...(executablePath ? { executablePath } : {}),
      ...(values.channel ? { channel: values.channel } : {}),
    });
  } catch (err) {
    fail(
      `Não consegui abrir o navegador: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}\n` +
        'Rode `npx playwright-core install chromium`, ou use o Chrome instalado: --channel chrome. ' +
        'Este comando precisa de uma tela; rode no seu computador, não em servidor sem interface gráfica.',
    );
  }

  let session: ReconSession;
  let context: BrowserContext;
  try {
    // Mesmos idioma e fuso do scraper: os formatos de data/hora do portal saem como no scrape real.
    context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: null });
    session = await createReconSession(context, { outDir, maskTerms });
  } catch (err) {
    await browser.close().catch(() => undefined);
    fail(err instanceof Error ? err.message : String(err));
  }

  // Página "atual" = a última aberta que ainda existe (inclui janelas abertas por SSO).
  const pages: Page[] = [];
  const track = (p: Page): void => {
    pages.push(p);
    p.on('close', () => {
      const i = pages.indexOf(p);
      if (i >= 0) pages.splice(i, 1);
    });
  };
  context.on('page', track);
  const first = await context.newPage(); // o evento "page" acima já a registra em `pages`

  console.log('\nEduMind · reconhecimento do portal');
  console.log(`Abrindo ${url.origin}${url.pathname === '/' ? '' : url.pathname} num navegador visível.`);
  console.log('Faça o login VOCÊ MESMO(A): este programa não digita nada e não grava cookies, senhas nem cabeçalhos.');
  console.log('Cada página capturada é salva sem scripts e com dados pessoais mascarados.');
  if (maskTerms.length === 0) {
    console.log('\nDica: esconda seu nome e matrícula com  --mask "Seu Nome" --mask 20231234');
  }
  console.log(COMMANDS);
  console.log(`Saída: ${outDir}\n`);

  await first.goto(url.toString(), { waitUntil: 'domcontentloaded' }).catch((err: unknown) => {
    console.warn(`Aviso: não consegui abrir ${url.origin} (${err instanceof Error ? err.message.split('\n')[0] : String(err)}). Digite o endereço no navegador.`);
  });

  let finishing: Promise<void> | undefined;
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'recon> ' });

  const finish = (reason: string): Promise<void> => {
    finishing ??= (async () => {
      console.log(`\n${reason} Gerando o relatório…`);
      rl.close();
      try {
        const { dir, reportFile } = await session.finish();
        console.log(`\nPronto. ${session.captures.length} arquivo(s) HTML em:\n  ${dir}\n`);
        console.log(`Leia primeiro: ${reportFile}`);
        console.log('ANTES de enviar qualquer arquivo: abra os .html, procure seu nome, matrícula, e-mail e notas, e troque o que sobrar.');
      } catch (err) {
        console.error(`Falha ao gerar o relatório: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
      await browser.close().catch(() => undefined);
    })();
    return finishing;
  };

  browser.on('disconnected', () => void finish('O navegador foi fechado.'));
  process.on('SIGINT', () => void finish('Interrompido.').then(() => process.exit()));

  // Um comando por vez, na ordem em que foram digitados.
  let chain: Promise<void> = Promise.resolve();
  const handle = async (line: string): Promise<void> => {
    const [cmd = '', ...rest] = line.trim().split(/\s+/);
    const word = cmd.toLowerCase();
    if (word === 'q' || word === 'sair' || word === 'fim') {
      await finish('Encerrando.');
      return;
    }
    if (word === 'h' || word === '?' || word === 'ajuda') {
      console.log(COMMANDS);
      return;
    }
    if (line.trim() !== '' && word !== 'c' && word !== 'capturar') {
      console.log('Não entendi. Digite "c rótulo" para capturar, "q" para terminar, "h" para ajuda.');
      return;
    }
    const page = pages[pages.length - 1];
    if (!page) {
      console.log('Nenhuma aba aberta para capturar.');
      return;
    }
    try {
      const entries = await session.capture(page, rest.join(' '));
      const main = entries[0];
      if (main) {
        const extra = entries.length > 1 ? ` (+${entries.length - 1} iframe)` : '';
        console.log(`✔ ${main.file}${extra} — ${main.url}`);
      }
    } catch (err) {
      console.log(`✘ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  rl.on('line', (line) => {
    chain = chain.then(() => handle(line)).then(() => {
      if (!finishing) rl.prompt();
    });
  });
  // Entrada encerrada (Ctrl+D ou arquivo/pipe acabou): termina depois do que já foi pedido.
  rl.on('close', () => void chain.then(() => finish('Entrada encerrada.')));
  rl.prompt();

  await new Promise<void>((resolve) => void browser.on('disconnected', () => resolve()));
  await finishing;
}

main().catch((err: unknown) => {
  console.error('Falha inesperada:', err);
  process.exit(1);
});
