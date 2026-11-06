import { describe, expect, it } from 'vitest';
import { createMasker, isSensitiveKey, looksLikeToken, maskDeep, maskText, routeOf } from './mask';

describe('maskText — padrões automáticos', () => {
  it('mascara e-mail, CPF e telefone com DDD, e conta cada um', () => {
    const { text, counts } = maskText(
      'Contato: maria.silva@faculdade.edu.br · CPF 123.456.789-09 · (11) 91234-5678 · +55 21 98888-7777',
    );
    expect(text).toBe('Contato: [email] · CPF [CPF] · [telefone] · [telefone]');
    expect(counts).toMatchObject({ 'e-mail': 1, CPF: 1, telefone: 2 });
  });

  it('não confunde ano letivo, datas e horários com telefone ou CPF', () => {
    const input = 'Período 2025-2026 · 23/10/2025 · 19:00 - 20:30 · turma 1234-5678';
    expect(maskText(input).text).toBe(input);
  });

  it('remove imagens embutidas (data URI) e JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
    const { text, counts } = maskText(`<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"> Bearer ${jwt}`);
    expect(text).not.toContain('iVBORw0KGgo');
    expect(text).not.toContain('eyJhbGci');
    expect(text).toContain('data:[removido]');
    expect(counts['token (JWT)']).toBe(1);
  });

  it('esconde só os parâmetros sensíveis da URL e mantém os ids úteis', () => {
    const html =
      '<a href="/course/view.php?id=42&amp;sesskey=Zx81aQ9&amp;lang=pt">x</a> <a href="/api?token=abc123&user_id=7&page=2">y</a>';
    const { text } = maskText(html);
    expect(text).toContain('id=42');
    expect(text).toContain('lang=pt');
    expect(text).toContain('page=2');
    expect(text).toContain('sesskey=[oculto]');
    expect(text).toContain('token=[oculto]');
    expect(text).toContain('user_id=[oculto]');
    expect(text).not.toContain('Zx81aQ9');
    expect(text).not.toContain('abc123');
  });

  it('esconde jsessionid no caminho', () => {
    expect(maskText('/portal/aluno;jsessionid=ABCDEF0123456789?x=1').text).toBe('/portal/aluno;jsessionid=[oculto]?x=1');
  });

  it('esconde identificadores opacos, mas preserva slugs e caminhos', () => {
    const { text } = maskText('sid a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 · /disciplinas/12345/aulas · introducao-a-engenharia-de-software-2025');
    expect(text).not.toContain('a1b2c3d4e5f6');
    expect(text).toContain('/disciplinas/12345/aulas');
    expect(text).toContain('introducao-a-engenharia-de-software-2025');
  });
});

describe('maskText — termos informados (--mask)', () => {
  it('ignora acento e caixa e aceita &nbsp; entre as palavras', () => {
    const { text, counts } = maskText('Olá, JOSÉ&nbsp;DA SILVA! Bem-vindo, jose da silva.', ['José da Silva']);
    expect(text).toBe('Olá, [dado-1]! Bem-vindo, [dado-1].');
    expect(counts['termo informado em --mask']).toBe(2);
  });

  it('também mascara cada palavra do nome (≥ 4 letras) sozinha', () => {
    const { text } = maskText('Aluno: Silva, José. Prof. Marcos Oliveira.', ['José da Silva']);
    expect(text).toBe('Aluno: [dado-1], [dado-1]. Prof. Marcos Oliveira.');
  });

  it('respeita limite de palavra (não mexe em "Mariana" ao mascarar "Ana")', () => {
    expect(maskText('Ana e Mariana', ['Ana']).text).toBe('[dado-1] e Mariana');
  });

  it('mascara matrícula numérica sem pegar números maiores', () => {
    expect(maskText('RA 20231234 · turma 202312345', ['20231234']).text).toBe('RA [dado-1] · turma 202312345');
  });

  it('usa um marcador diferente por termo', () => {
    expect(maskText('Lia Costa — RA 99887766', ['Lia Costa', '99887766']).text).toBe('[dado-1] — RA [dado-2]');
  });

  it('recusa termos curtos demais em vez de ignorá-los em silêncio', () => {
    expect(() => createMasker(['ab'])).toThrow(/muito curto/);
  });

  it('caracteres especiais no termo não quebram a regex', () => {
    expect(maskText('id (a+b)* fim', ['(a+b)*']).text).toContain('[dado-1]');
  });
});

describe('maskDeep', () => {
  it('mascara strings em objetos e listas e soma as contagens', () => {
    const counts = {};
    const out = maskDeep({ a: ['x@y.com', { b: 'ok' }], n: 3 }, createMasker(), counts);
    expect(out).toEqual({ a: ['[email]', { b: 'ok' }], n: 3 });
    expect(counts).toEqual({ 'e-mail': 1 });
  });
});

describe('isSensitiveKey / looksLikeToken', () => {
  it.each(['sesskey', 'access_token', 'userId', 'user_id', 'JSESSIONID', 'email', 'matricula', 'senha', 'csrfmiddlewaretoken', 'nome'])(
    '%s é sensível',
    (k) => expect(isSensitiveKey(k)).toBe(true),
  );
  it.each(['id', 'courseid', 'disciplina', 'page', 'filename', 'periodo', 'turma'])('%s não é sensível', (k) =>
    expect(isSensitiveKey(k)).toBe(false),
  );
  it('token exige letras e dígitos e 24+ caracteres', () => {
    expect(looksLikeToken('abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(looksLikeToken('1234567890123456789012345')).toBe(false);
    expect(looksLikeToken('a1b2c3d4e5f6a7b8c9d0e1f2')).toBe(true);
  });
});

describe('routeOf', () => {
  it('troca ids/uuid/tokens por marcadores e guarda só os nomes dos parâmetros', () => {
    const r = routeOf(
      'https://portal.edu.br/api/disciplinas/123/aulas/3f2504e0-4f89-11d3-9a0c-0305e82c3301?periodo=2025&token=SEGREDO',
    );
    expect(r).toEqual({
      host: 'portal.edu.br',
      path: '/api/disciplinas/:id/aulas/:uuid',
      queryKeys: ['periodo', 'token'],
    });
    expect(JSON.stringify(r)).not.toContain('SEGREDO');
  });

  it('url inválida não explode', () => {
    expect(routeOf('::::').host).toBe('');
  });
});
