/**
 * Mascaramento de dados pessoais e segredos para o reconhecimento do portal.
 *
 * Tudo aqui é função pura (sem navegador): recebe texto/HTML e devolve o texto sem
 * e-mails, CPF, telefones com DDD, tokens, parâmetros sensíveis de URL e os termos que o
 * aluno informar (nome, matrícula…). Também devolve contagens para o relatório mostrar
 * o que foi escondido.
 *
 * Limite honesto: o que não segue um padrão conhecido (ex.: matrícula "20231234") só some
 * se o aluno passar o termo em `--mask`. Por isso o relatório sempre pede revisão manual.
 */

export type MaskCounts = Record<string, number>;

export interface Masked {
  text: string;
  counts: MaskCounts;
}

export function mergeCounts(into: MaskCounts, from: MaskCounts): MaskCounts {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  return into;
}

// ---------------------------------------------------------------------------
// Chaves sensíveis (parâmetros de URL, nomes de campos)
// ---------------------------------------------------------------------------

/** Trechos que, em qualquer lugar da chave, indicam segredo (ex.: `access_token`, `sesskey`). */
const SENSITIVE_SUBSTRINGS = [
  'token', 'sesskey', 'session', 'ticket', 'secret', 'passw', 'pwd', 'signature',
  'csrf', 'xsrf', 'nonce', 'auth', 'apikey', 'jsessionid', 'senha', 'hash',
];

