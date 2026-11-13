/**
 * Indícios sobre a plataforma, o tipo de login e o estilo da página — lidos do HTML BRUTO
 * (com scripts) só na memória. O que sai daqui são apenas rótulos fixos, nunca trechos do HTML.
 * São palpites para orientar o adaptador, não certezas.
 */

export interface PlatformGuess {
  platform: string;
  evidence: string[];
}

export interface Traits {
  /** Provedores de login externo (SSO) detectados por endereço. */
  sso: string[];
  /** Captcha detectado. */
  captcha: string[];
  /** Textos que sugerem verificação em duas etapas. */
  mfa: string[];
  /** Frameworks de front-end (indica se o HTML já traz os dados ou se vêm por JSON). */
  frameworks: string[];
}

interface Ctx {
  html: string;
  url: string;
  title: string;
  /** HTML sem o conteúdo dos <script> (para testes de texto visível). */
  visible: string;
}

const titleOf = (html: string): string => /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
const withoutScriptBodies = (html: string): string => html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
const ctxOf = (html: string, url: string): Ctx => ({ html, url, title: titleOf(html), visible: withoutScriptBodies(html) });

type Rule = { platform: string; evidence: string; test: (c: Ctx) => boolean };
const has = (re: RegExp) => (c: Ctx) => re.test(c.html);
const inUrl = (re: RegExp) => (c: Ctx) => re.test(c.url);

const PLATFORM_RULES: Rule[] = [
  { platform: 'Moodle', evidence: 'objeto JavaScript M.cfg', test: has(/\bM\.cfg\b/) },
  { platform: 'Moodle', evidence: 'recursos /lib/javascript.php ou yui_combo.php', test: has(/lib\/javascript\.php|yui_combo\.php/) },
  { platform: 'Moodle', evidence: 'endereço /login/index.php ou /course/view.php', test: (c) => /\/login\/index\.php|\/course\/view\.php/.test(c.html + c.url) },
  { platform: 'Moodle', evidence: 'meta generator "Moodle"', test: has(/<meta[^>]+generator[^>]+moodle/i) },
  { platform: 'Canvas (Instructure)', evidence: 'referências a "instructure"', test: has(/instructure/i) },
  { platform: 'Canvas (Instructure)', evidence: 'estrutura ic-app', test: has(/\bic-app\b/) },
  { platform: 'Blackboard', evidence: 'referências a "blackboard"', test: has(/blackboard/i) },
  { platform: 'Blackboard', evidence: 'caminho /webapps/', test: (c) => /\/webapps\//.test(c.html + c.url) },
  { platform: 'Brightspace (D2L)', evidence: 'referências a "d2l"', test: has(/\bd2l\b|brightspace/i) },
  { platform: 'Sakai', evidence: 'referências a "sakai"', test: has(/sakai/i) },
  { platform: 'Google Classroom', evidence: 'domínio classroom.google.com', test: (c) => /classroom\.google\.com/.test(c.html + c.url) },
  { platform: 'SIGAA/SIPAC (família UFRN)', evidence: 'referências a sigaa/sipac/sigrh', test: has(/sigaa|sipac|sigrh/i) },
  { platform: 'Java Server Faces (portal acadêmico clássico)', evidence: 'campo javax.faces.ViewState', test: has(/javax\.faces\.ViewState/) },
  { platform: 'TOTVS (RM/Educacional)', evidence: 'referências a "totvs"', test: has(/totvs/i) },
  { platform: 'LEX', evidence: 'palavra "LEX" no título ou no endereço', test: (c) => /\blex\b/i.test(c.title) || /(^|[./-])lex([./-]|$)/i.test(new URL(c.url, 'http://x').host) },
];

export function detectPlatform(html: string, url: string): PlatformGuess[] {
  const c = ctxOf(html, url);
  const byPlatform = new Map<string, string[]>();
  for (const r of PLATFORM_RULES) {
    if (r.test(c)) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), r.evidence]);
  }
  return [...byPlatform.entries()]
    .map(([platform, evidence]) => ({ platform, evidence }))
    .sort((a, b) => b.evidence.length - a.evidence.length);
}

const SSO_RULES: [string, RegExp][] = [
  ['Microsoft (Entra ID / Office 365)', /login\.microsoftonline\.com|login\.live\.com/i],
  ['Google', /accounts\.google\.com/i],
  ['gov.br', /sso\.acesso\.gov\.br|acesso\.gov\.br/i],
  ['Okta', /okta\.com|oktapreview\.com/i],
  ['Auth0', /auth0\.com/i],
  ['Keycloak', /keycloak|\/auth\/realms\//i],
  ['Shibboleth / SAML', /shibboleth|\/idp\/|saml/i],
  ['CAS', /\/cas\/login/i],
  ['OAuth genérico', /\/oauth2?\/authorize/i],
];

const CAPTCHA_RULES: [string, RegExp][] = [
  ['reCAPTCHA', /recaptcha|g-recaptcha/i],
  ['hCaptcha', /hcaptcha|h-captcha/i],
  ['Cloudflare Turnstile', /turnstile|cf-challenge/i],
  ['captcha (genérico)', /captcha/i],
];

const MFA_RULES: [string, RegExp][] = [
  ['pede código de verificação', /c[óo]digo de verifica[çc][ãa]o/i],
  ['autenticação em dois fatores', /(autentica[çc][ãa]o|verifica[çc][ãa]o) (em|de) (dois|duas) (fatores|etapas)|\b2fa\b|two-factor/i],
  ['aplicativo autenticador / token', /aplicativo autenticador|authenticator app|token de acesso/i],
];

const FRAMEWORK_RULES: [string, RegExp][] = [
  ['Next.js', /__NEXT_DATA__/],
  ['Nuxt/Vue', /__NUXT__|data-v-[0-9a-f]{6,}|data-server-rendered/],
  ['Angular', /\bng-version=|<app-root/],
  ['React (SPA)', /<div id="root">\s*<\/div>|data-reactroot/],
  ['Vue (SPA)', /<div id="app">\s*<\/div>/],
  ['exige JavaScript para mostrar a página', /<noscript>[^<]*(enable|habilit|ative|ativar)[^<]*javascript/i],
];

export function detectTraits(html: string): Traits {
  const visible = withoutScriptBodies(html);
  const pick = (rules: [string, RegExp][], text: string) => rules.filter(([, re]) => re.test(text)).map(([label]) => label);
  // O rótulo genérico de captcha só entra se nenhum específico apareceu.
  let captcha = pick(CAPTCHA_RULES, html);
  if (captcha.length > 1) captcha = captcha.filter((c) => c !== 'captcha (genérico)');
  return {
    sso: pick(SSO_RULES, html),
    captcha,
    mfa: pick(MFA_RULES, visible),
    frameworks: pick(FRAMEWORK_RULES, html),
  };
}
