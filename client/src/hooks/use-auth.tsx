import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser, LoginResponse } from '@shared/types';
import { api, setUnauthorizedHandler, tokenStore } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { connectSocket, disconnectSocket } from '@/lib/socket';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Instantly signs in as a demo account (demo mode role switcher). */
  switchToAccount: (userId: number) => Promise<AuthUser>;
  /** Applies a LoginResponse returned by the server (e.g. after a demo reset). */
  applySession: (session: LoginResponse) => AuthUser;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<AuthUser | null>(null);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    disconnectSocket();
    queryClient.clear();
    setUserState(null);
    setStatus('anonymous');
  }, []);

  const applySession = useCallback((session: LoginResponse) => {
    tokenStore.set(session.token);
    queryClient.clear();
    connectSocket(session.token);
    setUserState(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  // Restore the session on first load.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setStatus('anonymous');
      return;
    }
    let cancelled = false;
    api
      .get<AuthUser>('/auth/me')
      .then((me) => {
        if (cancelled) return;
        tokenStore.set(token);
        connectSocket(token);
        setUserState(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession());
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.post<LoginResponse>('/auth/login', { email, password });
      return applySession(session);
    },
    [applySession],
  );

  const switchToAccount = useCallback(
    async (userId: number) => {
      const session = await api.post<LoginResponse>('/auth/demo-login', { userId });
      return applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const me = await api.get<AuthUser>('/auth/me');
    setUserState(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      switchToAccount,
      applySession,
      logout,
      refreshUser,
      setUser: setUserState,
    }),
    [status, user, login, switchToAccount, applySession, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Auth state. Inside the app shell `user` is always non-null. */
export function useAuth(): AuthContextValue & { user: AuthUser } {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx as AuthContextValue & { user: AuthUser };
}

/** Auth state where the user may be signed out (login page, guards). */
export function useAuthState(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthState must be used inside <AuthProvider>');
  return ctx;
}
