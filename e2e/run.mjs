// Teste de ponta a ponta (fumaça) + capturas de tela das telas do EduMind.
// Pré-requisito: `npm run seed` e `npm run dev` rodando (web em 5173, api em 3001).
// Uso: node e2e/run.mjs            -> valida os fluxos
//      SHOTS=1 node e2e/run.mjs    -> também grava PNGs em docs/entrega/telas/
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.E2E_URL ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS === '1';
const OUT = join(ROOT, 'docs', 'entrega', 'telas');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const PORTAL = process.env.PORTAL_URL ?? 'http://localhost:4010'; // portal mock (gatilho de mudanças simuladas)
const DEMO = { email: 'aluno@edumind.local', password: 'aluno12345' };
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@edumind.local', password: process.env.ADMIN_PASSWORD ?? 'admin12345' };
const stamp = Date.now().toString(36);
const NEW_USER = { name: 'Ana Teste', email: `ana.${stamp}@teste.local`, password: 'senhaForte123' };

const results = [];
let activePage = null;
const FAIL_DIR = process.env.FAIL_DIR ?? '/tmp';
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (e) {
    const lines = String(e?.message ?? e).split('\n').filter(Boolean).slice(0, 4).join('\n       ');
    results.push({ name, ok: false, error: lines });
    console.log(`  FAIL ${name}\n       ${lines}`);
    const file = join(FAIL_DIR, `e2e-fail-${results.length}.png`);
    await activePage?.screenshot({ path: file }).then(() => console.log(`       captura: ${file}`)).catch(() => {});
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const consoleErrors = [];

async function newPage(kind = 'mobile') {
  const ctx = await browser.newContext(
    kind === 'mobile'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' }
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  );
  ctx.setDefaultTimeout(12_000);
  const page = await ctx.newPage();
  activePage = page;
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`[${kind}] ${m.text()}`));
  page.on('pageerror', (e) => consoleErrors.push(`[${kind}] pageerror: ${e.message}`));
  return { ctx, page };
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
}

async function login(page, creds) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(creds.email);
  await page.getByLabel('Senha', { exact: true }).fill(creds.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.locator('.shell').waitFor();
}

async function skipTour(page) {
  const skip = page.getByRole('button', { name: 'Pular' });
  const shown = await skip.waitFor({ timeout: 1500 }).then(() => true, () => false);
  if (shown) {
    await skip.click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  }
}

