-- EduMind (PoC local) — esquema SQLite. Aplicado pelo migrador (pragma user_version = 1).
-- Timestamps: ISO-8601 UTC como text, sempre gravados pela aplicação (relógio injetável).
-- Datas de calendário: AAAA-MM-DD (data local do aluno); horas: HH:mm.

create table users (
  id                  integer primary key autoincrement,
  email               text    not null unique collate nocase,
  name                text    not null,
  password_hash       text    not null,
  level               text    not null default 'superior' check (level in ('medio','superior','concurso')),
  role                text    not null default 'user'     check (role in ('user','admin')),
  is_active           integer not null default 1          check (is_active in (0,1)),
  weekly_goal_minutes integer not null default 600        check (weekly_goal_minutes > 0),
  created_at          text    not null,
  last_login_at       text
);

-- Persistência de acesso: uma sessão por dispositivo; o servidor consegue encerrá-la a qualquer hora.
create table sessions (
  id            integer primary key autoincrement,
  user_id       integer not null references users(id) on delete cascade,
  token_hash    text    not null unique,            -- sha256 do token; o token nunca é guardado
  device        text    not null,                   -- ex.: "Chrome · Android"
  user_agent    text,
  ip            text,
  created_at    text    not null,
  last_seen_at  text    not null,
  expires_at    text    not null,
  revoked_at    text,
  revoke_reason text    check (revoke_reason in ('manual','expired','revoked','admin'))
);
create index sessions_user_idx on sessions (user_id, revoked_at, expires_at);

-- Log de acesso: nome do usuário, data, hora de login e hora de logout.
-- user_name/user_email são cópias: o histórico sobrevive à exclusão da conta.
create table access_logs (
  id            integer primary key autoincrement,
  user_id       integer references users(id) on delete set null,
  user_name     text    not null,
  user_email    text    not null,
  session_id    integer references sessions(id) on delete set null,
  method        text    not null check (method in ('password','google')),
  device        text    not null,
  ip            text,
  login_at      text    not null,
  logout_at     text,                               -- null = sessão em andamento
  logout_reason text    check (logout_reason in ('manual','expired','revoked','admin'))
);
create index access_logs_user_idx    on access_logs (user_id, login_at desc);
create index access_logs_login_idx   on access_logs (login_at desc);
create index access_logs_session_idx on access_logs (session_id);

create table subjects (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  name        text    not null collate nocase,      -- único por usuário, sem diferenciar caixa
  professor   text,
  room        text,
  color       text    not null
              check (color glob '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  source      text    not null default 'manual' check (source in ('manual','scraper')),
  external_id text,
  created_at  text    not null,
  unique (user_id, name)
);
create unique index subjects_external_idx on subjects (user_id, external_id) where external_id is not null;

create table topics (
  id          integer primary key autoincrement,
  subject_id  integer not null references subjects(id) on delete cascade,
  title       text    not null,
  notes       text,
  position    integer not null default 0,
  status      text    not null default 'pendente' check (status in ('pendente','estudando','concluido')),
  due_date    text,
  done_at     text
);
create index topics_subject_idx on topics (subject_id, position);

create table daily_goals (
  id             integer primary key autoincrement,
  user_id        integer not null references users(id) on delete cascade,
  subject_id     integer not null references subjects(id) on delete cascade,
  goal_date      text    not null,
  description    text    not null,
  target_minutes integer check (target_minutes is null or target_minutes > 0),
  done           integer not null default 0 check (done in (0,1)),
  done_at        text
);
create index daily_goals_user_date_idx on daily_goals (user_id, goal_date);

create table study_sessions (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  subject_id  integer not null references subjects(id) on delete cascade,
  started_at  text    not null,
  day         text    not null,                     -- data local do aluno (agrupamento por dia)
  minutes     integer not null check (minutes > 0)
);
create index study_sessions_user_day_idx on study_sessions (user_id, day);

create table chat_threads (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  subject_id  integer references subjects(id) on delete cascade,   -- null = conversa geral
  title       text,
  created_at  text    not null,
  updated_at  text    not null
);
create index chat_threads_user_idx on chat_threads (user_id, updated_at desc);

create table chat_messages (
  id          integer primary key autoincrement,
  thread_id   integer not null references chat_threads(id) on delete cascade,
  role        text    not null check (role in ('user','assistant')),
  content     text    not null,
  created_at  text    not null
);
create index chat_messages_thread_idx on chat_messages (thread_id, id);

-- Aulas e trabalhos lidos da faculdade (módulo de scrapers). Importação idempotente por external_id.
create table lessons (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  subject_id  integer not null references subjects(id) on delete cascade,
  external_id text    not null,
  date        text    not null,
  start_time  text    not null,
  end_time    text    not null,
  topic       text,
  room        text,
  updated_at  text    not null,
  unique (user_id, external_id)
);
create index lessons_user_date_idx on lessons (user_id, date);

create table assignments (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  subject_id  integer not null references subjects(id) on delete cascade,
  external_id text    not null,
  title       text    not null,
  description text,
  due_date    text    not null,
  status      text    not null default 'pendente' check (status in ('pendente','entregue','corrigido')),
  grade       real,
  updated_at  text    not null,
  unique (user_id, external_id)
);
create index assignments_user_due_idx on assignments (user_id, due_date);

create table sync_runs (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  source      text    not null check (source in ('mock','portal')),
  status      text    not null check (status in ('running','ok','error')),
  started_at  text    not null,
  finished_at text,
  stats_json  text,
  error       text
);
create index sync_runs_user_idx on sync_runs (user_id, id desc);
