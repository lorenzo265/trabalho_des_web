import {
  authResponseSchema,
  type LoginInput,
  type RegisterInput,
  type User,
} from '@edumind/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get('/me', authResponseSchema)).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  /** Remove dados de outro usuário do cache (login/logout/sessão expirada). */
  const resetCache = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' && q.queryKey[0] !== 'me' });
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      resetCache();
      qc.setQueryData(['me'], null);
    });
    return () => setUnauthorizedHandler(null);
  }, [qc, resetCache]);

  const value = useMemo<AuthState>(
    () => ({
      user: me.data ?? null,
      loading: me.isLoading,
      async login(input) {
        const res = await api.post('/auth/login', input, authResponseSchema);
        resetCache();
        qc.setQueryData(['me'], res.user);
      },
      async register(input) {
        const res = await api.post('/auth/register', input, authResponseSchema);
        resetCache();
        qc.setQueryData(['me'], res.user);
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } finally {
          resetCache();
          qc.setQueryData(['me'], null);
        }
      },
    }),
    [me.data, me.isLoading, qc, resetCache],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

/** Usuário autenticado (só dentro de rotas protegidas). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser sem sessão');
  return user;
}
