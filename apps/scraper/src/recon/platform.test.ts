import { describe, expect, it } from 'vitest';
import { detectPlatform, detectTraits } from './platform';

describe('detectPlatform', () => {
  it('reconhece o Moodle por vários indícios e ordena pelo mais provável', () => {
    const html = `<html><head><title>Entrar</title><script src="/lib/javascript.php/1/x.js"></script>
      <script>var M = {}; M.cfg = {wwwroot:"https://ead.faculdade.edu.br"};</script></head>
      <body><a href="/course/view.php?id=2">Cálculo</a></body></html>`;
    const [first] = detectPlatform(html, 'https://ead.faculdade.edu.br/login/index.php');
    expect(first?.platform).toBe('Moodle');
    expect(first?.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it('não acusa nenhuma plataforma conhecida no portal mock', () => {
    expect(detectPlatform('<html><title>Entrar — Portal Acadêmico</title><body>oi</body></html>', 'http://localhost:4010/login')).toEqual([]);
  });

  it('LEX só conta no título ou no domínio, não em qualquer texto', () => {
    expect(detectPlatform('<title>LEX — Acesso</title>', 'https://x.edu.br/')[0]?.platform).toBe('LEX');
    expect(detectPlatform('<title>Início</title><p>flexível</p>', 'https://lex.faculdade.edu.br/')[0]?.platform).toBe('LEX');
    expect(detectPlatform('<title>Início</title><p>lex</p>', 'https://x.edu.br/')).toEqual([]);
  });

  it('devolve só rótulos fixos, nunca trechos do HTML', () => {
    const out = JSON.stringify(detectPlatform('<script>M.cfg={sesskey:"SEGREDO123"}</script>', 'https://x/'));
    expect(out).not.toContain('SEGREDO123');
  });
});

describe('detectTraits', () => {
  it('detecta SSO, captcha e pedido de segundo fator', () => {
    const html = `<a href="https://login.microsoftonline.com/common/oauth2/authorize?x=1">Entrar com Microsoft</a>
      <div class="g-recaptcha" data-sitekey="k"></div><p>Digite o código de verificação enviado por e-mail</p>`;
    expect(detectTraits(html)).toMatchObject({
      sso: ['Microsoft (Entra ID / Office 365)', 'OAuth genérico'],
      captcha: ['reCAPTCHA'],
      mfa: ['pede código de verificação'],
    });
  });

  it('texto de MFA dentro de <script> não conta como indício', () => {
    expect(detectTraits('<script>const msg="autenticação em dois fatores"</script>').mfa).toEqual([]);
  });

  it('login simples não acusa nada', () => {
    expect(detectTraits('<form><input type="password"></form>')).toEqual({ sso: [], captcha: [], mfa: [], frameworks: [] });
  });

  it('identifica SPA que renderiza no navegador', () => {
    expect(detectTraits('<body><div id="root"></div></body>').frameworks).toContain('React (SPA)');
    expect(detectTraits('<script id="__NEXT_DATA__"></script>').frameworks).toContain('Next.js');
  });
});
