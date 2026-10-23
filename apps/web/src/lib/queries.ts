import {
  accessLogEntrySchema,
  adminOverviewSchema,
  adminUserRowSchema,
  appConfigSchema,
  assignmentSchema,
  authResponseSchema,
  deviceSessionSchema,
  goalSchema,
  lessonSchema,
  listOf,
  pageOf,
  studySessionSchema,
  subjectSchema,
  syncRunSchema,
  syncStatusSchema,
  threadSchema,
  threadWithMessagesSchema,
  topicSchema,
  weekStatsSchema,
  type AdminUserPatch,
  type GoalInput,
  type GoalPatch,
  type StudySessionInput,
  type SubjectInput,
  type SubjectPatch,
  type ThreadInput,
  type TopicInput,
  type TopicPatch,
} from '@edumind/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from './api';

/* ---------- Config ---------- */
export const useConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => api.get('/config', appConfigSchema), staleTime: Infinity });

/* ---------- Disciplinas e tópicos ---------- */
export const useSubjects = () =>
  useQuery({ queryKey: ['subjects'], queryFn: async () => (await api.get('/subjects', listOf(subjectSchema))).items });

export const useSubject = (id: number) =>
  useQuery({ queryKey: ['subject', id], queryFn: () => api.get(`/subjects/${id}`, subjectSchema) });

export function useSubjectMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['subjects'] });
    void qc.invalidateQueries({ queryKey: ['subject'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
  return {
    create: useMutation({
      mutationFn: (input: SubjectInput) => api.post('/subjects', input, subjectSchema),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: number; patch: SubjectPatch }) => api.patch(`/subjects/${id}`, patch, subjectSchema),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.del(`/subjects/${id}`),
      onSuccess: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: ['goals'] });
        void qc.invalidateQueries({ queryKey: ['threads'] });
        void qc.invalidateQueries({ queryKey: ['lessons'] });
        void qc.invalidateQueries({ queryKey: ['assignments'] });
      },
    }),
  };
}

export const useTopics = (subjectId: number) =>
  useQuery({
    queryKey: ['topics', subjectId],
    queryFn: async () => (await api.get(`/subjects/${subjectId}/topics`, listOf(topicSchema))).items,
  });

export function useTopicMutations(subjectId: number) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['topics', subjectId] });
    void qc.invalidateQueries({ queryKey: ['subjects'] });
    void qc.invalidateQueries({ queryKey: ['subject', subjectId] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
  return {
    create: useMutation({
      mutationFn: (input: TopicInput) => api.post(`/subjects/${subjectId}/topics`, input, topicSchema),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: number; patch: TopicPatch }) => api.patch(`/topics/${id}`, patch, topicSchema),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/topics/${id}`), onSuccess: refresh }),
  };
}

/* ---------- Metas, estudo e estatísticas ---------- */
export const useGoals = (date: string) =>
  useQuery({
    queryKey: ['goals', date],
    queryFn: async () => (await api.get(`/goals${qs({ date })}`, listOf(goalSchema))).items,
  });

export function useGoalMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['goals'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
  return {
    create: useMutation({ mutationFn: (i: GoalInput) => api.post('/goals', i, goalSchema), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: number; patch: GoalPatch }) => api.patch(`/goals/${id}`, patch, goalSchema),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/goals/${id}`), onSuccess: refresh }),
  };
}

export const useWeekStats = (weekStart: string, today: string) =>
  useQuery({
    queryKey: ['stats', weekStart, today],
    queryFn: () => api.get(`/stats/week${qs({ weekStart, today })}`, weekStatsSchema),
    placeholderData: keepPreviousData,
  });

export function useLogStudySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: StudySessionInput) => api.post('/study-sessions', i, studySessionSchema),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stats'] }),
  });
}

/* ---------- Aulas (scrapers) ---------- */
export const useLessons = (from: string, to: string, subjectId?: number) =>
  useQuery({
    queryKey: ['lessons', from, to, subjectId ?? null],
    queryFn: async () => (await api.get(`/lessons${qs({ from, to, subjectId })}`, listOf(lessonSchema))).items,
    placeholderData: keepPreviousData,
  });

