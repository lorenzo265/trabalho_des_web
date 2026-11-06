import type { CaptureEntry, FieldInfo, FormInfo, NetworkEntry, ReconData } from './capture';

/** Monta o `relatorio.md` do reconhecimento. Função pura: recebe os dados já mascarados. */

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '—';
const code = (s: string): string => (s ? `\`${s.replace(/`/g, "'")}\`` : '—');
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

export interface LoginSummary {
  passwordForms: { capture: CaptureEntry; form: FormInfo }[];
  loosePasswordPages: CaptureEntry[];
  sso: string[];
  captcha: string[];
  mfa: string[];
}

export function summarizeLogin(captures: readonly CaptureEntry[]): LoginSummary {
  return {
    passwordForms: captures.flatMap((capture) =>
      capture.info.forms.filter((form) => form.fields.some((f) => f.type === 'password')).map((form) => ({ capture, form })),
    ),
    loosePasswordPages: captures.filter((c) => c.info.looseFields.some((f) => f.type === 'password')),
    sso: uniq(captures.flatMap((c) => c.traits.sso)),
    captcha: uniq(captures.flatMap((c) => c.traits.captcha)),
    mfa: uniq(captures.flatMap((c) => c.traits.mfa)),
  };
}

export function aggregatePlatforms(captures: readonly CaptureEntry[]): { platform: string; evidence: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const c of captures) {
    for (const p of c.platforms) {
      const set = map.get(p.platform) ?? new Set<string>();
      p.evidence.forEach((e) => set.add(e));
      map.set(p.platform, set);
    }
  }
  return [...map.entries()]
    .map(([platform, ev]) => ({ platform, evidence: [...ev] }))
    .sort((a, b) => b.evidence.length - a.evidence.length);
}

const fieldLine = (f: FieldInfo): string =>
  `${code(f.name || '(sem name)')} · ${f.tag === 'input' ? f.type || 'text' : f.tag}${f.label ? ` · rótulo "${f.label}"` : ''}${f.required ? ' · obrigatório' : ''}`;

function loginSection(login: LoginSummary): string[] {
  const out: string[] = ['## Login', ''];
  const hasPassword = login.passwordForms.length > 0 || login.loosePasswordPages.length > 0;

  if (hasPassword && login.sso.length === 0) {
    out.push('- **Provável:** formulário próprio de usuário e senha.');
  } else if (!hasPassword && login.sso.length > 0) {
    out.push(`- **Provável:** login por provedor externo (SSO): ${login.sso.join(', ')}.`);
  } else if (hasPassword) {
    out.push(`- **Provável:** formulário próprio **e** referência a SSO (${login.sso.join(', ')}). Confirme qual é o caminho do dia a dia.`);
  } else {
    out.push('- Nenhum campo de senha nas páginas capturadas. Capture também a tela de login (antes de entrar).');
  }
  if (login.captcha.length) out.push(`- ⚠️ Captcha detectado (${login.captcha.join(', ')}): não automatizamos captcha; o caminho é o **login assistido**.`);
  if (login.mfa.length) out.push(`- ⚠️ Indício de verificação em duas etapas (${login.mfa.join('; ')}): o caminho é o **login assistido**.`);
  out.push('');

  for (const { capture, form } of login.passwordForms) {
    out.push(`Formulário em \`${capture.file}\` — \`${form.method} ${form.action}\``, '');
    form.fields.forEach((f) => out.push(`- ${fieldLine(f)}`));
    if (form.buttons.length) out.push(`- botões: ${form.buttons.map((b) => `"${b}"`).join(', ')}`);
    out.push('');
  }
  for (const c of login.loosePasswordPages) {
    out.push(`Campos de senha **fora de um \`<form>\`** em \`${c.file}\` (página montada por JavaScript):`, '');
    c.info.looseFields.forEach((f) => out.push(`- ${fieldLine(f)}`));
    out.push('');
  }
  return out;
}

function captureSection(c: CaptureEntry): string[] {
  const out = [`### ${String(c.index).padStart(2, '0')} · ${c.label}${c.frame ? ` (iframe ${c.frame})` : ''}`, ''];
  out.push(`- Arquivo: \`${c.file}\``, `- Endereço: ${code(c.url)}`, `- Título: ${cell(c.info.title)}`);
  if (c.info.headings.length) out.push(`- Títulos na página: ${c.info.headings.map((h) => `"${h}"`).join(' · ')}`);
  out.push(`- Links: ${c.info.counts.links} · formulários: ${c.info.counts.forms} · tabelas: ${c.info.counts.tables}`);
  if (c.info.iframes.length) out.push(`- ⚠️ Contém iframes (${c.info.iframes.join(', ')}): o conteúdo deles foi salvo em arquivos \`.frameN.html\`.`);
  if (c.info.externalHosts.length) out.push(`- Endereços externos referenciados: ${c.info.externalHosts.join(', ')}`);
  if (c.truncatedAttributes) out.push(`- ${c.truncatedAttributes} atributo(s) muito longo(s) foram truncados.`);
  for (const t of c.info.tables) {
    out.push(
      `- Tabela ${code(t.selector)} — ${t.rows} linha(s); cabeçalhos: ${t.headers.length ? t.headers.map((h) => `"${h}"`).join(', ') : '(sem <th>)'}${
        t.firstRowId ? `; \`id\` da 1ª linha: ${code(t.firstRowId)}` : ''
      }`,
    );
  }
  for (const f of c.info.forms) out.push(`- Formulário \`${f.method} ${f.action}\` com ${f.fields.length} campo(s)`);
  out.push('');
  return out;
}

