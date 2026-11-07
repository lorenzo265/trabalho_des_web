import { all, one, type Db } from '../../db/db';
import { diffDays, weekdayName } from '../../lib/dates';

/**
 * Contexto de estudo que o Professor Tutor recebe junto do prompt: tópicos pendentes, próximas aulas
 * e prazos. Os títulos podem vir do portal da faculdade (conteúdo de terceiros), então tudo passa por
 * `clean` e vai dentro de um bloco delimitado que o prompt manda tratar como DADO, nunca como instrução.
 */

export interface StudyTopic {
  subject?: string;
  title: string;
  status: 'pendente' | 'estudando';
  dueDate: string | null;
}
export interface StudyLesson {
  subject?: string;
  date: string;
  start: string;
  end: string;
  topic: string | null;
  room: string | null;
}
export interface StudyAssignment {
  subject?: string;
  title: string;
  dueDate: string;
  status: 'pendente' | 'entregue' | 'corrigido';
  grade: number | null;
}

export interface StudyData {
  today: string;
  /** `null` = conversa geral (visão de todas as disciplinas). */
  subject: { name: string; topicTotal: number; topicDone: number } | null;
  topics: StudyTopic[];
  lessons: StudyLesson[];
  assignments: StudyAssignment[];
  /** Só na visão geral: tópicos em aberto por disciplina. */
  openTopicsBySubject: { name: string; open: number }[];
}

/** Resumo estruturado (para o tutor de demonstração, que não lê o texto do prompt). */
export interface StudyHint {
  openTopics: number;
  nextDue: { title: string; dueDate: string } | null;
}

export const OPEN_TAG = '<dados_do_aluno>';
export const CLOSE_TAG = '</dados_do_aluno>';

const MAX_TOPICS = 15;
const MAX_LESSONS = 5;
const MAX_PENDING_ASSIGNMENTS = 8;
const MAX_GRADED = 3;

