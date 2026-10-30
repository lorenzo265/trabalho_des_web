import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type APIRequestContext } from 'playwright-core';
import { LEX_URL, PROBE_FILE, SESSION_FILE } from './config';
import { shapeOf } from './shape';

/**
 * `npm run lex:probe` — usa a sessão do `lex:login` e faz algumas leituras (SÓ GET) em endpoints
 * candidatos do Blackboard. Imprime apenas status e ESTRUTURA dos JSONs (sem valores pessoais),
 * e grava o mesmo resumo em data/lex-probe.txt para você colar na conversa.
 */
const out: string[] = [];
const log = (line = '') => {
  out.push(line);
  console.log(line);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Result {
  ok: boolean;
  json?: unknown;
}

async function probe(api: APIRequestContext, label: string, path: string): Promise<Result> {
  await sleep(300); // pausa educada
  log(`\n## ${label}\nGET ${path.replace(/[?&]?(token|key)=[^&]*/gi, '')}`);
  let res;
  try {
    res = await api.get(`${LEX_URL}${path}`, { maxRedirects: 0, timeout: 20_000 });
  } catch (e) {
    log(`erro de rede: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return { ok: false };
  }
  const ctype = res.headers()['content-type'] ?? '';
  log(`status ${res.status()} · ${ctype.split(';')[0] || 'sem content-type'}`);
  if (res.headers().allow) log(`allow: ${res.headers().allow}`);
  if (res.status() >= 300 && res.status() < 400) log(`redireciona para: ${new URL(res.headers().location ?? '', LEX_URL).pathname}`);
  if (!res.ok() || !ctype.includes('json')) return { ok: false };
  const json: unknown = await res.json().catch(() => undefined);
  if (json === undefined) return { ok: false };
  for (const line of shapeOf(json)) log(`  ${line}`);
  return { ok: true, json };
}

const firstOf = (json: unknown, key: string): string | undefined => {
  const results = (json as { results?: Array<Record<string, unknown>> } | undefined)?.results;
  const v = results?.[0]?.[key];
  return typeof v === 'string' ? v : undefined;
};

async function main(): Promise<void> {
  if (!existsSync(SESSION_FILE)) {
    console.error('Sem sessão. Rode primeiro: npm run lex:login');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }).catch(async () =>
    chromium.launch({ headless: true, channel: 'chrome' }),
  );
  try {
    const context = await browser.newContext({ storageState: SESSION_FILE, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const api = context.request;
    log(`LEX probe · ${new Date().toISOString()} · base ${LEX_URL}`);

    const me = await probe(api, '1. Quem sou eu (valida a sessão)', '/learn/api/v1/users/me');
    if (!me.ok) {
      log('\nA sessão não funcionou (expirou ou o endpoint é outro). Rode npm run lex:login de novo e tente outra vez.');
    } else {
      const meId = (me.json as { id?: string } | undefined)?.id;
      const memberships = await probe(api, '2. Minhas disciplinas', '/learn/api/v1/users/me/memberships?expand=course&limit=200');
      // Disciplina de teste: do semestre mais recente, preferindo "Dispositivos Móveis".
      type Membership = { courseId?: string; course?: { name?: string; term?: { name?: string; startDate?: string } } };
      const all = ((memberships.json as { results?: Membership[] } | undefined)?.results ?? []).filter((m) => m.courseId);
      const latest = all.map((m) => m.course?.term?.startDate ?? '').sort().pop();
      const current = all.filter((m) => (m.course?.term?.startDate ?? '') === latest);
      log(`\n(${all.length} disciplinas no total, ${current.length} no semestre mais recente)`);
      const pick = current.find((m) => /DISPOSITIVOS/i.test(m.course?.name ?? '')) ?? current[0] ?? all[0];
      const courseId = pick?.courseId;
      const since = encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString());
      const until = encodeURIComponent(new Date(Date.now() + 120 * 86_400_000).toISOString());
      await probe(api, '3a. Calendário: prazos (interno)', `/learn/api/v1/calendars/dueDateItems?since=${since}&until=${until}&limit=50`);
      await probe(api, '3b. Calendário: lista de calendários', '/learn/api/v1/calendars');
      await probe(api, '3c. Calendário (público): prazos de notas', `/learn/api/public/v1/calendars/items?type=GradebookColumn&since=${since}&until=${until}&limit=50`);
      if (courseId) {
        const c = encodeURIComponent(courseId);
        await probe(api, '4. Calendário (público): itens da disciplina', `/learn/api/public/v1/calendars/items?type=Course&courseId=${c}&since=${since}&until=${until}&limit=50`);
        await probe(api, '5. Docentes e alunos da disciplina', `/learn/api/public/v1/courses/${c}/users?expand=user&limit=5`);
        await probe(api, '6. Trabalhos e notas (colunas) da disciplina', `/learn/api/public/v1/courses/${c}/gradebook/columns?limit=100`);
        if (meId) await probe(api, '7. Minhas notas e situação na disciplina', `/learn/api/public/v1/courses/${c}/gradebook/users/${encodeURIComponent(meId)}?limit=100`);
      } else {
        log('\n(sem courseId: pulei os testes 4 a 7)');
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  await mkdir(dirname(PROBE_FILE), { recursive: true });
  await writeFile(PROBE_FILE, `${out.join('\n')}\n`, 'utf8');
  console.log(`\nResumo gravado em ${PROBE_FILE} (só estrutura; confira antes de colar).`);
}

main().catch((err: unknown) => {
  console.error(`Falha: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