export const useAssignments = () =>
  useQuery({ queryKey: ['assignments'], queryFn: async () => (await api.get('/assignments', listOf(assignmentSchema))).items });

export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync'],
    queryFn: () => api.get('/sync', syncStatusSchema),
    refetchInterval: (q) => (q.state.data?.current?.status === 'running' ? 1000 : false),
  });

export function useStartSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/sync', {}, syncRunSchema),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sync'] }),
  });
}

/** Depois que um sync termina, recarrega o que ele pode ter alterado. */
export function refreshAfterSync(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['subjects', 'subject', 'lessons', 'assignments', 'stats']) void qc.invalidateQueries({ queryKey: [key] });
}

/* ---------- Tutor ---------- */
export const useThreads = () =>
  useQuery({ queryKey: ['threads'], queryFn: async () => (await api.get('/chats', listOf(threadSchema))).items });

export const useThread = (id: number | null) =>
  useQuery({
    queryKey: ['thread', id],
    queryFn: () => api.get(`/chats/${id}/messages`, threadWithMessagesSchema),
    enabled: id !== null,
  });

export function useThreadMutations() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: (i: ThreadInput) => api.post('/chats', i, threadSchema),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['threads'] }),
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.del(`/chats/${id}`),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['threads'] }),
    }),
  };
}

/* ---------- Conta, acessos e dispositivos ---------- */
export const useMyAccessLog = (page: number, pageSize = 10) =>
  useQuery({
    queryKey: ['me', 'access', page],
    queryFn: () => api.get(`/me/access-log${qs({ limit: pageSize, offset: page * pageSize })}`, pageOf(accessLogEntrySchema)),
    placeholderData: keepPreviousData,
  });

export const useMySessions = () =>
  useQuery({ queryKey: ['me', 'sessions'], queryFn: async () => (await api.get('/me/sessions', listOf(deviceSessionSchema))).items });

export function useRevokeMySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/me/sessions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
      void qc.invalidateQueries({ queryKey: ['me', 'access'] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; level?: 'medio' | 'superior' | 'concurso'; weeklyGoalMinutes?: number }) =>
      api.patch('/me', patch, authResponseSchema),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data.user);
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/* ---------- Admin ---------- */
export const useAdminOverview = () =>
  useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api.get('/admin/overview', adminOverviewSchema) });

export const useAdminUsers = (q: string, page: number, pageSize = 20) =>
  useQuery({
    queryKey: ['admin', 'users', q, page],
    queryFn: () => api.get(`/admin/users${qs({ q, limit: pageSize, offset: page * pageSize })}`, pageOf(adminUserRowSchema)),
    placeholderData: keepPreviousData,
  });

export function useAdminUserMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  return {
    patch: useMutation({
      mutationFn: ({ id, patch }: { id: number; patch: AdminUserPatch }) => api.patch(`/admin/users/${id}`, patch, adminUserRowSchema),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/admin/users/${id}`), onSuccess: refresh }),
  };
}

export interface AccessLogFilters {
  q: string;
  userId?: number;
  from: string;
  to: string;
}

export const accessLogQuery = (f: AccessLogFilters) => ({
  q: f.q || undefined,
  userId: f.userId,
  from: f.from || undefined,
  to: f.to || undefined,
});

export const useAdminAccessLogs = (f: AccessLogFilters, page: number, pageSize = 20) =>
  useQuery({
    queryKey: ['admin', 'logs', f, page],
    queryFn: () =>
      api.get(`/admin/access-logs${qs({ ...accessLogQuery(f), limit: pageSize, offset: page * pageSize })}`, pageOf(accessLogEntrySchema)),
    placeholderData: keepPreviousData,
  });

export const useAdminSessions = () =>
  useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => api.get('/admin/sessions?limit=100', pageOf(deviceSessionSchema)),
    refetchInterval: 15_000,
  });

export function useAdminRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/admin/sessions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
