/** Formato das linhas do SQLite (snake_case) usadas pelos módulos. */

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  level: 'medio' | 'superior' | 'concurso';
  role: 'user' | 'admin';
  is_active: number;
  weekly_goal_minutes: number;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string;
  device: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: 'manual' | 'expired' | 'revoked' | 'admin' | null;
}

export interface AccessLogRow {
  id: number;
  user_id: number | null;
  user_name: string;
  user_email: string;
  session_id: number | null;
  method: 'password' | 'google';
  device: string;
  ip: string | null;
  login_at: string;
  logout_at: string | null;
  logout_reason: 'manual' | 'expired' | 'revoked' | 'admin' | null;
}

export interface SubjectRow {
  id: number;
  user_id: number;
  name: string;
  professor: string | null;
  room: string | null;
  color: string;
  source: 'manual' | 'scraper';
  external_id: string | null;
  created_at: string;
  topic_count: number;
  done_count: number;
}

export interface TopicRow {
  id: number;
  subject_id: number;
  title: string;
  notes: string | null;
  position: number;
  status: 'pendente' | 'estudando' | 'concluido';
  due_date: string | null;
  done_at: string | null;
}

export interface GoalRow {
  id: number;
  user_id: number;
  subject_id: number;
  subject_name: string;
  subject_color: string;
  goal_date: string;
  description: string;
  target_minutes: number | null;
  done: number;
  done_at: string | null;
}

export interface ThreadRow {
  id: number;
  user_id: number;
  subject_id: number | null;
  subject_name: string | null;
  subject_color: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  thread_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface LessonRow {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_color: string;
  external_id: string;
  date: string;
  start_time: string;
  end_time: string;
  topic: string | null;
  room: string | null;
}

export interface AssignmentRow {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_color: string;
  external_id: string;
  title: string;
  description: string | null;
  due_date: string;
  status: 'pendente' | 'entregue' | 'corrigido';
  grade: number | null;
}

export interface SyncRunRow {
  id: number;
  user_id: number;
  source: 'mock' | 'portal';
  status: 'running' | 'ok' | 'error';
  started_at: string;
  finished_at: string | null;
  stats_json: string | null;
  error: string | null;
}