/** Palavras inteiras (após separar camelCase/`_`/`-`) que indicam dado pessoal ou credencial. */
const SENSITIVE_WORDS = new Set([
  'key', 'sid', 'code', 'state', 'login', 'user', 'username', 'usuario', 'email', 'mail',
  'cpf', 'matricula', 'ra', 'aluno', 'nome', 'name', 'pass', 'password',
]);

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_SUBSTRINGS.some((s) => lower.includes(s))) return true;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((w) => SENSITIVE_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Parece um identificador opaco (sessão, hash, base64)? Exige letras E dígitos para não pegar slugs. */
export function looksLikeToken(s: string): boolean {
  return s.length >= 24 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

// ---------------------------------------------------------------------------
// Expressões
// ---------------------------------------------------------------------------

const DATA_URI = /data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g;
const JWT = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;
const PATH_SESSION = /;jsessionid=[^?#"'\s<>&]*/gi;
const QUERY_PARAM = /(\?|&amp;|&)([A-Za-z0-9_.[\]-]+)=([^&"'\s<>#]*)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const CPF = /(?<![\d.])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\d-])/g;
// Só telefones com DDD entre parênteses ou +55: "2025-2026" (ano letivo) não pode virar telefone.
const PHONE = /(?:\+55\s?)?\(\d{2}\)\s?9?\d{4}-?\d{4}|\+55\s?\d{2}\s?9?\d{4}-?\d{4}/g;
const TOKEN_CANDIDATE = /(?<![A-Za-z0-9+])[A-Za-z0-9+]{24,}(?![A-Za-z0-9+])/g;

// ---------------------------------------------------------------------------
// Termos informados pelo aluno
// ---------------------------------------------------------------------------

const ACCENTS: Record<string, string> = {
  a: 'aàáâãäå', e: 'eèéêë', i: 'iìíîï', o: 'oòóôõö', u: 'uùúûü', c: 'cç', n: 'nñ',
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex de uma palavra ignorando acentos (a flag `i` cuida das maiúsculas). */
function fuzzyWord(word: string): string {
  const base = word.normalize('NFD').replace(/\p{M}/gu, '');
  return [...base]
    .map((ch) => {
      const cls = ACCENTS[ch.toLowerCase()];
      return cls ? `[${cls}]` : escapeRegExp(ch);
    })
    .join('');
}

interface CompiledTerm {
  regex: RegExp;
  placeholder: string;
}

const MIN_TERM = 3;
const MIN_WORD_OF_TERM = 4;

/**
 * Cada termo vira uma regex (sem acento/caixa, respeitando limites de palavra). Termos com
 * várias palavras também mascaram cada palavra com ≥ 4 letras (ex.: "Maria Silva" → "Maria"
 * e "Silva" sozinhas). Mais agressivo de propósito: melhor esconder demais do que de menos.
 */
function compileTerms(terms: readonly string[]): CompiledTerm[] {
  const out: { len: number; term: CompiledTerm }[] = [];
  terms.forEach((raw, i) => {
    const term = raw.trim().replace(/\s+/g, ' ');
    if (term.length < MIN_TERM) {
      throw new Error(`Termo para mascarar muito curto: "${raw}" (mínimo ${MIN_TERM} caracteres).`);
    }
    const placeholder = `[dado-${i + 1}]`;
    const boundary = (src: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])`, 'giu');
    const words = term.split(' ');
    out.push({
      len: term.length,
      term: { regex: boundary(words.map(fuzzyWord).join('(?:\\s|&nbsp;)+')), placeholder },
    });
    if (words.length > 1) {
      for (const w of words) {
        if (w.length >= MIN_WORD_OF_TERM) out.push({ len: w.length, term: { regex: boundary(fuzzyWord(w)), placeholder } });
      }
    }
  });
  // Frases completas antes das palavras soltas, para o texto inteiro ser trocado de uma vez.
  return out.sort((a, b) => b.len - a.len).map((x) => x.term);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export type Masker = (input: string) => Masked;

/** Compila os termos uma vez e devolve a função de mascarar. Lança se algum termo for curto demais. */
export function createMasker(terms: readonly string[] = []): Masker {
  const compiled = compileTerms(terms);

  return (input: string): Masked => {
    const counts: MaskCounts = {};
    const bump = (k: string) => {
      counts[k] = (counts[k] ?? 0) + 1;
    };
    let t = input;

    t = t.replace(DATA_URI, () => (bump('imagem/arquivo embutido (data URI)'), 'data:[removido]'));
    t = t.replace(JWT, () => (bump('token (JWT)'), '[token]'));
    t = t.replace(PATH_SESSION, () => (bump('parâmetro de URL'), ';jsessionid=[oculto]'));
    t = t.replace(QUERY_PARAM, (m, sep: string, key: string, val: string) => {
      if (val === '' || val === '[oculto]' || !isSensitiveKey(key)) return m;
      bump('parâmetro de URL');
      return `${sep}${key}=[oculto]`;
    });
    t = t.replace(EMAIL, () => (bump('e-mail'), '[email]'));
    t = t.replace(CPF, () => (bump('CPF'), '[CPF]'));
    t = t.replace(PHONE, () => (bump('telefone'), '[telefone]'));
    t = t.replace(TOKEN_CANDIDATE, (m) => {
      if (!looksLikeToken(m)) return m;
      bump('identificador opaco (token/hash)');
      return '[token]';
    });
    for (const { regex, placeholder } of compiled) {
      t = t.replace(regex, () => (bump('termo informado em --mask'), placeholder));
    }
    return { text: t, counts };
  };
}

/** Atalho para um uso só (compila os termos a cada chamada). */
export function maskText(input: string, terms: readonly string[] = []): Masked {
  return createMasker(terms)(input);
}

/** Aplica o masker em todas as strings de um valor JSON (objetos, listas, textos). */
export function maskDeep<T>(value: T, masker: Masker, counts: MaskCounts): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const m = masker(v);
      mergeCounts(counts, m.counts);
      return m.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

// ---------------------------------------------------------------------------
// Rotas (para o log de rede): mantém a forma, esconde os valores
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Route {
  host: string;
  /** Caminho com ids numéricos/uuid/tokens trocados por `:id`, `:uuid`, `:token` (agrupa chamadas iguais). */
  path: string;
  /** Só os NOMES dos parâmetros de consulta, nunca os valores. */
  queryKeys: string[];
}

export function routeOf(rawUrl: string): Route {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { host: '', path: '[url inválida]', queryKeys: [] };
  }
  const path = u.pathname
    .split('/')
    .map((seg) => {
      const s = seg.split(';')[0] ?? '';
      if (s === '') return '';
      if (/^\d+$/.test(s)) return ':id';
      if (UUID.test(s)) return ':uuid';
      if (looksLikeToken(s.replace(/[^A-Za-z0-9+]/g, '')) && /^[A-Za-z0-9+_-]{24,}$/.test(s) && !s.includes('-')) return ':token';
      return s;
    })
    .join('/');
  return { host: u.host, path: path || '/', queryKeys: [...new Set([...u.searchParams.keys()])] };
}
