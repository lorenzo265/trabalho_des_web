import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Frame, Page, Response } from 'playwright-core';
import { createMasker, maskDeep, mergeCounts, routeOf, type MaskCounts } from './mask';
import { detectPlatform, detectTraits, type PlatformGuess, type Traits } from './platform';
import { buildReport } from './report';
import { jsonShape, type Shape } from './shape';

/**
 * Sessão de reconhecimento: o aluno navega e loga SOZINHO num navegador visível; este módulo só
 * OBSERVA. Não digita nada, não guarda cookies/storage/cabeçalhos/corpo de requisições, não grava
 * HAR nem trace. De cada página capturada sai um HTML limpo (sem scripts, sem valores de campos,
 * com dados pessoais mascarados) e um resumo estrutural.
 */

// ---------------------------------------------------------------------------
// Script executado DENTRO da página. É uma string de propósito: assim o transpilador (tsx/esbuild)
// não injeta helpers que não existem no navegador. Sem crases nem `${` aqui dentro.
// ---------------------------------------------------------------------------
export const PAGE_SCRIPT = String.raw`(() => {
  const SENSITIVE_NAME = /token|sesskey|session|ticket|secret|passw|pwd|csrf|xsrf|nonce|auth|senha|cpf|matricula/i;
  const short = (s, n) => {
    const t = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  const hostOf = (u) => { try { return new URL(u, location.href).host; } catch (e) { return ''; } };
  const pathOf = (u) => { try { return new URL(u, location.href).pathname; } catch (e) { return ''; } };

  // ---------- 1. Resumo estrutural (lido do documento vivo) ----------
  const isField = (el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(submit|button|reset|image)$/i.test(el.getAttribute('type') || '');
  const fieldOf = (el) => {
    const labelEl = el.labels && el.labels[0] ? el.labels[0].textContent : '';
    return {
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('name') || el.id || '',
      type: (el.getAttribute('type') || (el.tagName === 'INPUT' ? 'text' : '')).toLowerCase(),
      label: short(labelEl || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '', 60),
      autocomplete: el.getAttribute('autocomplete') || '',
      required: el.required === true,
    };
  };
  const forms = Array.from(document.forms).slice(0, 15).map((f) => ({
    action: pathOf(f.getAttribute('action') || location.href),
    method: (f.getAttribute('method') || 'get').toUpperCase(),
    fields: Array.from(f.elements).filter(isField).slice(0, 40).map(fieldOf),
    buttons: Array.from(f.querySelectorAll('button, input[type=submit]')).map((b) => short(b.textContent || b.value, 40)).filter(Boolean).slice(0, 4),
  }));
  const looseFields = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => !el.form && isField(el)).slice(0, 30).map(fieldOf);
  const tables = Array.from(document.querySelectorAll('table')).slice(0, 12).map((t) => {
    const firstRow = t.querySelector('tbody tr') || t.querySelector('tr');
    return {
      selector: t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + Array.from(t.classList).slice(0, 3).map((c) => '.' + c).join(''),
      headers: Array.from(t.querySelectorAll('th')).slice(0, 12).map((h) => short(h.textContent, 40)),
      rows: t.querySelectorAll('tbody tr').length || t.querySelectorAll('tr').length,
      firstRowId: firstRow && firstRow.id ? firstRow.id : '',
    };
  });
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 15).map((h) => short(h.textContent, 80)).filter(Boolean);
  const hosts = {};
  document.querySelectorAll('a[href], form[action], iframe[src], script[src], link[href]').forEach((el) => {
    const h = hostOf(el.getAttribute('href') || el.getAttribute('action') || el.getAttribute('src') || '');
    if (h && h !== location.host) hosts[h] = true;
  });
  const info = {
    title: short(document.title, 120),
    lang: document.documentElement.lang || '',
    forms,
    looseFields,
    tables,
    headings,
    iframes: Array.from(document.querySelectorAll('iframe')).map((i) => hostOf(i.getAttribute('src') || '')).filter(Boolean).slice(0, 10),
    externalHosts: Object.keys(hosts).slice(0, 25),
    counts: {
      links: document.querySelectorAll('a[href]').length,
      forms: document.forms.length,
      tables: document.querySelectorAll('table').length,
    },
  };

  // ---------- 2. HTML limpo (trabalha numa cópia; a página do aluno não é alterada) ----------
  const root = document.documentElement.cloneNode(true);
  root.querySelectorAll('script, style, noscript, template, link[rel~="stylesheet"], link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"]').forEach((n) => n.remove());
  root.querySelectorAll('svg').forEach((s) => { while (s.firstChild) s.removeChild(s.firstChild); });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());

  let truncated = 0;
  root.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      if ((a.name.startsWith('on') && a.name in el) || /^(nonce|integrity|crossorigin)$/i.test(a.name)) {
        el.removeAttribute(a.name);
      } else if (a.value.length > 300) {
        el.setAttribute(a.name, a.value.slice(0, 80) + '…[truncado]');
        truncated++;
      }
    });
  });
  root.querySelectorAll('input').forEach((i) => {
    const type = (i.getAttribute('type') || 'text').toLowerCase();
    if (/^(submit|button|reset|image|checkbox|radio)$/.test(type)) return;
    if (type === 'hidden') {
      if (SENSITIVE_NAME.test((i.getAttribute('name') || '') + ' ' + i.id)) i.setAttribute('value', '[oculto]');
    } else if (i.hasAttribute('value')) {
      i.setAttribute('value', '[valor]');
    }
  });
  root.querySelectorAll('textarea').forEach((t) => { if (t.textContent) t.textContent = '[texto]'; });
  root.querySelectorAll('meta[name]').forEach((m) => {
    if (SENSITIVE_NAME.test(m.getAttribute('name') || '')) m.setAttribute('content', '[oculto]');
  });

  return { html: '<!DOCTYPE html>\n' + root.outerHTML, truncated, info };
})()`;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface FieldInfo {
  tag: string;
  name: string;
  type: string;
  label: string;
  autocomplete: string;
  required: boolean;
}
export interface FormInfo {
  action: string;
  method: string;
  fields: FieldInfo[];
  buttons: string[];
}
export interface TableInfo {
  selector: string;
  headers: string[];
  rows: number;
  firstRowId: string;
}
export interface PageInfo {
  title: string;
  lang: string;
  forms: FormInfo[];
  looseFields: FieldInfo[];
  tables: TableInfo[];
  headings: string[];
  iframes: string[];
  externalHosts: string[];
  counts: { links: number; forms: number; tables: number };
}