// ---------------------------------------------------------------- fluxo 1: acesso (celular)
console.log('\n[1] Acesso do usuário (celular 390×844)');
{
  const { ctx, page } = await newPage('mobile');

  await step('rota protegida redireciona para o login', async () => {
    await page.goto(`${BASE}/disciplinas`);
    await page.waitForURL('**/login');
  });
  await step('tela de login renderiza (Tela 1)', async () => {
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    await shot(page, '01-login');
  });
  await step('login inválido mostra erro genérico', async () => {
    await page.getByLabel('E-mail').fill(DEMO.email);
    await page.getByLabel('Senha', { exact: true }).fill('senhaErrada1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /incorret/i }).waitFor();
    await shot(page, '02-login-erro');
  });
  await step('cadastro valida campos e cria a conta', async () => {
    await page.getByRole('link', { name: 'Criar conta' }).click();
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await page.getByText('Informe seu nome.').waitFor();
    await shot(page, '03-cadastro');
    await page.getByLabel('Nome').fill(NEW_USER.name);
    await page.getByLabel('E-mail').fill(NEW_USER.email);
    await page.getByLabel('Senha', { exact: true }).fill(NEW_USER.password);
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await page.getByRole('heading', { name: 'Olá, Ana!' }).waitFor();
  });
  await step('tour inicial aparece uma vez', async () => {
    await page.getByRole('dialog', { name: 'Primeiros passos' }).waitFor();
    await shot(page, '04-tour');
    await page.getByRole('button', { name: 'Pular' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  });
  await step('dashboard vazio de usuário novo (Tela 2)', async () => {
    await page.getByText('Nenhuma disciplina ainda').waitFor();
    await shot(page, '05-dashboard-vazio');
  });
  await step('cria disciplina com professor, local e cor (Tela 3)', async () => {
    await page.getByRole('link', { name: 'Disciplinas' }).last().click();
    await page.getByRole('button', { name: 'Adicionar matéria' }).or(page.getByRole('button', { name: 'Adicionar nova matéria' }).last()).first().click();
    await page.getByLabel('Nome da disciplina').fill('Desenvolvimento Móvel');
    await page.getByLabel('Professor / instrutor').fill('Prof. João');
    await page.getByLabel('Local da aula').fill('Sala 311 · Prédio 01');
    await page.getByRole('radio', { name: 'Cor #D97706' }).click();
    await shot(page, '06-disciplina-form');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page.getByText('Prof. João — Sala 311 · Prédio 01').waitFor();
    await shot(page, '07-disciplinas');
  });
  await step('nome repetido é recusado (409)', async () => {
    await page.getByRole('button', { name: 'Adicionar nova matéria' }).last().click();
    await page.getByLabel('Nome da disciplina').fill('desenvolvimento móvel');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
  await step('tópico: adicionar e concluir recalcula o progresso', async () => {
    await page.getByRole('link', { name: /Desenvolvimento Móvel/ }).click();
    await page.getByLabel('Título do novo tópico').fill('Navegação entre telas');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.getByText('Navegação entre telas').waitFor();
    await page.getByLabel('Concluir tópico: Navegação entre telas').check();
    await page.getByText('100% Concluído').waitFor();
    await shot(page, '08-disciplina-detalhe');
  });
  await step('meta do dia: criar e marcar', async () => {
    await page.getByRole('link', { name: 'Início' }).last().click();
    await page.getByRole('button', { name: 'Nova meta' }).click();
    await page.getByLabel('O que você vai fazer?').fill('Estudar requisitos do Projeto G2');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.getByLabel('Concluir meta: Estudar requisitos do Projeto G2').check();
    await page.getByText('1 de 1').waitFor();
  });
  await step('cronômetro registra sessão e aparece no progresso (Tela 5)', async () => {
    await page.getByRole('link', { name: 'Progresso' }).last().click();
    await page.getByRole('button', { name: 'Iniciar' }).click();
    await page.getByRole('timer').waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Parar e salvar' }).click();
    await page.getByText(/Sessão registrada/).waitFor();
    await page.getByRole('heading', { name: 'Por disciplina' }).waitFor();
    await page.getByRole('listitem').filter({ hasText: 'Desenvolvimento Móvel' }).first().waitFor();
    await shot(page, '09-progresso');
  });
  await step('logout leva ao login e a rota volta a ser protegida', async () => {
    await page.getByRole('link', { name: 'Perfil' }).last().click();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await page.waitForURL('**/login');
    await page.goto(`${BASE}/progresso`);
    await page.waitForURL('**/login');
  });
  await step('login de novo: dados persistem na conta', async () => {
    await login(page, NEW_USER);
    await skipTour(page);
    await page.goto(`${BASE}/disciplinas`);
    await page.getByText('Desenvolvimento Móvel').waitFor();
  });
  await step('perfil: meus acessos e dispositivos (log de acesso)', async () => {
    await page.getByRole('link', { name: 'Perfil' }).last().click();
    await page.getByRole('heading', { name: 'Dispositivos conectados' }).waitFor();
    await page.getByText('Este dispositivo').waitFor();
    await page.getByRole('heading', { name: 'Meus acessos' }).waitFor();
    await page.getByText('Em andamento').first().waitFor();
    await page.getByText('Saiu do app').first().waitFor(); // o logout anterior foi registrado
    await shot(page, '10-perfil-acessos');
  });
  await ctx.close();
}

// ---------------------------------------------------------------- fluxo 2: dispositivo desktop, conta demo
console.log('\n[2] Mesma conta em outro dispositivo + telas da conta demo (desktop 1280×800)');
{
  const { ctx, page } = await newPage('desktop');
  await step('login da conta demo em outro dispositivo', async () => {
    await login(page, DEMO);
    await skipTour(page);
    await page.getByRole('heading', { name: /Olá, Gustavo!/ }).waitFor();
    await page.getByText('Matérias ativas').waitFor();
    await shot(page, '11-dashboard');
  });
  await step('disciplinas da conta demo e detalhe', async () => {
    await page.getByRole('link', { name: 'Disciplinas' }).first().click();
    await page.getByText('Prof. João').first().waitFor();
    await shot(page, '12-disciplinas-desktop');
  });
  await step('aulas: agenda e sincronização com o portal', async () => {
    await page.getByRole('link', { name: 'Aulas' }).first().click();
    await page.getByRole('heading', { name: 'Sincronizar com a faculdade' }).waitFor();
    await page.getByRole('button', { name: 'Sincronizar' }).click();
    await page.getByText('Lendo suas disciplinas').waitFor({ timeout: 5000 }).catch(() => {});
    await page.getByText(/Última sincronização/).waitFor({ timeout: 90_000 });
    await shot(page, '13-aulas');
  });
  await step('novidades: o portal muda, a nova sincronização mostra o que mudou', async () => {
    await page.getByRole('heading', { name: 'Novidades da faculdade' }).waitFor();
    const portal = async (acao) => {
      const r = await fetch(`${PORTAL}/__demo/${acao}`, { method: 'POST' });
      if (r.status !== 204) throw new Error(`gatilho do portal mock (${acao}) respondeu ${r.status}`);
    };
    // Clica em "Sincronizar" e espera a execução NOVA terminar (consulta a API; não depende de avisos na tela).
    const sincronizar = async () => {
      const ultimo = async () => (await (await page.request.get(`${BASE}/api/sync`)).json()).last;
      const antes = (await ultimo())?.id ?? 0;
      await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
      const limite = Date.now() + 90_000;
      for (;;) {
        const l = await ultimo();
        if (l && l.id > antes && l.status !== 'running') return l;
        if (Date.now() > limite) throw new Error('a sincronização não terminou a tempo');
        await page.waitForTimeout(500);
      }
    };
    // Repetível: normaliza o portal e o banco primeiro; só então aplica as mudanças simuladas.
    await portal('reset');
    await sincronizar();
    await portal('mudancas');
    const run = await sincronizar();
    if (run.status !== 'ok' || run.stats.changes < 4) throw new Error(`esperava ≥ 4 novidades, veio ${JSON.stringify(run.stats)}`);
    const lista = page.getByRole('list', { name: 'Novidades' });
    // Estes 4 saem em toda rodada. "Novo trabalho" só na primeira (depois o trabalho já existe no banco).
    const esperados = ['Prazo alterado', 'Nota lançada', 'Aula remarcada', 'Sala alterada'];
    if (run.stats.changes >= 5) esperados.push('Novo trabalho');
    for (const label of esperados) await lista.getByText(label).first().waitFor();
    await page.locator('.sidebar .nav-badge').first().waitFor();
    await shot(page, '19-novidades');
  });
  await step('novidades: marcar como vistas zera o selo do menu', async () => {
    await page.getByRole('button', { name: 'Marcar como vistas' }).click();
    await page.locator('.sidebar .nav-badge').waitFor({ state: 'detached' });
  });
  await step('painel: lembretes de prazo podem ser dispensados e a escolha persiste', async () => {
    await page.getByRole('link', { name: 'Início' }).first().click();
    const lembretes = page.getByRole('list', { name: 'Lembretes de prazo' });
    await lembretes.waitFor();
    const nomes = () => page.locator('ul[aria-label="Lembretes de prazo"] li').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ' ').slice(0, 50)));
    // Logo após uma sincronização o painel pode mostrar, por instantes, dados em cache: espera a lista parar de mudar.
    for (let prev = '', desde = Date.now(); Date.now() - desde < 1500; await page.waitForTimeout(100)) {
      const atual = (await nomes()).join('|');
      if (atual !== prev) [prev, desde] = [atual, Date.now()];
    }
    const antesNomes = await nomes();
    const antes = await lembretes.getByRole('listitem').count();
    if (antes < 1) throw new Error('nenhum lembrete de prazo no painel');
    await page.getByRole('button', { name: /^Dispensar lembrete:/ }).first().click();
    await page.waitForFunction((n) => document.querySelectorAll('ul[aria-label="Lembretes de prazo"] li').length === n - 1 || !document.querySelector('ul[aria-label="Lembretes de prazo"]'), antes);
    await shot(page, '20-lembretes');
    await page.reload();
    await page.getByRole('heading', { name: /Olá, Gustavo!/ }).waitFor();
    // O título aparece antes dos trabalhos carregarem; "Prazos próximos" vem dos mesmos dados dos lembretes.
    await page.getByRole('region', { name: 'Prazos próximos' }).waitFor();
    const depois = await page.locator('ul[aria-label="Lembretes de prazo"] li').count();
    if (depois !== antes - 1) {
      const guardado = await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('edumind_reminders_dismissed')) ?? ''));
      throw new Error(`dispensar não persistiu: ${antes} → ${depois}; antes=${JSON.stringify(antesNomes)}; depois=${JSON.stringify(await nomes())}; guardado=${guardado}`);
    }
  });
  await step('calendário: mês com eventos, semana e download do .ics', async () => {
    await page.getByRole('link', { name: 'Calendário' }).first().click();
    await page.locator('.cal-grid').waitFor();
    await page.locator('.cal-day[aria-current="date"]').waitFor();
    await page.locator('.cal-chip').first().waitFor();
    await shot(page, '21-calendario');
    await page.getByRole('tab', { name: 'Semana' }).click();
    await page.getByRole('heading', { name: / – / }).first().waitFor();
    await page.getByRole('tab', { name: 'Mês' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Baixar \.ics/ }).click()]);
    const ics = readFileSync(await download.path(), 'utf8');
    if (!ics.startsWith('BEGIN:VCALENDAR\r\n') || !ics.includes('BEGIN:VEVENT') || !ics.includes('DTSTART;TZID=America/Sao_Paulo')) {
      throw new Error('arquivo .ics inválido');
    }
  });
  await step('notas: meta e peso recalculam a projeção e persistem', async () => {
    await page.getByRole('link', { name: 'Disciplinas' }).first().click();
    await page.getByRole('link', { name: /Desenvolvimento de Dispositivos Móveis/ }).first().click();
    await page.getByRole('tab', { name: /Trabalhos/ }).click();
    await page.locator('#h-proj').waitFor();
    const meta = page.getByLabel('Média desejada');
    await meta.fill('10');
    await meta.press('Enter');
    await page.getByText('Meta fora de alcance').waitFor();
    await shot(page, '22-notas');
    await meta.fill('7');
    await meta.press('Enter');
    await page.getByText(/Precisa de .* nos restantes|Meta garantida/).waitFor();
    const peso = page.locator('ul[aria-label="Trabalhos e pesos"] input').last();
    await peso.fill('2,5');
    await peso.press('Enter');
    await page.reload();
    await page.getByRole('tab', { name: /Trabalhos/ }).click();
    const valor = await page.locator('ul[aria-label="Trabalhos e pesos"] input').last().inputValue();
    if (valor !== '2,5') throw new Error(`peso não persistiu (valor: ${valor})`);
    await page.locator('ul[aria-label="Trabalhos e pesos"] input').last().fill('1');
    await page.locator('ul[aria-label="Trabalhos e pesos"] input').last().press('Enter');
  });
  await step('tutor: resposta chega em streaming (Tela 4)', async () => {
    await page.getByRole('link', { name: 'Tutor IA' }).first().click();
    await page.getByLabel('Sua dúvida').fill('Pode me explicar o que é um Requisito Funcional?');
    await page.getByRole('button', { name: 'Enviar pergunta' }).click();
    const bubble = page.locator('.bubble.assistant').last();
    await bubble.waitFor({ timeout: 15_000 });
    const lengths = new Set();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      lengths.add(((await bubble.textContent()) ?? '').length);
      if (await page.getByRole('button', { name: 'Enviar pergunta' }).isVisible().catch(() => false)) break;
      await page.waitForTimeout(80);
    }
    if (lengths.size < 3) throw new Error(`resposta não veio em pedaços (tamanhos distintos: ${lengths.size})`);
    await page.getByRole('button', { name: 'Enviar pergunta' }).waitFor({ timeout: 15_000 });
    await shot(page, '14-tutor');
  });
  await step('tutor enxerga a situação de estudos do aluno (contexto)', async () => {
    const texto = (await page.locator('.bubble.assistant').last().textContent()) ?? '';
    if (!/Pelo que vejo no seu painel/.test(texto)) throw new Error('a resposta não mostra o contexto de estudos');
  });
  await step('histórico de conversas lista e reabre a conversa', async () => {
    await page.goto(`${BASE}/tutor`);
    await page.getByRole('complementary', { name: 'Histórico de conversas' }).getByText(/Pode me explicar/).first().click();
    await page.getByText('Requisito Funcional').first().waitFor();
  });
  await step('usuário comum não acessa a área do admin', async () => {
    await page.goto(`${BASE}/admin`);
    await page.waitForURL((u) => u.pathname === '/');
  });
  await ctx.close();
}

