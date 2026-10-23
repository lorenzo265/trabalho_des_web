import { addDays, diffDays, formatHours, formatMinutes, relativeDay, toLocalDate, weekStartOf } from './dates';

describe('datas', () => {
  it('segunda-feira da semana', () => {
    expect(weekStartOf('2026-10-23')).toBe('2026-10-19'); // sexta → segunda
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // domingo
  });
  it('soma dias atravessando o mês e o ano', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(toLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('diferença e texto relativo', () => {
    expect(diffDays('2026-10-23', '2026-10-26')).toBe(3);
    expect(relativeDay('2026-10-23', '2026-10-23')).toBe('hoje');
    expect(relativeDay('2026-10-24', '2026-10-23')).toBe('amanhã');
    expect(relativeDay('2026-10-26', '2026-10-23')).toBe('em 3 dias');
    expect(relativeDay('2026-10-21', '2026-10-23')).toBe('há 2 dias');
  });
  it('formata minutos e horas', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(150)).toBe('2h 30min');
    expect(formatHours(840)).toBe('14 h');
    expect(formatHours(150)).toBe('2,5 h');
  });
});
