import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';
export type Bi = { ar: string; en: string };

type Ctx = { lang: Lang; dir: 'rtl' | 'ltr'; setLang: (l: Lang) => void; t: (ar: string, en: string) => string; L: (b: Bi) => string };
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
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  }, [lang, dir]);
  const value = useMemo<Ctx>(() => ({
    lang, dir, setLang: setLangState,
    t: (ar, en) => (lang === 'ar' ? ar : en),
    L: (b) => b[lang],
  }), [lang, dir]);
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
