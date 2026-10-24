import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, post, type User } from './lib/api';

/**
 * 'server' = the PHP API answered (real accounts).
 * 'offline' = a real website whose backend does not answer: sign-in is blocked and `problem` says why.
 */
type Mode = 'checking' | 'server' | 'offline';
/** Why the backend is not connected: no api folder, installer not finished, or the API itself is failing. */
export type Problem = 'no-api' | 'not-installed' | 'error';
type Ctx = {
  mode: Mode; problem: Problem | null; detail: string; user: User | null; impersonating: boolean;
  /** "Login as owner": the admin becomes the client (and can return). */
  impersonate: (uid: string) => Promise<void>;
  stopImpersonate: () => Promise<void>;
  login: (email: string, password: string, code?: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Re-reads the signed-in user (after sign-up). */
  refresh: () => Promise<void>;
};
const Auth = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [imp, setImp] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      let why: Problem = 'error';
      let info = '';
      try {
        try {
          const s = await api<{ installed?: boolean }>('status', undefined, { _: String(Date.now()) });
          if (!s.installed) { why = 'not-installed'; throw new Error('not installed'); }
        } catch (e) {
          if (why !== 'not-installed') {
            const st = e instanceof ApiError ? e.status : 0;
            info = e instanceof Error ? e.message : String(e);
            // A static host answers 404 (or an HTML page); PHP answering 503 means "not installed".
            why = st === 503 ? 'not-installed' : st === 404 || st === 403 || st === 405 || /^HTTP \d+$/.test(info) || e instanceof SyntaxError ? 'no-api' : 'error';
          }
          throw e;
        }
        const me = await api<{ user: User | null; impersonating?: boolean }>('auth/me');
        if (alive) { setUser(me.user); setImp(!!me.impersonating); setMode('server'); }
      } catch {
        if (!alive) return;
        setProblem(why); setDetail(info); setMode('offline');
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email: string, password: string, code?: string) => {
    if (mode !== 'server') throw new ApiError('backend offline', 0);
    const r = await post<{ user: User }>('auth/login', { email, password, ...(code ? { code } : {}) });
    setUser(r.user);
    return r.user;
  }, [mode]);

  const logout = useCallback(async () => {
    if (mode === 'server') { try { await post('auth/logout'); } catch { /* session already gone */ } }
    setUser(null); setImp(false);
  }, [mode]);

  const refresh = useCallback(async () => { try { const me = await api<{ user: User | null }>('auth/me'); setUser(me.user); } catch { /* keep the current state */ } }, []);
  const impersonate = useCallback(async (uid: string) => { const r = await post<{ user: User }>('admin/impersonate', { uid }); setUser(r.user); setImp(true); }, []);
  const stopImpersonate = useCallback(async () => { const r = await post<{ user: User }>('auth/stop-impersonate'); setUser(r.user); setImp(false); }, []);
  const value = useMemo(() => ({ mode, problem, detail, user, impersonating: imp, impersonate, stopImpersonate, login, logout, refresh }), [mode, problem, detail, user, imp, impersonate, stopImpersonate, login, logout, refresh]);
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}

export function useAuth(): Ctx {
  const v = useContext(Auth);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