/** Uma linha só, sem as marcas do delimitador, tamanho limitado. */
export function clean(s: string | null | undefined, max = 100): string {
  const flat = (s ?? '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

const fmtGrade = (g: number): string => String(Math.round(g * 100) / 100).replace('.', ',');

function dueLabel(dueDate: string, today: string): string {
  const n = diffDays(today, dueDate);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n > 1) return `em ${n} dias`;
  return n === -1 ? 'venceu ontem' : `venceu há ${-n} dias`;
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export function loadStudyData(db: Db, userId: number, subjectId: number | null, today: string): StudyData {
  const sub = subjectId === null ? undefined : one<{ name: string }>(db, 'select name from subjects where id = ? and user_id = ?', subjectId, userId);
  // Com `subjectId` o escopo é SEMPRE essa disciplina: se ela não for do usuário, não volta nada (e nada vaza).
  const scoped = subjectId !== null;
  const subjectFilter = scoped ? 'and x.subject_id = ?' : '';
  const params = (...base: unknown[]) => (scoped ? [...base, subjectId] : base);

  const topics = all<{ subject_name: string; title: string; status: 'pendente' | 'estudando'; due_date: string | null }>(
    db,
    `select s.name as subject_name, x.title, x.status, x.due_date
     from topics x join subjects s on s.id = x.subject_id
     where s.user_id = ? and x.status != 'concluido' ${subjectFilter}
     order by (x.due_date is null), x.due_date, x.position, x.id limit ?`,
    ...params(userId), MAX_TOPICS,
  );
  const lessons = all<{ subject_name: string; date: string; start_time: string; end_time: string; topic: string | null; room: string | null }>(
    db,
    `select s.name as subject_name, x.date, x.start_time, x.end_time, x.topic, x.room
     from lessons x join subjects s on s.id = x.subject_id
     where x.user_id = ? and x.date >= ? ${subjectFilter}
     order by x.date, x.start_time, x.id limit ?`,
    ...params(userId, today), MAX_LESSONS,
  );
  const pending = all<{ subject_name: string; title: string; due_date: string; status: 'pendente'; grade: number | null }>(
    db,
    `select s.name as subject_name, x.title, x.due_date, x.status, x.grade
     from assignments x join subjects s on s.id = x.subject_id
     where x.user_id = ? and x.status = 'pendente' ${subjectFilter}
     order by x.due_date, x.id limit ?`,
    ...params(userId), MAX_PENDING_ASSIGNMENTS,
  );
  const graded = scoped
    ? all<{ subject_name: string; title: string; due_date: string; status: 'corrigido'; grade: number | null }>(
        db,
        `select s.name as subject_name, x.title, x.due_date, x.status, x.grade
         from assignments x join subjects s on s.id = x.subject_id
         where x.user_id = ? and x.status = 'corrigido' and x.grade is not null ${subjectFilter}
         order by x.due_date desc, x.id desc limit ?`,
        userId, subjectId, MAX_GRADED,
      )
    : [];

  const counts = scoped
    ? one<{ total: number; done: number }>(
        db,
        "select count(*) as total, coalesce(sum(status = 'concluido'), 0) as done from topics where subject_id = ?",
        subjectId,
      )!
    : null;
  const bySubject = scoped
    ? []
    : all<{ name: string; open: number }>(
        db,
        `select s.name, count(*) as open from topics x join subjects s on s.id = x.subject_id
         where s.user_id = ? and x.status != 'concluido' group by s.id order by open desc, s.name limit 8`,
        userId,
      );

  const withName = <T extends { subject_name: string }>(r: T) => (scoped ? {} : { subject: r.subject_name });
  return {
    today,
    subject: sub && counts ? { name: sub.name, topicTotal: counts.total, topicDone: counts.done } : null,
    topics: topics.map((r) => ({ ...withName(r), title: r.title, status: r.status, dueDate: r.due_date })),
    lessons: lessons.map((r) => ({ ...withName(r), date: r.date, start: r.start_time, end: r.end_time, topic: r.topic, room: r.room })),
    assignments: [...pending, ...graded].map((r) => ({ ...withName(r), title: r.title, dueDate: r.due_date, status: r.status, grade: r.grade })),
    openTopicsBySubject: bySubject,
  };
}

// ---------------------------------------------------------------------------
// Texto (puro)
// ---------------------------------------------------------------------------

/** Bloco para o prompt de sistema; `null` se não há nada a contar. */
export function renderStudyContext(d: StudyData): string | null {
  const empty = !d.topics.length && !d.lessons.length && !d.assignments.length && !d.openTopicsBySubject.length;
  if (empty) return null;

  const tag = (s?: string) => (s ? `[${clean(s, 40)}] ` : '');
  const lines: string[] = [`Hoje é ${d.today} (${weekdayName(d.today)}).`];

  if (d.subject) {
    lines.push(`Disciplina em foco: ${clean(d.subject.name, 60)} — ${d.subject.topicDone} de ${d.subject.topicTotal} tópicos concluídos.`);
  } else if (d.openTopicsBySubject.length) {
    lines.push('Tópicos em aberto por disciplina: ' + d.openTopicsBySubject.map((s) => `${clean(s.name, 40)} (${s.open})`).join('; ') + '.');
  }

  if (d.topics.length) {
    lines.push('Tópicos para estudar (os de prazo mais próximo primeiro):');
    for (const t of d.topics) {
      lines.push(`- ${tag(t.subject)}${clean(t.title)} (${t.status})${t.dueDate ? ` — prazo ${t.dueDate}` : ''}`);
    }
  }
  if (d.lessons.length) {
    lines.push('Próximas aulas:');
    for (const l of d.lessons) {
      lines.push(`- ${tag(l.subject)}${l.date} ${l.start}–${l.end}${l.topic ? ` — ${clean(l.topic)}` : ''}${l.room ? ` (${clean(l.room, 40)})` : ''}`);
    }
  }
  if (d.assignments.length) {
    lines.push('Trabalhos:');
    for (const a of d.assignments) {
      lines.push(
        a.status === 'pendente'
          ? `- ${tag(a.subject)}${clean(a.title)} — prazo ${a.dueDate} (${dueLabel(a.dueDate, d.today)}), pendente`
          : `- ${tag(a.subject)}${clean(a.title)} — ${a.status}${a.grade !== null ? `, nota ${fmtGrade(a.grade)}` : ''}`,
      );
    }
  }
  return [OPEN_TAG, ...lines, CLOSE_TAG].join('\n');
}

/** Resumo curto para o tutor de demonstração. */
export function summarizeStudy(d: StudyData): StudyHint {
  const next = d.assignments.find((a) => a.status === 'pendente' && a.dueDate >= d.today);
  return {
    openTopics: d.subject ? d.subject.topicTotal - d.subject.topicDone : d.openTopicsBySubject.reduce((n, s) => n + s.open, 0),
    nextDue: next ? { title: clean(next.title), dueDate: next.dueDate } : null,
  };
}
