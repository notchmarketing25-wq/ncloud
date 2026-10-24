import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, post, type User } from './lib/api';

/**
 * 'server' = the PHP API answered (real accounts).
 * 'offline' = a real website whose backend does not answer: sign-in is blocked and `problem` says why.
 * 'demo' = only on localhost / a preview (or with ?demo): any login works and data is local.
 */
type Mode = 'checking' | 'server' | 'demo' | 'offline';
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
const DEMO_KEY = 'ncloud-auth';
const demoUser: User = { id: 'demo', name: 'Demo', email: 'demo@example.com', role: 'client' };
/** A demo is only offered where nobody can mistake it for the real site. */
const demoAllowed = () => {
  try {
    const h = window.location.hostname;
    return import.meta.env.DEV && (h === 'localhost' || h === '127.0.0.1');
  } catch { return false; }
};
const demoOn = () => { try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; } };

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
        if (demoAllowed()) { setUser(demoOn() ? demoUser : null); setMode('demo'); }
        else { setProblem(why); setDetail(info); setMode('offline'); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email: string, password: string, code?: string) => {
    if (mode === 'offline') throw new ApiError('backend offline', 0);
    if (mode === 'server') {
      const r = await post<{ user: User }>('auth/login', { email, password, ...(code ? { code } : {}) });
      setUser(r.user);
      return r.user;
    }
    try { localStorage.setItem(DEMO_KEY, '1'); } catch { /* ignore */ }
    setUser(demoUser);
    return demoUser;
  }, [mode]);

  const logout = useCallback(async () => {
    if (mode === 'server') { try { await post('auth/logout'); } catch { /* session already gone */ } }
    try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
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
