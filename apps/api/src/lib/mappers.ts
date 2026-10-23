import type {
  AccessLogEntry,
  AdminUserRow,
  Assignment,
  DeviceSession,
  Goal,
  Lesson,
  Message,
  Subject,
  SyncRun,
  Thread,
  Topic,
  User,
} from '@edumind/contracts';
import type {
  AccessLogRow,
  AssignmentRow,
  GoalRow,
  LessonRow,
  MessageRow,
  SessionRow,
  SubjectRow,
  SyncRunRow,
  ThreadRow,
  TopicRow,
  UserRow,
} from '../db/rows';

export const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  level: r.level,
  weeklyGoalMinutes: r.weekly_goal_minutes,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

export const toSubject = (r: SubjectRow): Subject => ({
  id: r.id,
  name: r.name,
  professor: r.professor,
  room: r.room,
  color: r.color,
  source: r.source,
  createdAt: r.created_at,
  topicCount: r.topic_count,
  doneCount: r.done_count,
});

export const toTopic = (r: TopicRow): Topic => ({
  id: r.id,
  subjectId: r.subject_id,
  title: r.title,
  notes: r.notes,
  position: r.position,
  status: r.status,
  dueDate: r.due_date,
  doneAt: r.done_at,
});

export const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  goalDate: r.goal_date,
  description: r.description,
  targetMinutes: r.target_minutes,
  done: r.done === 1,
  doneAt: r.done_at,
});

export const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  threadId: r.thread_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
});

export const toLesson = (r: LessonRow): Lesson => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  date: r.date,
  start: r.start_time,
  end: r.end_time,
  topic: r.topic,
  room: r.room,
});

export const toAssignment = (r: AssignmentRow): Assignment => ({
  id: r.id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectColor: r.subject_color,
  title: r.title,
  description: r.description,
  dueDate: r.due_date,
  status: r.status,
  grade: r.grade,
});

export const toAccessLog = (r: AccessLogRow): AccessLogEntry => ({
  id: r.id,
  userId: r.user_id,
  userName: r.user_name,
  userEmail: r.user_email,
  method: r.method,
  device: r.device,
  ip: r.ip,
  loginAt: r.login_at,
  logoutAt: r.logout_at,
  logoutReason: r.logout_reason,
});

export const toDeviceSession = (
  r: SessionRow & { user_name?: string; user_email?: string },
  currentId?: number,
): DeviceSession => ({
  id: r.id,
  device: r.device,
  ip: r.ip,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  expiresAt: r.expires_at,
  current: r.id === currentId,
  ...(r.user_name !== undefined
    ? { userId: r.user_id, userName: r.user_name, userEmail: r.user_email ?? null }
    : {}),
});

export const toSyncRun = (r: SyncRunRow): SyncRun => ({
  id: r.id,
  source: r.source,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  stats: r.stats_json ? (JSON.parse(r.stats_json) as SyncRun['stats']) : null,
  error: r.error,
});

export type { AdminUserRow };
