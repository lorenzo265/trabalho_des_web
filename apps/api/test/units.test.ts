import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../src/lib/csv';
import { addDays, daysBetween, isRealDate, mondayOf } from '../src/lib/dates';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { RateLimiter } from '../src/lib/rate-limit';
import { hashToken, newSessionToken, readCookie } from '../src/lib/tokens';
import { describeDevice } from '../src/lib/user-agent';
import { FakeClock } from '../src/clock';
import { loadConfig } from '../src/config';

describe('describeDevice', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Chrome · Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge · Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0', 'Firefox · Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1', 'Chrome · iPhone'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', 'Chrome · Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Safari · macOS'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Chrome · Linux'],
    ['Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36', 'Samsung Internet · Android'],
    ['curl/8.5.0', 'Dispositivo desconhecido'],
    ['', 'Dispositivo desconhecido'],
  ])('%s → %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });
  it('sem UA', () => expect(describeDevice(undefined)).toBe('Dispositivo desconhecido'));
});

describe('csv', () => {
  it('escapa aspas, separador e quebras; neutraliza fórmulas', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('linha\nnova')).toBe('"linha\nnova"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
    for (const f of ['=SOMA(A1)', '+1', '-1', '@cmd', '\tx']) expect(csvCell(f).startsWith("'")).toBe(true);
    expect(csvCell('a-b')).toBe('a-b');
  });
  it('BOM, CRLF e linha final', () => {
    const out = toCsv(['A', 'B'], [['1', 'x;y']]);
    expect(out).toBe('﻿A;B\r\n1;"x;y"\r\n');
  });
});

describe('datas', () => {
  it('valida datas reais', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('26-1-1')).toBe(false);
  });
  it('segunda-feira da semana e intervalos', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19'); // segunda
    expect(mondayOf('2026-10-23')).toBe('2026-10-19'); // sexta
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(mondayOf('2026-01-01')).toBe('2025-12-29'); // virada de ano
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('senha e tokens', () => {
  it('scrypt: hash único por senha, verifica certo/errado, rejeita formato inválido', async () => {
    const h1 = await hashPassword('minha-senha-1');
    const h2 = await hashPassword('minha-senha-1');
    expect(h1).not.toBe(h2); // sal aleatório
    expect(await verifyPassword('minha-senha-1', h1)).toBe(true);
    expect(await verifyPassword('minha-senha-2', h1)).toBe(false);
    expect(await verifyPassword('x', 'lixo')).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false); // hash fantasma
  });
  it('token de sessão: 32 bytes aleatórios; hash sha256 estável', () => {
    const a = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(a);
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('lê cookies', () => {
    expect(readCookie('a=1; edumind_session=xyz; b=2', 'edumind_session')).toBe('xyz');
    expect(readCookie('a=1', 'edumind_session')).toBeUndefined();
    expect(readCookie(undefined, 'a')).toBeUndefined();
    expect(readCookie('edumind_session=%E0%A4%A', 'edumind_session')).toBeUndefined(); // escape inválido
  });
});

describe('RateLimiter', () => {
  it('janela deslizante com retryAfter e reset', () => {
    const clock = new FakeClock('2026-10-23T12:00:00Z');
    const rl = new RateLimiter(2, 60_000, clock.now);
    expect(rl.retryAfter('k')).toBeNull();
    rl.hit('k');
    rl.hit('k');
    expect(rl.retryAfter('k')).toBe(60);
    clock.advance(30_000);
    expect(rl.retryAfter('k')).toBe(30);
    expect(rl.retryAfter('outra')).toBeNull();
    clock.advance(31_000);
    expect(rl.retryAfter('k')).toBeNull();
    rl.hit('k'); rl.hit('k');
    rl.reset('k');
    expect(rl.retryAfter('k')).toBeNull();
  });
});

describe('loadConfig', () => {
  it('padrões e env vazio tratado como ausente', () => {
    const c = loadConfig({ OPENROUTER_API_KEY: '', ADMIN_EMAIL: ' ', DB_PATH: ':memory:' });
    expect(c).toMatchObject({ port: 3001, appName: 'EduMind', dbPath: ':memory:', scraperSource: 'mock', cookieSecure: false, sessionDays: 7 });
    expect(c.openRouterApiKey).toBeUndefined();
    expect(c.adminEmail).toBeUndefined();
  });
  it('lê variáveis e resolve DB_PATH relativo a partir da raiz do repositório', () => {
    const c = loadConfig({ API_PORT: '4000', COOKIE_SECURE: 'true', SCRAPER_SOURCE: 'portal', DB_PATH: './data/x.db', OPENROUTER_BASE_URL: 'http://h/v1/' });
    expect(c).toMatchObject({ port: 4000, cookieSecure: true, scraperSource: 'portal', openRouterBaseUrl: 'http://h/v1' });
    expect(c.dbPath.endsWith('/data/x.db')).toBe(true);
    expect(c.dbPath).not.toContain('apps/api');
  });
});
