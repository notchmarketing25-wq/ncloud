import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';
export type Bi = { ar: string; en: string };

type Ctx = { lang: Lang; dir: 'rtl' | 'ltr'; setLang: (l: Lang) => void; applyDefault: (l: Lang) => void; t: (ar: string, en: string) => string; L: (b: Bi) => string };
const I18n = createContext<Ctx | null>(null);

const KEY = 'ncloud-lang';
function initial(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'ar' || s === 'en') return s;
  } catch { /* storage can be blocked */ }
  return 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  /** A visitor's own choice is remembered; the site's default language (Settings → General) only applies until they choose. */
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }, []);
  const applyDefault = useCallback((l: Lang) => { try { if (localStorage.getItem(KEY)) return; } catch { /* ignore */ } setLangState(l); }, []);
  const value = useMemo<Ctx>(() => ({
    lang, dir, setLang, applyDefault,
    t: (ar, en) => (lang === 'ar' ? ar : en),
    L: (b) => b[lang],
  }), [lang, dir, setLang, applyDefault]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n(): Ctx {
  const v = useContext(I18n);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}

/** Technical strings (domains, IPs, DNS values) stay left-to-right inside Arabic text. */
export function Ltr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <bdi className={`latin ${className}`} dir="ltr">{children}</bdi>;
}
