import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPortalServer } from '../portal-mock/server';
import { browserAvailable } from '../scrape';
import { createReconSession } from './capture';

const chromiumOk = await browserAvailable();
if (!chromiumOk) {
  console.warn('[recon] Chromium não encontrado — testes de integração PULADOS (npx playwright-core install chromium).');
}

const listen = (server: Server): Promise<string> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
const close = (server: Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

/** Lê todos os arquivos gerados numa única string (para provar que um segredo não aparece em nenhum). */
async function readAll(dir: string): Promise<{ files: string[]; all: string }> {
  const files = (await readdir(dir)).sort();
  const parts = await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')));
  return { files, all: parts.join('\n=====\n') };
}

describe.skipIf(!chromiumOk)('recon contra o portal mock (Chromium real)', () => {
  let portal: Server;
  let base: string;
  let browser: Browser;
  let context: BrowserContext;
  let dir: string;

  beforeAll(async () => {
    portal = createPortalServer({ user: 'aluno@portal.local', password: 'aluno123', today: () => '2026-10-23' });
    base = await listen(portal);
    const executablePath = process.env.CHROMIUM_PATH || undefined;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  });
  afterAll(async () => {
    await browser?.close();
    await close(portal);
  });
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'recon-'));
    context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  });
  afterEach(async () => {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('captura login, lista e disciplina e gera o relatório', async () => {
    const session = await createReconSession(context, { outDir: dir, maskTerms: ['Profa. Carla'] });
    const page = await context.newPage();

    await page.goto(`${base}/login`);
    await session.capture(page, 'Login');
    await page.getByLabel('E-mail').fill('aluno@portal.local');
    await page.getByLabel('Senha').fill('aluno123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/disciplinas');
    await session.capture(page, 'Minhas disciplinas');
    await page.goto(`${base}/disciplinas/ia`);
    await session.capture(page);
    const { reportFile } = await session.finish();

    const { files, all } = await readAll(dir);
    expect(files).toEqual(['01-login.html', '02-minhas-disciplinas.html', '03-ia.html', 'recon.json', 'rede.json', 'relatorio.md']);

    // Nada de scripts/estilos, e nada do que o "aluno" digitou nem do e-mail.
    const login = await readFile(join(dir, '01-login.html'), 'utf8');
    expect(login).toContain('type="password"');
    expect(login).not.toMatch(/<style|<script/i);
    expect(all).not.toContain('aluno123');
    expect(all).not.toContain('aluno@portal.local');

    // Termo informado: a professora some do HTML e do relatório.
    const course = await readFile(join(dir, '03-ia.html'), 'utf8');
    expect(course).toContain('[dado-1]');
    expect(all).not.toContain('Carla');
    // …mas a estrutura que o adaptador precisa continua lá.
    expect(course).toContain('class="tabela aulas"');
    expect(course).toMatch(/id="aula-ia-/);

    const report = await readFile(reportFile, 'utf8');
    expect(report).toContain('formulário próprio de usuário e senha');
    expect(report).toContain('`senha` · password');
    expect(report).toContain('`POST /login`');
    expect(report).toContain('nenhuma plataforma conhecida');
    expect(report).toContain('"Data", "Horário", "Conteúdo", "Sala"');
    expect(report).toMatch(/`id` da 1ª linha: `aula-ia-/);
    expect(report).toContain('termo informado em --mask');
    expect(report).not.toContain('Você não usou `--mask`');

    // Rede: o POST de login redireciona para a lista (fluxo de login visível), sem cookies/corpo.
    const network = JSON.parse(await readFile(join(dir, 'rede.json'), 'utf8')) as { method: string; status: number; path: string; redirectTo?: string }[];
    const loginPost = network.find((n) => n.method === 'POST' && n.path === '/login');
    expect(loginPost?.status).toBe(302);
    expect(loginPost?.redirectTo).toContain('/disciplinas');
    expect(all).not.toContain('portal_sid');
  });

  it('sem --mask o relatório avisa que nome e matrícula não são escondidos', async () => {
    const session = await createReconSession(context, { outDir: dir });
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await session.capture(page, 'login');
    const { reportFile } = await session.finish();
    expect(await readFile(reportFile, 'utf8')).toContain('Você não usou `--mask`');
  });

  it('finish() é idempotente e capturas simultâneas não se atropelam', async () => {
    const session = await createReconSession(context, { outDir: dir });
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    const [a, b] = await Promise.all([session.capture(page, 'a'), session.capture(page, 'a')]);
    expect(a[0]?.file).toBe('01-a.html');
    expect(b[0]?.file).toBe('02-a.html');
    const [r1, r2] = await Promise.all([session.finish(), session.finish()]);
    expect(r1).toEqual(r2);
  });
});

describe.skipIf(!chromiumOk)('recon com uma página cheia de segredos', () => {
  const SECRETS = [
    'SEGREDO_SCRIPT_9f8e7d',
    'SENHA_DIGITADA_123',
    'COMENTARIO_SECRETO',
    'CSRF_HIDDEN_ABC',
    'TEXTAREA_PRIVADA',
    'maria.silva@faculdade.edu.br',
    '123.456.789-09',
    'SESSKEY_NA_URL',
    'TOKEN_NA_API',
    'JSON_NOME_SECRETO',
    'JSON_EMAIL_SECRETO@x.com',
    'iVBORw0KGgoAAAANSUhEUgAA',
    'META_CSRF_TOKEN_XYZ',
    'COOKIE_DE_SESSAO_ABC',
    'IFRAME_SENHA_VALOR',
  ];

  let server: Server;
  let base: string;
  let browser: Browser;
  let context: BrowserContext;
  let dir: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/api/disciplinas') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 7, nome: 'JSON_NOME_SECRETO', email: 'JSON_EMAIL_SECRETO@x.com', nota: 8.5, prazo: '2025-10-30' }], total: 1 }));
        return;
      }
      if (url.pathname === '/frame') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<form action="/sso" method="post"><input name="login" type="text" value="IFRAME_SENHA_VALOR"><input name="pwd" type="password"></form>');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'sid=COOKIE_DE_SESSAO_ABC; HttpOnly' });
      res.end(`<!doctype html><html lang="pt-BR"><head><title>Painel</title>
<meta name="csrf-token" content="META_CSRF_TOKEN_XYZ">
<style>body{color:red}</style>
<script>window.__CFG = { token: "SEGREDO_SCRIPT_9f8e7d" };
fetch('/api/disciplinas?token=TOKEN_NA_API&periodo=2025').then(r => r.json()).then(() => { document.title = 'Painel*'; });</script></head>
<body onload="alert('SEGREDO_SCRIPT_9f8e7d')">
<!-- COMENTARIO_SECRETO -->
<h1>Painel do aluno</h1>
<p>Fale com maria.silva@faculdade.edu.br · CPF 123.456.789-09</p>
<a href="/course/view.php?id=42&amp;sesskey=SESSKEY_NA_URL">Cálculo</a>
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA">
<form action="/login" method="post">
  <input name="email" type="email" value="prefill@x.com"><input name="senha" type="password">
  <input type="hidden" name="csrfmiddlewaretoken" value="CSRF_HIDDEN_ABC"><input type="hidden" name="turma" value="T1">
  <textarea name="obs">TEXTAREA_PRIVADA</textarea><button type="submit">Entrar</button>
</form>
<iframe src="/frame"></iframe>
</body></html>`);
    });
    base = await listen(server);
    const executablePath = process.env.CHROMIUM_PATH || undefined;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  });
  afterAll(async () => {
    await browser?.close();
    await close(server);
  });
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'recon-'));
    context = await browser.newContext({ locale: 'pt-BR' });
  });
  afterEach(async () => {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('nenhum segredo aparece em nenhum arquivo gerado', async () => {
    const session = await createReconSession(context, { outDir: dir });
    const page = await context.newPage();
    const apiDone = page.waitForResponse((r) => r.url().includes('/api/disciplinas'));
    await page.goto(`${base}/painel`);
    await apiDone;
    // O usuário digita algo antes de capturar: isso não pode ir para o arquivo.
    await page.locator('input[name=senha]').fill('SENHA_DIGITADA_123');
    const entries = await session.capture(page, 'painel');
    await session.finish();

    const { files, all } = await readAll(dir);
    for (const secret of SECRETS) expect(all, `vazou: ${secret}`).not.toContain(secret);

    // Iframe capturado à parte.
    expect(entries.map((e) => e.file)).toEqual(['01-painel.html', '01-painel.frame1.html']);
    expect(files).toContain('01-painel.frame1.html');

    // A estrutura continua legível para quem for escrever o adaptador.
    const html = await readFile(join(dir, '01-painel.html'), 'utf8');
    expect(html).toContain('<h1>Painel do aluno</h1>');
    expect(html).toContain('id=42');
    expect(html).toContain('sesskey=[oculto]');
    expect(html).toContain('name="turma" value="T1"');
    expect(html).toContain('name="csrfmiddlewaretoken" value="[oculto]"');
    expect(html).toContain('[email]');
    expect(html).toContain('[CPF]');
    expect(html).not.toMatch(/<script|<style|<!--\s*COMENT/i);
    expect(html).not.toContain(' onload=');

    // JSON interno: só a forma.
    const network = JSON.parse(await readFile(join(dir, 'rede.json'), 'utf8')) as { path: string; queryKeys: string[]; shape?: unknown }[];
    const api = network.find((n) => n.path === '/api/disciplinas');
    expect(api?.queryKeys).toEqual(['token', 'periodo']);
    expect(api?.shape).toEqual({
      items: [{ id: 'number(inteiro)', nome: 'string', email: 'string(email)', nota: 'number', prazo: 'string(data ISO)' }],
      total: 'number(inteiro)',
    });

    // O formulário dentro do iframe é detectado como login.
    const report = await readFile(join(dir, 'relatorio.md'), 'utf8');
    expect(report).toContain('01-painel.frame1.html');
    expect(report).toContain('Formulário em `01-painel.frame1.html` — `POST /sso`');
    expect(report).toContain('`pwd` · password');
  });
});
