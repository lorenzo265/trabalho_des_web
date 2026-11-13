import { describe, expect, it } from 'vitest';
import { slugify, type CaptureEntry, type PageInfo, type ReconData } from './capture';
import { aggregatePlatforms, buildReport, summarizeLogin } from './report';

const emptyInfo = (over: Partial<PageInfo> = {}): PageInfo => ({
  title: 'Entrar',
  lang: 'pt-BR',
  forms: [],
  looseFields: [],
  tables: [],
  headings: [],
  iframes: [],
  externalHosts: [],
  counts: { links: 0, forms: 0, tables: 0 },
  ...over,
});

const capture = (over: Partial<CaptureEntry> = {}): CaptureEntry => ({
  index: 1,
  label: 'login',
  frame: 0,
  file: '01-login.html',
  url: 'https://portal.edu.br/login',
  info: emptyInfo(),
  platforms: [],
  traits: { sso: [], captcha: [], mfa: [], frameworks: [] },
  truncatedAttributes: 0,
  ...over,
});

const data = (over: Partial<ReconData> = {}): ReconData => ({
  host: 'portal.edu.br',
  generatedAt: '2026-11-06T12:00:00.000Z',
  captures: [],
  network: [],
  maskCounts: {},
  maskTermsCount: 0,
  ...over,
});

const passwordForm = {
  action: '/login',
  method: 'POST',
  fields: [
    { tag: 'input', name: 'usuario', type: 'text', label: 'Matrícula', autocomplete: '', required: true },
    { tag: 'input', name: 'senha', type: 'password', label: 'Senha', autocomplete: '', required: true },
  ],
  buttons: ['Entrar'],
};

describe('buildReport', () => {
  it('sem capturas, orienta a capturar com "c"', () => {
    expect(buildReport(data())).toContain('Nenhuma página foi capturada');
  });

  it('login por formulário próprio: lista campos e botões', () => {
    const md = buildReport(data({ captures: [capture({ info: emptyInfo({ forms: [passwordForm], counts: { links: 0, forms: 1, tables: 0 } }) })] }));
    expect(md).toContain('formulário próprio de usuário e senha');
    expect(md).toContain('Formulário em `01-login.html` — `POST /login`');
    expect(md).toContain('`usuario` · text · rótulo "Matrícula" · obrigatório');
    expect(md).toContain('`senha` · password');
    expect(md).toContain('botões: "Entrar"');
  });

  it('SSO sem campo de senha: recomenda olhar o provedor; captcha e MFA viram alerta de login assistido', () => {
    const md = buildReport(
      data({
        captures: [
          capture({ traits: { sso: ['Microsoft (Entra ID / Office 365)'], captcha: ['reCAPTCHA'], mfa: ['pede código de verificação'], frameworks: [] } }),
        ],
      }),
    );
    expect(md).toContain('login por provedor externo (SSO): Microsoft');
    expect(md).toContain('Captcha detectado (reCAPTCHA)');
    expect(md).toContain('verificação em duas etapas');
    expect(md.match(/login assistido/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('formulário e SSO juntos pedem confirmação', () => {
    const md = buildReport(data({ captures: [capture({ info: emptyInfo({ forms: [passwordForm] }), traits: { sso: ['Google'], captcha: [], mfa: [], frameworks: [] } })] }));
    expect(md).toContain('formulário próprio **e** referência a SSO (Google)');
  });

  it('senha fora de <form> (SPA) é apontada', () => {
    const f = passwordForm.fields[1]!;
    const md = buildReport(data({ captures: [capture({ info: emptyInfo({ looseFields: [f] }) })] }));
    expect(md).toContain('fora de um `<form>`');
  });

  it('sem nenhum campo de senha, pede para capturar a tela de login', () => {
    expect(buildReport(data({ captures: [capture()] }))).toContain('Capture também a tela de login');
  });

  it('plataforma reconhecida e SPA com JSON interno', () => {
    const md = buildReport(
      data({
        captures: [capture({ platforms: [{ platform: 'Moodle', evidence: ['objeto JavaScript M.cfg', 'meta generator "Moodle"'] }], traits: { sso: [], captcha: [], mfa: [], frameworks: ['React (SPA)'] } })],
        network: [
          { method: 'GET', type: 'fetch', status: 200, host: 'portal.edu.br', path: '/api/disciplinas', queryKeys: ['periodo'], contentType: 'application/json', count: 3, shape: { items: ['string'] } },
          { method: 'POST', type: 'document', status: 302, host: 'portal.edu.br', path: '/login', queryKeys: [], contentType: 'text/html', count: 1, redirectTo: 'portal.edu.br/inicio' },
        ],
      }),
    );
    expect(md).toContain('Moodle (2 indícios');
    expect(md).toContain('React (SPA)');
    expect(md).toContain('Os dados provavelmente vêm por JSON');
    expect(md).toContain('**1 devolvem JSON**');
    expect(md).toContain('| GET | 200 | fetch | `portal.edu.br/api/disciplinas` | periodo | 3 | JSON |');
    expect(md).toContain('redireciona para portal.edu.br/inicio');
  });

  it('mostra o que foi mascarado e avisa quando --mask não foi usado', () => {
    const md = buildReport(data({ captures: [capture()], maskCounts: { 'e-mail': 3, CPF: 1 } }));
    expect(md).toContain('- e-mail: 3');
    expect(md).toContain('- CPF: 1');
    expect(md).toContain('Você não usou `--mask`');
    expect(buildReport(data({ captures: [capture()], maskTermsCount: 2 }))).not.toContain('Você não usou `--mask`');
  });

  it('não quebra a tabela com "|" ou quebra de linha no título', () => {
    const md = buildReport(data({ captures: [capture({ info: emptyInfo({ title: 'A | B\nC' }) })] }));
    expect(md).toContain('A \\| B C');
  });
});

describe('summarizeLogin / aggregatePlatforms', () => {
  it('une indícios da mesma plataforma entre páginas, sem repetir', () => {
    const a = capture({ platforms: [{ platform: 'Moodle', evidence: ['x', 'y'] }] });
    const b = capture({ platforms: [{ platform: 'Moodle', evidence: ['y', 'z'] }, { platform: 'Sakai', evidence: ['s'] }] });
    expect(aggregatePlatforms([a, b])).toEqual([
      { platform: 'Moodle', evidence: ['x', 'y', 'z'] },
      { platform: 'Sakai', evidence: ['s'] },
    ]);
  });

  it('SSO repetido em várias páginas aparece uma vez', () => {
    const t = { sso: ['Google'], captcha: [], mfa: [], frameworks: [] };
    expect(summarizeLogin([capture({ traits: t }), capture({ traits: t })]).sso).toEqual(['Google']);
  });
});

describe('slugify', () => {
  it.each([
    ['Minhas Disciplinas', 'minhas-disciplinas'],
    ['Disciplina: Cálculo I (2025/1)', 'disciplina-calculo-i-2025-1'],
    ['  ', 'pagina'],
    ['', 'pagina'],
    ['../../etc/passwd', 'etc-passwd'],
  ])('%j → %j', (input, expected) => expect(slugify(input)).toBe(expected));

  it('limita o tamanho do nome do arquivo', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(40);
  });
});
