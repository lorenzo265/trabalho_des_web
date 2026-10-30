import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { LEX_URL, SESSION_FILE } from './config';

/**
 * `npm run lex:login` — LOGIN ASSISTIDO. Abre um navegador visível; o aluno digita usuário, senha e MFA
 * direto no LEX. O script só espera a entrada e grava os cookies da sessão em data/lex-session.json.
 * Nenhuma credencial passa por aqui. Rode na sua máquina (precisa de tela).
 */
const WAIT_MS = 5 * 60_000;

async function launch(): Promise<Browser> {
  const path = process.env.CHROMIUM_PATH || undefined;
  if (path) return chromium.launch({ headless: false, executablePath: path });
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' }); // usa o Chrome instalado
  } catch {
    return chromium.launch({ headless: false }); // Chromium do Playwright (npx playwright-core install chromium)
  }
}

async function main(): Promise<void> {
  const browser = await launch().catch(() => {
    throw new Error('Não achei um navegador. Instale o Google Chrome ou rode: npx playwright-core install chromium');
  });
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: null });
  const page = await context.newPage();
  const closed = new Promise<never>((_, reject) => page.on('close', () => reject(new Error('A janela foi fechada antes do login terminar.'))));

  console.log(`Abrindo ${LEX_URL} … faça o login na janela (usuário, senha e MFA). Tempo: 5 min.`);
  await page.goto(`${LEX_URL}/ultra/course`);
  try {
    // Depois do login o LEX leva para /ultra/…; antes, a URL é a raiz com o formulário de login.
    await Promise.race([page.waitForURL((u) => u.origin === LEX_URL && u.pathname.startsWith('/ultra/'), { timeout: WAIT_MS }), closed]);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(2000); // deixa os cookies assentarem
    await mkdir(dirname(SESSION_FILE), { recursive: true });
    await context.storageState({ path: SESSION_FILE });
    await chmod(SESSION_FILE, 0o600).catch(() => undefined);
    console.log(`Sessão gravada em ${SESSION_FILE}`);
    console.log('Esse arquivo vale como a sua senha enquanto a sessão estiver ativa: não envie nem versione.');
    console.log('Próximo passo: npm run lex:probe');
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((err: unknown) => {
  console.error(`Falha: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
