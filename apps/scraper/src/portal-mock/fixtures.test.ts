import { describe, expect, it } from 'vitest';
import { addDays, buildFixtures, weekdayOf } from './fixtures';

const TODAY = '2026-10-23'; // sexta-feira

describe('buildFixtures', () => {
  const courses = buildFixtures(TODAY);

  it('gera as 5 disciplinas esperadas', () => {
    expect(courses.map((c) => c.id)).toEqual(['ddm', 'ia', 'bd', 'es', 'redes']);
    const ddm = courses[0]!;
    expect(ddm.name).toBe('Desenvolvimento de Dispositivos Móveis');
    expect(ddm.professor).toBe('Prof. João');
    expect(ddm.room).toBe('Sala 311 · Prédio 01');
    expect(courses[1]!.professor).toBe('Profa. Carla');
  });

  it('é determinística para a mesma data', () => {
    expect(buildFixtures(TODAY)).toEqual(courses);
    expect(buildFixtures('2026-11-02')).not.toEqual(courses);
  });

  it('cada disciplina tem 6–8 aulas entre hoje-21 e hoje+21, no mesmo dia da semana', () => {
    for (const c of courses) {
      expect(c.lessons.length).toBeGreaterThanOrEqual(6);
      expect(c.lessons.length).toBeLessThanOrEqual(8);
      for (const l of c.lessons) {
        expect(l.date >= addDays(TODAY, -21) && l.date <= addDays(TODAY, 21)).toBe(true);
        expect(weekdayOf(l.date)).toBe(weekdayOf(c.lessons[0]!.date));
      }
      const dates = c.lessons.map((l) => l.date);
      expect([...dates].sort()).toEqual(dates);
    }
  });

  it('Dispositivos Móveis tem aula às quintas 19:00–20:30 (inclusive 22/10 e 29/10)', () => {
    const ddm = courses[0]!;
    expect(ddm.lessons.every((l) => weekdayOf(l.date) === 4 && l.start === '19:00' && l.end === '20:30')).toBe(true);
    expect(ddm.lessons.map((l) => l.date)).toEqual(
      expect.arrayContaining(['2026-10-22', '2026-10-29']),
    );
  });

  it('tem 1–3 trabalhos por disciplina, com prazos passados e futuros e notas só nos corrigidos', () => {
    const all = courses.flatMap((c) => c.assignments);
    for (const c of courses) {
      expect(c.assignments.length).toBeGreaterThanOrEqual(1);
      expect(c.assignments.length).toBeLessThanOrEqual(3);
    }
    expect(all.some((a) => a.dueDate < TODAY)).toBe(true);
    expect(all.some((a) => a.dueDate > TODAY)).toBe(true);
    expect(all.filter((a) => a.status === 'Corrigido').every((a) => a.grade !== null)).toBe(true);
    expect(all.filter((a) => a.status !== 'Corrigido').every((a) => a.grade === null)).toBe(true);
  });

  it('ids são únicos no portal inteiro', () => {
    const ids = courses.flatMap((c) => [...c.lessons.map((l) => l.id), ...c.assignments.map((a) => a.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
