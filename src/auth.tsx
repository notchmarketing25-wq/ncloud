import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post, type User } from './lib/api';

/** 'server' = the PHP API answered (real accounts); 'demo' = static hosting, any login works and data is local. */
type Mode = 'checking' | 'server' | 'demo';
type Ctx = {
  mode: Mode; user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};
const Auth = createContext<Ctx | null>(null);
const DEMO_KEY = 'ncloud-auth';
const demoUser: User = { id: 'demo', name: 'Demo', email: 'demo@example.com', role: 'client' };
const demoOn = () => { try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api<{ installed?: boolean }>('status');
        if (!s.installed) throw new Error('not installed');
        const me = await api<{ user: User | null }>('auth/me');
        if (alive) { setUser(me.user); setMode('server'); }
      } catch {
        if (alive) { setUser(demoOn() ? demoUser : null); setMode('demo'); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (mode === 'server') {
      const r = await post<{ user: User }>('auth/login', { email, password });
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
    setUser(null);
  }, [mode]);

  const value = useMemo(() => ({ mode, user, login, logout }), [mode, user, login, logout]);
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}

export function useAuth(): Ctx {
  const v = useContext(Auth);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
