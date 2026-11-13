import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ScrapeResult } from '@edumind/contracts';
import { buildIcs, escapeText, foldLine, utcStamp } from '../src/lib/ics';
import { makeApp, sampleScrape, signup } from './helpers';

const unfold = (s: string) => s.replace(/\r\n /g, '');
const lines = (ics: string) => unfold(ics).split('\r\n').filter(Boolean);
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('escapeText', () => {
  it('escapa barra, ponto e vírgula, vírgula e quebras de linha', () => {
    expect(escapeText('a,b;c\\d\nlinha2\r\nlinha3')).toBe('a\\,b\;c\\\\d\\nlinha2\\nlinha3');
    expect(escapeText('sem nada especial')).toBe('sem nada especial');
  });
});

describe('foldLine', () => {
  it('não mexe em linhas curtas (até 75 bytes)', () => {
    const l = 'X'.repeat(75);
    expect(foldLine(l)).toBe(l);
  });

  it('dobra linhas longas em pedaços de no máximo 75 bytes e desdobrar devolve o original', () => {
    const l = 'DESCRIPTION:' + 'palavra '.repeat(60);
    const folded = foldLine(l);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    for (const p of physical) expect(bytes(p)).toBeLessThanOrEqual(75);
    expect(physical.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(unfold(folded)).toBe(l);
  });

  it('conta bytes, não caracteres: acentos e emoji nunca são partidos no meio', () => {
    for (const ch of ['é', 'ç', '→', '📚']) {
      const l = `SUMMARY:${ch.repeat(90)}`;
      const folded = foldLine(l);
      for (const p of folded.split('\r\n')) expect(bytes(p)).toBeLessThanOrEqual(75);
      expect(unfold(folded)).toBe(l); // sem caractere quebrado (U+FFFD)
      expect(folded).not.toContain('�');
    }
  });
});

describe('utcStamp', () => {
  it('formata como AAAAMMDDTHHMMSSZ', () => {
    expect(utcStamp('2026-11-06T20:50:07.123Z')).toBe('20261106T205007Z');
  });
});

describe('buildIcs', () => {
  const base = {
    name: 'EduMind — aulas e prazos',
    generatedAt: '2026-11-06T20:50:00.000Z',
    timed: [
      { uid: 'lesson-1@edumind.local', summary: 'Banco de Dados: Joins, subconsultas', description: 'Disciplina: BD\nConteúdo: Joins', location: 'Lab 2; Prédio 3', date: '2026-11-09', start: '19:00', end: '20:30', modifiedAt: '2026-11-06T20:49:00.000Z' },
    ],
    allDay: [{ uid: 'assignment-1@edumind.local', summary: 'Prazo: Projeto (BD)', date: '2026-12-31' }],
  };
  const ics = buildIcs(base);

  it('é um VCALENDAR bem formado, com CRLF em toda quebra de linha', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/); // nenhum LF solto
    const l = lines(ics);
    expect(l).toContain('VERSION:2.0');
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(l.filter((x) => x === 'END:VEVENT')).toHaveLength(2);
    expect(l.filter((x) => x === 'BEGIN:VTIMEZONE')).toHaveLength(1);
  });

  it('aula: horário local com TZID, texto escapado, local e data da última alteração', () => {
    const l = lines(ics);
    expect(l).toContain('UID:lesson-1@edumind.local');
    expect(l).toContain('DTSTAMP:20261106T205000Z');
    expect(l).toContain('LAST-MODIFIED:20261106T204900Z');
    expect(l).toContain('DTSTART;TZID=America/Sao_Paulo:20261109T190000');
    expect(l).toContain('DTEND;TZID=America/Sao_Paulo:20261109T203000');
    expect(l).toContain('SUMMARY:Banco de Dados: Joins\\, subconsultas');
    expect(l).toContain('DESCRIPTION:Disciplina: BD\\nConteúdo: Joins');
    expect(l).toContain('LOCATION:Lab 2\; Prédio 3');
  });

  it('prazo: dia inteiro com fim EXCLUSIVO (dia seguinte), inclusive na virada do ano', () => {
    const l = lines(ics);
    expect(l).toContain('DTSTART;VALUE=DATE:20261231');
    expect(l).toContain('DTEND;VALUE=DATE:20270101');
    expect(l).toContain('TRANSP:TRANSPARENT');
  });

  it('fim exclusivo também na virada de mês e em ano bissexto', () => {
    const l = lines(buildIcs({ ...base, timed: [], allDay: [
      { uid: 'a', summary: 'a', date: '2026-10-31' },
      { uid: 'b', summary: 'b', date: '2028-02-28' },
      { uid: 'c', summary: 'c', date: '2028-02-29' },
    ] }));
    expect(l.filter((x) => x.startsWith('DTEND'))).toEqual(['DTEND;VALUE=DATE:20261101', 'DTEND;VALUE=DATE:20280229', 'DTEND;VALUE=DATE:20280301']);
  });

  it('todas as linhas físicas têm no máximo 75 bytes, mesmo com títulos longos e acentuados', () => {
    const long = buildIcs({ ...base, timed: [{ ...base.timed[0]!, summary: 'Álgebra linear é fundamental, '.repeat(10) }], allDay: [] });
    for (const p of long.split('\r\n')) expect(bytes(p)).toBeLessThanOrEqual(75);
    expect(lines(long).some((x) => x.startsWith('SUMMARY:Álgebra linear é fundamental\\, '))).toBe(true);
  });

  it('calendário vazio continua válido', () => {
    const empty = buildIcs({ ...base, timed: [], allDay: [] });
    expect(lines(empty).filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(0);
    expect(empty.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('GET /api/calendar.ics', () => {
  async function withSync(result?: ScrapeResult) {
    const t = makeApp({ scrape: async () => structuredClone(result ?? sampleScrape()) });
    const user = await signup(t.app);
    await user.agent.post('/api/sync');
    await t.services.waitForSyncs();
    return { t, ...user };
  }
  const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT').length - 1;

  it('exige login', async () => {
    const t = makeApp();
    expect((await request(t.app).get('/api/calendar.ics')).status).toBe(401);
  });

  it('devolve o arquivo para download, com aulas e prazos do aluno', async () => {
    const { agent } = await withSync();
    const res = await agent.get('/api/calendar.ics').buffer(true).parse((r, cb) => {
      let d = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => (d += c));
      r.on('end', () => cb(null, d));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar; charset=utf-8/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="edumind-agenda.ics"');
    expect(res.headers['cache-control']).toBe('no-store');

    const ics = res.body as string;
    const l = lines(ics);
    expect(events(ics)).toBe(4); // 3 aulas + 1 prazo
    expect(l).toContain('SUMMARY:Desenvolvimento Móvel: Dicas de telas');
    expect(l).toContain('LOCATION:Sala 311');
    expect(l).toContain('DTSTART;TZID=America/Sao_Paulo:20261023T190000');
    expect(l).toContain('DTEND;TZID=America/Sao_Paulo:20261023T203000');
    expect(l).toContain('SUMMARY:Prazo: Projeto G2 (Desenvolvimento Móvel)');
    expect(l).toContain('DTSTART;VALUE=DATE:20261023');
    expect(l).toContain('DTEND;VALUE=DATE:20261024');
    expect(l.find((x) => x.startsWith('DESCRIPTION:Disciplina: Desenvolvimento Móvel\\nSituação: Pendente'))).toContain('Telas e DER');
  });

  it('UIDs são estáveis entre downloads (reimportar atualiza, não duplica)', async () => {
    const { agent, t } = await withSync();
    const uids = async () => lines((await agent.get('/api/calendar.ics')).text).filter((x) => x.startsWith('UID:'));
    const first = await uids();
    t.clock.advance(60_000);
    expect(await uids()).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it('mostra a nota e a situação do trabalho corrigido', async () => {
    const r = sampleScrape();
    r.courses[0]!.assignments[0] = { ...r.courses[0]!.assignments[0]!, status: 'corrigido', grade: 8.5 };
    const { agent } = await withSync(r);
    const l = lines((await agent.get('/api/calendar.ics')).text);
    expect(l.find((x) => x.startsWith('DESCRIPTION:Disciplina: Desenvolvimento Móvel\\nSituação: Corrigido'))).toContain('Nota: 8\\,5');
  });

  it('cada aluno só exporta os próprios eventos', async () => {
    const { t } = await withSync();
    const other = await signup(t.app);
    expect(events((await other.agent.get('/api/calendar.ics')).text)).toBe(0);
  });

  it('filtra por from/to e valida as datas', async () => {
    const { agent } = await withSync();
    // aulas em 23/10, 27/10 e 30/10; prazo em 23/10
    expect(events((await agent.get('/api/calendar.ics?from=2026-10-27&to=2026-10-30')).text)).toBe(2);
    expect(events((await agent.get('/api/calendar.ics?from=2026-10-24')).text)).toBe(2);
    expect(events((await agent.get('/api/calendar.ics?to=2026-10-23')).text)).toBe(2); // 1 aula + 1 prazo
    const bad = await agent.get('/api/calendar.ics?from=31/10/2026');
    expect(bad.status).toBe(422);
  });

  it('o caractere especial no nome da disciplina não quebra o arquivo', async () => {
    const r = sampleScrape();
    r.courses[0]!.name = 'Cálculo; Limites, Derivadas\\Integrais';
    const { agent } = await withSync(r);
    const ics = (await agent.get('/api/calendar.ics')).text;
    expect(lines(ics)).toContain('SUMMARY:Cálculo\; Limites\\, Derivadas\\\\Integrais: Dicas de telas');
    expect(ics).not.toMatch(/(?<!\r)\n/);
  });
});