export interface CaptureEntry {
  /** Número da página capturada (os iframes dela usam o mesmo número). */
  index: number;
  label: string;
  /** 0 = página principal; 1+ = iframes. */
  frame: number;
  file: string;
  /** URL já mascarada. */
  url: string;
  info: PageInfo;
  platforms: PlatformGuess[];
  traits: Traits;
  truncatedAttributes: number;
}

export interface NetworkEntry {
  method: string;
  type: string;
  status: number;
  host: string;
  path: string;
  queryKeys: string[];
  contentType: string;
  count: number;
  /** Para redirecionamentos (3xx): destino (host + caminho). */
  redirectTo?: string;
  /** Forma do JSON (só chaves e tipos). */
  shape?: Shape;
}

export interface ReconData {
  host: string;
  generatedAt: string;
  captures: CaptureEntry[];
  network: NetworkEntry[];
  maskCounts: MaskCounts;
  maskTermsCount: number;
}

export interface ReconOptions {
  outDir: string;
  /** Termos a esconder (nome, matrícula…). Ver `mask.ts`. */
  maskTerms?: readonly string[];
  now?: () => Date;
}

export interface ReconSession {
  readonly dir: string;
  readonly captures: readonly CaptureEntry[];
  capture(page: Page, label?: string): Promise<CaptureEntry[]>;
  finish(): Promise<{ dir: string; reportFile: string }>;
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

const MAX_NETWORK_ENTRIES = 300;
const MAX_JSON_BYTES = 2_000_000;
const MAX_FRAMES = 6;

export function slugify(label: string): string {
  const s = label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'pagina';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function lastPathSegment(url: string): string {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return '';
  }
}

interface PageResult {
  html: string;
  truncated: number;
  info: PageInfo;
}

export async function createReconSession(context: BrowserContext, opts: ReconOptions): Promise<ReconSession> {
  const masker = createMasker(opts.maskTerms ?? []);
  const now = opts.now ?? (() => new Date());
  const counts: MaskCounts = {};
  const captures: CaptureEntry[] = [];
  const network = new Map<string, NetworkEntry>();
  const pending = new Set<Promise<void>>();
  let hostSeen = '';
  let pageCounter = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let finished: Promise<{ dir: string; reportFile: string }> | undefined;

  await mkdir(opts.outDir, { recursive: true });

  const mask = (s: string): string => {
    const m = masker(s);
    mergeCounts(counts, m.counts);
    return m.text;
  };

  // --- Rede (passivo: só método, status, rota e a FORMA do JSON; nunca cabeçalhos, cookies ou corpos de envio) ---
  const handleResponse = async (resp: Response): Promise<void> => {
    const req = resp.request();
    const type = req.resourceType();
    if (type !== 'document' && type !== 'xhr' && type !== 'fetch') return;

    const route = routeOf(resp.url());
    const path = mask(route.path);
    const status = resp.status();
    const key = `${req.method()} ${type} ${route.host}${path} ${status}`;
    const existing = network.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    if (network.size >= MAX_NETWORK_ENTRIES) return;

    const headers = resp.headers();
    const entry: NetworkEntry = {
      method: req.method(),
      type,
      status,
      host: route.host,
      path,
      queryKeys: route.queryKeys,
      contentType: (headers['content-type'] ?? '').split(';')[0]?.trim() ?? '',
      count: 1,
    };
    network.set(key, entry);

    if (status >= 300 && status < 400 && headers['location']) {
      const target = routeOf(new URL(headers['location'], resp.url()).toString());
      entry.redirectTo = `${target.host}${mask(target.path)}`;
    }
    if (type !== 'document' && status < 300 && entry.contentType.includes('json')) {
      if (Number(headers['content-length'] ?? 0) <= MAX_JSON_BYTES) {
        try {
          entry.shape = jsonShape(await resp.json(), (k) => mask(k));
        } catch {
          // corpo vazio ou não-JSON: fica sem forma
        }
      }
    }
  };
  const onResponse = (resp: Response): void => {
    const p = handleResponse(resp).catch(() => undefined);
    pending.add(p);
    void p.finally(() => pending.delete(p));
  };
  context.on('response', onResponse);

  // --- Captura ---
  async function captureFrame(frame: Frame, label: string, index: number, frameNo: number): Promise<CaptureEntry> {
    const raw = await frame.content();
    const result = (await frame.evaluate(PAGE_SCRIPT)) as PageResult;
    const file = `${pad2(index)}-${slugify(label)}${frameNo ? `.frame${frameNo}` : ''}.html`;

    const url = mask(frame.url());
    const html = mask(result.html);
    const info = maskDeep(result.info, masker, counts);
    const header = `<!-- recon EduMind · ${url} · capturado em ${now().toISOString()} · dados pessoais mascarados; REVISE antes de compartilhar -->`;
    const [doctype, ...rest] = html.split('\n');
    await writeFile(join(opts.outDir, file), [doctype, header, ...rest].join('\n'), 'utf8');

    if (!hostSeen && frameNo === 0) hostSeen = routeOf(frame.url()).host;
    const entry: CaptureEntry = {
      index,
      label,
      frame: frameNo,
      file,
      url,
      info,
      platforms: detectPlatform(raw, frame.url()),
      traits: detectTraits(raw),
      truncatedAttributes: result.truncated,
    };
    captures.push(entry);
    return entry;
  }

  async function captureNow(page: Page, label?: string): Promise<CaptureEntry[]> {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => undefined);

    const main = page.mainFrame();
    const fallback = slugify(lastPathSegment(main.url()));
    const name = label?.trim() || fallback;

    const index = ++pageCounter;
    const out: CaptureEntry[] = [];
    try {
      out.push(await captureFrame(main, name, index, 0));
    } catch (err) {
      throw new Error(
        `Não consegui ler a página (ela estava mudando?). Espere carregar e tente de novo. Detalhe: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const children = page.frames().filter((f) => f !== main && f.url() && f.url() !== 'about:blank').slice(0, MAX_FRAMES - 1);
    for (const [i, frame] of children.entries()) {
      try {
        out.push(await captureFrame(frame, name, index, i + 1));
      } catch {
        // iframe que sumiu durante a captura: ignora
      }
    }
    return out;
  }

  return {
    dir: opts.outDir,
    captures,

    capture(page, label) {
      const run = queue.then(() => captureNow(page, label));
      queue = run.catch(() => undefined);
      return run;
    },

    finish() {
      finished ??= (async () => {
        await queue.catch(() => undefined);
        context.off('response', onResponse);
        await Promise.allSettled([...pending]);

        const data: ReconData = {
          host: hostSeen,
          generatedAt: now().toISOString(),
          captures,
          network: [...network.values()],
          maskCounts: counts,
          maskTermsCount: opts.maskTerms?.length ?? 0,
        };
        const reportFile = join(opts.outDir, 'relatorio.md');
        await writeFile(join(opts.outDir, 'rede.json'), JSON.stringify(data.network, null, 2), 'utf8');
        await writeFile(join(opts.outDir, 'recon.json'), JSON.stringify(data, null, 2), 'utf8');
        await writeFile(reportFile, buildReport(data), 'utf8');
        return { dir: opts.outDir, reportFile };
      })();
      return finished;
    },
  };
}
