import { createHash } from 'node:crypto';
import { DAY, MINUTE } from '../clock';
import { insert, run, type Db } from '../db/db';
import { addDays, mondayOf } from '../lib/dates';
import { hashPassword } from '../lib/password';
import { insertAccessLog, insertSession } from '../modules/access/repo';
import { bootstrapAdmin, findUserByEmail, insertUser } from '../modules/auth/users';

export interface SeedOptions {
  now: Date;
  admin: { email: string; password: string; name: string };
}

export interface SeedSummary {
  admin: 'created' | 'promoted' | 'unchanged';
  usersCreated: string[];
  demoDataCreated: boolean;
}

const DEMO_PASSWORD = 'aluno12345';
const iso = (d: Date) => d.toISOString();
/** Data local do aluno (AAAA-MM-DD). */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DEVICES = {
  win: { device: 'Chrome · Windows', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
  iphone: { device: 'Safari · iPhone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  android: { device: 'Chrome · Android', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' },
} as const;
type DeviceKey = keyof typeof DEVICES;

interface LogSpec {
  daysAgo: number;
  /** Hora do login em UTC (ex.: 22 = 19:00 em Brasília). */
  hour: number;
  minute?: number;
  device: DeviceKey;
  /** Duração em minutos; ausente = sessão em andamento. */
  minutes?: number;
  reason?: 'manual' | 'expired' | 'revoked' | 'admin';
  method?: 'password' | 'google';
}

const GUSTAVO_LOGS: LogSpec[] = [
  { daysAgo: 0, hour: 22, minute: 5, device: 'win' }, // em andamento (hoje)
  { daysAgo: 1, hour: 23, minute: 40, device: 'iphone' }, // em andamento (ontem, celular)
  { daysAgo: 1, hour: 18, minute: 10, device: 'win', minutes: 95, reason: 'manual' },
  { daysAgo: 2, hour: 22, minute: 30, device: 'android', minutes: 42, reason: 'manual' },
  { daysAgo: 3, hour: 21, minute: 55, device: 'win', minutes: 130, reason: 'manual' },
  { daysAgo: 3, hour: 13, minute: 15, device: 'iphone', minutes: 25, reason: 'revoked' },
  { daysAgo: 4, hour: 22, minute: 0, device: 'win', minutes: 75, reason: 'manual' },
  { daysAgo: 5, hour: 17, minute: 45, device: 'android', minutes: 60, reason: 'manual', method: 'google' },
  { daysAgo: 6, hour: 22, minute: 20, device: 'win', minutes: 110, reason: 'manual' },
  { daysAgo: 7, hour: 20, minute: 10, device: 'iphone', minutes: 35, reason: 'admin' },
  { daysAgo: 8, hour: 22, minute: 45, device: 'win', minutes: 90, reason: 'manual' },
  { daysAgo: 9, hour: 15, minute: 30, device: 'android', minutes: 7 * 24 * 60, reason: 'expired' }, // nunca saiu: venceu em 7 dias
  { daysAgo: 10, hour: 22, minute: 15, device: 'win', minutes: 65, reason: 'manual' },
];

const OTHER_USERS: { name: string; email: string; daysAgo: number; active?: boolean; logs: LogSpec[]; subjects?: number }[] = [
  {
    name: 'Tales Galina', email: 'tales@edumind.local', daysAgo: 12, subjects: 2,
    logs: [
      { daysAgo: 0, hour: 21, minute: 30, device: 'win', minutes: 55, reason: 'manual' },
      { daysAgo: 2, hour: 22, minute: 10, device: 'android', minutes: 40, reason: 'manual' },
      { daysAgo: 5, hour: 23, minute: 0, device: 'win', minutes: 80, reason: 'manual' },
      { daysAgo: 6, hour: 19, minute: 20, device: 'win', minutes: 30, reason: 'revoked' },
    ],
  },
  {
    name: 'Lorenzo Lindemann', email: 'lorenzo@edumind.local', daysAgo: 12, subjects: 3,
    logs: [
      { daysAgo: 0, hour: 20, minute: 40, device: 'iphone' }, // em andamento
      { daysAgo: 1, hour: 22, minute: 5, device: 'win', minutes: 120, reason: 'manual' },
      { daysAgo: 4, hour: 21, minute: 15, device: 'iphone', minutes: 50, reason: 'manual', method: 'google' },
    ],
  },
  {
    name: 'Eduardo Costa', email: 'eduardo@edumind.local', daysAgo: 8, subjects: 1,
    logs: [
      { daysAgo: 2, hour: 23, minute: 10, device: 'android', minutes: 28, reason: 'manual' },
      { daysAgo: 6, hour: 22, minute: 50, device: 'win', minutes: 70, reason: 'manual' },
    ],
  },
  {
    name: 'Visitante Bloqueado', email: 'visitante@edumind.local', daysAgo: 6, active: false, subjects: 0,
    logs: [{ daysAgo: 3, hour: 18, minute: 0, device: 'win', minutes: 20, reason: 'admin' }],
  },
];

/** Cria o histórico de acessos de um usuário: uma sessão + uma linha de log por entrada. */
function seedAccessLogs(db: Db, user: { id: number; name: string; email: string }, specs: LogSpec[], now: Date, ipSeed: number): void {
  specs.forEach((s, i) => {
    const login = new Date(now.getTime() - s.daysAgo * DAY);
    login.setUTCHours(s.hour, s.minute ?? 0, 0, 0);
    if (login > now) login.setTime(now.getTime() - (i + 1) * 10 * MINUTE);
    const logout = s.minutes ? new Date(login.getTime() + s.minutes * MINUTE) : null;
    const d = DEVICES[s.device];
    const ip = `192.168.0.${10 + ((ipSeed + i) % 40)}`;
    const sessionId = insertSession(db, {
      userId: user.id,
      tokenHash: createHash('sha256').update(`seed-${user.email}-${i}`).digest('hex'),
      device: d.device,
      userAgent: d.ua,
      ip,
      createdAt: iso(login),
      lastSeenAt: iso(logout ?? now),
      expiresAt: iso(new Date(login.getTime() + 7 * DAY)),
      revokedAt: logout ? iso(logout) : null,
      revokeReason: logout ? (s.reason ?? 'manual') : null,
    });
    insertAccessLog(db, {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      sessionId,
      method: s.method ?? 'password',
      device: d.device,
      ip,
      loginAt: iso(login),
      logoutAt: logout ? iso(logout) : null,
      logoutReason: logout ? (s.reason ?? 'manual') : null,
    });
  });
  const last = specs.map((s) => new Date(now.getTime() - s.daysAgo * DAY)).sort((a, b) => +b - +a)[0];
  if (last) run(db, 'update users set last_login_at = ? where id = ?', iso(last), user.id);
}

interface SubjectSeed {
  code: string;
  name: string;
  professor: string;
  room: string;
  color: string;
  topics: { title: string; status: 'pendente' | 'estudando' | 'concluido'; due?: number }[];
}

const done = (title: string) => ({ title, status: 'concluido' as const });
const SUBJECTS: SubjectSeed[] = [
  {
    code: 'mov', name: 'Desenvolvimento Móvel', professor: 'Prof. João', room: 'Sala 311 · Prédio 01', color: '#2563EB',
    topics: [
      done('Requisitos funcionais e não funcionais'),
      done('Protótipos de telas'),
      done('Modelo de dados e DER'),
      done('Fluxograma de acesso e log'),
      { title: 'Autenticação e persistência em nuvem', status: 'estudando', due: 5 },
    ],
  },
  {
    code: 'ia', name: 'Inteligência Artificial', professor: 'Profa. Carla', room: 'Prédio 1', color: '#D97706',
    topics: [
      done('O que é IA'), done('Agentes inteligentes'), done('Busca em espaço de estados'),
      done('Busca informada (A*)'), done('Lógica proposicional'),
      { title: 'Aprendizado supervisionado', status: 'estudando', due: 3 },
      { title: 'Regressão e classificação', status: 'pendente', due: 8 },
      { title: 'Redes neurais', status: 'pendente', due: 14 },
      { title: 'Avaliação de modelos', status: 'pendente' },
      { title: 'Engenharia de prompts', status: 'pendente' },
      { title: 'Ética em IA', status: 'pendente' },
    ],
  },
  {
    code: 'bd', name: 'Banco de Dados', professor: 'Prof. Marcos', room: 'Sala 205 · Prédio 02', color: '#059669',
    topics: [
      done('Modelo entidade-relacionamento'), done('SQL básico'),
      { title: 'Normalização', status: 'estudando', due: 2 },
      { title: 'Índices e desempenho', status: 'pendente', due: 10 },
      { title: 'Transações', status: 'pendente' },
      { title: 'Projeto final do semestre', status: 'pendente', due: 20 },
    ],
  },
  {
    code: 'es', name: 'Engenharia de Software', professor: 'Profa. Ana', room: 'Sala 118 · Prédio 03', color: '#7C3AED',
    topics: [done('Ciclo de vida do software'), done('Metodologias ágeis'), done('UML'), done('Testes de software')],
  },
];

// (dia da semana 0=seg…4=sex) → [código da disciplina, minutos]
const WEEK_MINUTES: Record<number, [string, number][]> = {
  0: [['mov', 90], ['ia', 90]],
  1: [['bd', 60], ['mov', 60]],
  2: [['ia', 120], ['mov', 120]],
  3: [['es', 60], ['bd', 90]],
  4: [['mov', 90], ['ia', 60]],
};

function seedGustavo(db: Db, userId: number, now: Date): void {
  const today = localDate(now);
  const nowIso = iso(now);
  const ids: Record<string, number> = {};

  for (const s of SUBJECTS) {
    ids[s.code] = insert(
      db,
      `insert into subjects (user_id, name, professor, room, color, source, created_at)
       values (?, ?, ?, ?, ?, 'manual', ?)`,
      userId, s.name, s.professor, s.room, s.color, iso(new Date(now.getTime() - 20 * DAY)),
    );
    s.topics.forEach((t, position) => {
      insert(
        db,
        'insert into topics (subject_id, title, position, status, due_date, done_at) values (?, ?, ?, ?, ?, ?)',
        ids[s.code]!, t.title, position, t.status, t.due === undefined ? null : addDays(today, t.due),
        t.status === 'concluido' ? iso(new Date(now.getTime() - (10 + position) * DAY)) : null,
      );
    });
  }

  // Metas de hoje (checklist do dashboard).
  const goals: [string, string, number, boolean][] = [
    ['mov', 'Estudar requisitos do Projeto G2', 45, true],
    ['mov', 'Modelar coleções no Firebase', 60, false],
    ['ia', 'Testar prompt do Tutor IA', 30, false],
    ['bd', 'Revisar normalização (1FN a 3FN)', 40, false],
  ];
  for (const [code, description, minutes, isDone] of goals) {
    insert(
      db,
      'insert into daily_goals (user_id, subject_id, goal_date, description, target_minutes, done, done_at) values (?, ?, ?, ?, ?, ?, ?)',
      userId, ids[code]!, today, description, minutes, isDone ? 1 : 0, isDone ? nowIso : null,
    );
  }

  // Sessões de estudo: semana atual seg–sex (14 h no total) e semana anterior (menor).
  const monday = mondayOf(today);
  const sessions = (weekStart: string, scale: number) => {
    for (const [dow, list] of Object.entries(WEEK_MINUTES)) {
      const day = addDays(weekStart, Number(dow));
      list.forEach(([code, minutes], i) => {
        insert(
          db,
          'insert into study_sessions (user_id, subject_id, started_at, day, minutes) values (?, ?, ?, ?, ?)',
          userId, ids[code]!, `${day}T${i === 0 ? '21' : '23'}:00:00.000Z`, day, Math.max(15, Math.round((minutes * scale) / 5) * 5),
        );
      });
    }
  };
  sessions(monday, 1);
  sessions(addDays(monday, -7), 0.7);
  run(db, 'update users set weekly_goal_minutes = 1200 where id = ?', userId);

  // Conversas com o Professor Tutor.
  const thread = (subject: string | null, title: string, msgs: ['user' | 'assistant', string][], minutesAgo: number) => {
    const start = new Date(now.getTime() - minutesAgo * MINUTE);
    const threadId = insert(
      db,
      'insert into chat_threads (user_id, subject_id, title, created_at, updated_at) values (?, ?, ?, ?, ?)',
      userId, subject ? ids[subject]! : null, title, iso(start), iso(new Date(start.getTime() + msgs.length * MINUTE)),
    );
    msgs.forEach(([role, content], i) =>
      insert(
        db,
        'insert into chat_messages (thread_id, role, content, created_at) values (?, ?, ?, ?)',
        threadId, role, content, iso(new Date(start.getTime() + i * MINUTE)),
      ),
    );
  };
  thread('mov', 'Pode me explicar o que é um Requisito Funcional?', [
    ['user', 'Pode me explicar o que é um Requisito Funcional?'],
    ['assistant', 'Com certeza! Um **Requisito Funcional** descreve *o que* o sistema faz.\n\nExemplo: *"O app deve permitir login com Google."*\n\nJá um requisito **não funcional** fala de *como* o sistema se comporta (desempenho, segurança, usabilidade).\n\n**Pergunta para checar:** "O app deve responder em menos de 2 segundos" é funcional ou não funcional?'],
    ['user', 'Não funcional, né? Porque é sobre desempenho.'],
    ['assistant', 'Exato! 👏 É um requisito não funcional de **desempenho**. Quer tentar classificar mais dois exemplos do seu projeto?'],
  ], 180);
  thread('ia', 'Como funciona a busca A*?', [
    ['user', 'Como funciona a busca A*?'],
    ['assistant', 'O **A\\*** escolhe sempre o nó com menor `f(n) = g(n) + h(n)`:\n\n- `g(n)`: custo já pago até o nó\n- `h(n)`: estimativa do custo restante\n\nSe `h` nunca superestima o custo real (heurística admissível), o A* encontra o caminho ótimo.\n\n**Pergunta para checar:** o que acontece com o A* se `h(n) = 0` para todo nó?'],
  ], 60 * 26);

  // Aulas e trabalhos de exemplo (ids "seed:*" são trocados quando o primeiro sync real roda).
  const pattern: Record<number, [string, string, string, string][]> = {
    0: [['bd', '19:00', '20:30', 'Normalização e formas normais']],
    1: [['ia', '19:00', '20:30', 'Aprendizado supervisionado']],
    2: [['es', '19:00', '20:30', 'Revisão para a prova']],
    3: [['ia', '19:00', '20:30', 'Regressão e classificação']],
    4: [['mov', '19:00', '20:30', 'Dicas de telas e protótipo do app']],
  };
  for (let offset = -2; offset <= 9; offset++) {
    const date = addDays(today, offset);
    const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = seg
    for (const [code, start, end, topic] of pattern[dow] ?? []) {
      const subject = SUBJECTS.find((s) => s.code === code)!;
      insert(
        db,
        `insert into lessons (user_id, subject_id, external_id, date, start_time, end_time, topic, room, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, ids[code]!, `seed:lesson:${code}:${date}`, date, start, end, topic, subject.room, nowIso,
      );
    }
  }
  const assignments: [string, string, string, number, 'pendente' | 'entregue' | 'corrigido', number | null][] = [
    ['mov', 'Projeto G2 — telas de acesso, modelo de dados e fluxograma', 'Entregar o documento com telas, DER e fluxograma de acesso e log.', 0, 'pendente', null],
    ['ia', 'Lista de exercícios — busca informada', 'Resolver os exercícios 1 a 8 do capítulo 3.', 4, 'pendente', null],
    ['bd', 'Trabalho de normalização', 'Normalizar o esquema da biblioteca até a 3FN.', 9, 'pendente', null],
    ['es', 'Estudo de caso — testes de software', 'Relatório de 3 páginas sobre testes automatizados.', -6, 'corrigido', 9.0],
  ];
  for (const [code, title, description, due, status, grade] of assignments) {
    insert(
      db,
      `insert into assignments (user_id, subject_id, external_id, title, description, due_date, status, grade, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, ids[code]!, `seed:assignment:${code}:${due}`, title, description, addDays(today, due), status, grade, nowIso,
    );
  }
}

/** Dados de demonstração. Idempotente: contas que já existem não são recriadas nem alteradas. */
export async function seedDemo(db: Db, opts: SeedOptions): Promise<SeedSummary> {
  const { now } = opts;
  const summary: SeedSummary = { admin: 'unchanged', usersCreated: [], demoDataCreated: false };
  summary.admin = await bootstrapAdmin(db, opts.admin, iso(now));

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  if (!findUserByEmail(db, 'aluno@edumind.local')) {
    const gustavo = insertUser(db, {
      name: 'Gustavo Peixoto', email: 'aluno@edumind.local', passwordHash,
      createdAt: iso(new Date(now.getTime() - 14 * DAY)),
    });
    summary.usersCreated.push(gustavo.email);
    summary.demoDataCreated = true;
    db.transaction(() => {
      seedGustavo(db, gustavo.id, now);
      seedAccessLogs(db, gustavo, GUSTAVO_LOGS, now, 0);
    })();
  }

  for (const [i, u] of OTHER_USERS.entries()) {
    if (findUserByEmail(db, u.email)) continue;
    const user = insertUser(db, {
      name: u.name, email: u.email, passwordHash, isActive: u.active !== false,
      createdAt: iso(new Date(now.getTime() - u.daysAgo * DAY)),
    });
    summary.usersCreated.push(user.email);
    db.transaction(() => {
      seedAccessLogs(db, user, u.logs, now, 7 * (i + 1));
      SUBJECTS.slice(0, u.subjects ?? 0).forEach((s) => {
        insert(
          db,
          `insert into subjects (user_id, name, professor, room, color, source, created_at) values (?, ?, ?, ?, ?, 'manual', ?)`,
          user.id, s.name, s.professor, s.room, s.color, iso(now),
        );
      });
    })();
  }
  return summary;
}
