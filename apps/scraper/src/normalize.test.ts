import { describe, expect, it } from 'vitest';
import {
  cleanText,
  dedupeByExternalId,
  emptyToNull,
  mapAssignmentStatus,
  parseBrDate,
  parseGrade,
  parseTimeRange,
} from './normalize';

describe('cleanText / emptyToNull', () => {
  it('colapsa espaços, nbsp e quebras de linha', () => {
    expect(cleanText('  Sala 311 \n  · Prédio   01 ')).toBe('Sala 311 · Prédio 01');
    expect(cleanText(null)).toBe('');
  });
  it('traços e vazios viram null', () => {
    for (const v of ['', '  ', '-', '—', '–', ' — ']) expect(emptyToNull(v)).toBeNull();
    expect(emptyToNull(' Sala 1 ')).toBe('Sala 1');
    expect(emptyToNull(undefined)).toBeNull();
  });
});

describe('parseBrDate', () => {
  it('converte dd/mm/aaaa', () => {
    expect(parseBrDate('23/10/2026')).toBe('2026-10-23');
    expect(parseBrDate('3/4/2026')).toBe('2026-04-03');
  });
  it('acha a data no meio do texto', () => {
    expect(parseBrDate('23/10/2026 (qui)')).toBe('2026-10-23');
    expect(parseBrDate('30/10/2026 23:59')).toBe('2026-10-30');
  });
  it('aceita ano com 2 dígitos', () => {
    expect(parseBrDate('01/02/26')).toBe('2026-02-01');
  });
  it('rejeita datas inexistentes ou ausentes', () => {
    expect(parseBrDate('31/02/2026')).toBeNull();
    expect(parseBrDate('32/01/2026')).toBeNull();
    expect(parseBrDate('amanhã')).toBeNull();
    expect(parseBrDate(null)).toBeNull();
  });
});

describe('parseTimeRange', () => {
  it('formatos com dois pontos', () => {
    expect(parseTimeRange('19:00 - 20:30')).toEqual({ start: '19:00', end: '20:30' });
    expect(parseTimeRange('19:00–20:30')).toEqual({ start: '19:00', end: '20:30' });
    expect(parseTimeRange('das 19:00 às 20:30')).toEqual({ start: '19:00', end: '20:30' });
  });
  it('formatos com "h"', () => {
    expect(parseTimeRange('19h às 20h30')).toEqual({ start: '19:00', end: '20:30' });
    expect(parseTimeRange('19h30 - 21h')).toEqual({ start: '19:30', end: '21:00' });
    expect(parseTimeRange('8h às 9h50')).toEqual({ start: '08:00', end: '09:50' });
  });
  it('rejeita faixa incompleta ou inválida', () => {
    expect(parseTimeRange('19:00')).toBeNull();
    expect(parseTimeRange('25:00 - 26:00')).toBeNull();
    expect(parseTimeRange('19:75 - 20:00')).toBeNull();
    expect(parseTimeRange('')).toBeNull();
  });
});

describe('mapAssignmentStatus', () => {
  it.each([
    ['Pendente', 'pendente'],
    ['Em atraso', 'pendente'],
    ['Não enviado', 'pendente'],
    ['Nao entregue', 'pendente'],
    ['Enviado', 'entregue'],
    ['Entregue', 'entregue'],
    ['Corrigido', 'corrigido'],
    ['Avaliado', 'corrigido'],
    ['  CORRIGIDO ', 'corrigido'],
    ['algo estranho', 'pendente'],
  ])('%s → %s', (input, expected) => {
    expect(mapAssignmentStatus(input)).toBe(expected);
  });
});

describe('parseGrade', () => {
  it('lê vírgula e ponto', () => {
    expect(parseGrade('8,5')).toBe(8.5);
    expect(parseGrade('9.5')).toBe(9.5);
    expect(parseGrade('10')).toBe(10);
    expect(parseGrade('7,0 / 10')).toBe(7);
  });
  it('sem nota → null', () => {
    expect(parseGrade('—')).toBeNull();
    expect(parseGrade('')).toBeNull();
    expect(parseGrade(null)).toBeNull();
  });
});

describe('dedupeByExternalId', () => {
  it('mantém o último de cada id na ordem da primeira aparição', () => {
    const out = dedupeByExternalId([
      { externalId: 'a', v: 1 },
      { externalId: 'b', v: 2 },
      { externalId: 'a', v: 3 },
    ]);
    expect(out).toEqual([
      { externalId: 'a', v: 3 },
      { externalId: 'b', v: 2 },
    ]);
  });
});