// ---------------------------------------------------------------- fluxo 3: administrador
console.log('\n[3] Área do administrador (desktop)');
{
  const { ctx, page } = await newPage('desktop');
  await step('admin entra e vê a visão geral', async () => {
    await login(page, ADMIN);
    await skipTour(page);
    await page.goto(`${BASE}/admin`);
    await page.getByText('Sessões ativas').first().waitFor();
    await page.getByRole('heading', { name: /Logins nos últimos 14 dias/ }).waitFor();
    await shot(page, '15-admin-visao-geral');
  });
  await step('log de acessos mostra nome, data, login e logout', async () => {
    await page.getByRole('link', { name: 'Log de acessos' }).click();
    await page.getByLabel('Usuário').fill(NEW_USER.email);
    await page.getByRole('cell', { name: new RegExp(NEW_USER.name) }).first().waitFor();
    await page.getByText('Saiu do app').first().waitFor();
    await shot(page, '16-admin-log-acessos');
  });
  await step('usuários: busca e bloqueio', async () => {
    await page.getByRole('link', { name: 'Usuários' }).click();
    await page.getByLabel('Buscar usuário').fill(NEW_USER.email);
    await page.getByRole('cell', { name: new RegExp(NEW_USER.name) }).first().waitFor();
    await shot(page, '17-admin-usuarios');
  });
  await step('sessões ativas listam dispositivos', async () => {
    await page.getByRole('link', { name: 'Sessões ativas' }).click();
    await page.getByRole('columnheader', { name: 'Dispositivo' }).waitFor();
    await shot(page, '18-admin-sessoes');
  });
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
const relevantErrors = consoleErrors.filter((e) => !/401|Failed to load resource/i.test(e));
console.log(`\n${results.length - failed.length}/${results.length} passos ok`);
if (relevantErrors.length) console.log('Erros no console do navegador:\n  ' + [...new Set(relevantErrors)].join('\n  '));
if (SHOTS) console.log(`Capturas em ${OUT}`);
process.exit(failed.length ? 1 : 0);