function networkSection(network: readonly NetworkEntry[]): string[] {
  const out = ['## Rede (apenas rotas e formato; sem cookies, cabeçalhos nem corpos de envio)', ''];
  if (network.length === 0) return [...out, 'Nada registrado.', ''];

  const json = network.filter((n) => n.shape !== undefined);
  const xhr = network.filter((n) => n.type !== 'document');
  out.push(
    `- ${network.length} rota(s) distinta(s): ${network.length - xhr.length} navegação(ões) e ${xhr.length} chamada(s) XHR/fetch, das quais **${json.length} devolvem JSON** (formato completo em \`rede.json\`).`,
  );
  if (json.length > 0) {
    out.push('- Há JSON interno: o adaptador pode ler esses endpoints em vez do HTML (nível 2 da ADR-002), o que é mais estável.');
  }
  out.push('', '| Método | Status | Tipo | Rota | Parâmetros | Vezes | Observação |', '|---|---|---|---|---|---|---|');
  for (const n of network) {
    const note = n.redirectTo ? `redireciona para ${n.redirectTo}` : n.shape !== undefined ? 'JSON' : n.contentType;
    out.push(
      `| ${n.method} | ${n.status} | ${n.type} | ${code(`${n.host}${n.path}`)} | ${n.queryKeys.length ? n.queryKeys.join(', ') : '—'} | ${n.count} | ${cell(note)} |`,
    );
  }
  out.push('');
  return out;
}

export function buildReport(data: ReconData): string {
  const { captures } = data;
  const platforms = aggregatePlatforms(captures);
  const login = summarizeLogin(captures);
  const frameworks = uniq(captures.flatMap((c) => c.traits.frameworks));
  const hasJson = data.network.some((n) => n.shape !== undefined);
  const out: string[] = [`# Relatório de reconhecimento — ${data.host || 'portal'}`, ''];

  out.push(
    `> Gerado em ${data.generatedAt} pelo \`npm run recon\`. Dados pessoais e segredos foram mascarados automaticamente, **mas a máscara não é perfeita**. Leia a seção "Antes de compartilhar" no fim.`,
    '',
    '## Resumo',
    '',
  );

  if (captures.length === 0) {
    out.push('- Nenhuma página foi capturada. Rode de novo e use `c` para capturar cada página.', '');
  } else {
    out.push(
      platforms.length
        ? `- **Plataforma (indícios):** ${platforms.map((p) => `${p.platform} (${p.evidence.length} indício${p.evidence.length > 1 ? 's' : ''}: ${p.evidence.join('; ')})`).join(' | ')}`
        : '- **Plataforma:** nenhuma plataforma conhecida foi reconhecida (portal próprio ou plataforma que ainda não listamos). Diga o nome que aparece no rodapé ou na tela de login.',
    );
    out.push(
      frameworks.length
        ? `- **Tipo de página:** ${frameworks.join(', ')}. ${hasJson ? 'Os dados provavelmente vêm por JSON (veja a seção Rede).' : 'Se as tabelas vierem vazias no HTML salvo, os dados são carregados depois por JSON.'}`
        : '- **Tipo de página:** HTML renderizado no servidor (sem sinais de SPA).',
    );
    out.push(`- **Páginas capturadas:** ${captures.filter((c) => c.frame === 0).length} (mais ${captures.filter((c) => c.frame > 0).length} iframe(s))`);
    out.push(`- **JSON interno:** ${hasJson ? `${data.network.filter((n) => n.shape !== undefined).length} endpoint(s)` : 'nenhum encontrado'}`, '');
    out.push(...loginSection(login));
    out.push('## Páginas capturadas', '', '| # | Rótulo | Endereço | Título | Tabelas | Formulários |', '|---|---|---|---|---|---|');
    for (const c of captures) {
      out.push(`| ${c.index} | ${cell(c.label)}${c.frame ? ` (iframe ${c.frame})` : ''} | ${code(c.url)} | ${cell(c.info.title)} | ${c.info.counts.tables} | ${c.info.counts.forms} |`);
    }
    out.push('');
    captures.forEach((c) => out.push(...captureSection(c)));
  }

  out.push(...networkSection(data.network));

  out.push('## Dados escondidos nos arquivos', '');
  const entries = Object.entries(data.maskCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) out.push('Nenhum padrão conhecido foi encontrado.');
  else entries.forEach(([k, v]) => out.push(`- ${k}: ${v}`));
  out.push('');
  if (data.maskTermsCount === 0) {
    out.push(
      '⚠️ Você não usou `--mask`. Seu **nome** e sua **matrícula** só somem se estiverem em um padrão conhecido (e-mail, CPF). Rode de novo com `--mask "Seu Nome" --mask 20231234`, ou procure por eles à mão.',
      '',
    );
  }

  out.push(
    '## Antes de compartilhar',
    '',
    '1. Abra os `.html` num editor e procure (Ctrl+F) por: seu **nome**, **matrícula/RA**, **e-mail**, **telefone**, **CPF**, nomes de colegas e **notas/faltas** que você não queira expor.',
    '2. Troque o que sobrar por algo genérico (ex.: `Fulano`, `20230000`). Pode editar à vontade: a estrutura é o que importa.',
    '3. Não envie cookies, HAR, trace nem capturas de tela com seus dados. Esta pasta não tem nada disso.',
    '4. A pasta fica em `data/`, que o Git ignora. Para me mandar, copie só os arquivos revisados.',
    '',
  );
  return out.join('\n');
}
