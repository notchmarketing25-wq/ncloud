import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CURRENCY } from '../data/content';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import type { Settings } from '../lib/types';

const defaults: Settings = { site: '', contactEmail: '', currency: '' };
type Ctx = { settings: Settings; refresh: () => Promise<void> };
const SiteCtx = createContext<Ctx>({ settings: defaults, refresh: async () => {} });

/** Public site settings from the API (company name, currency). Static hosts keep the defaults. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const { applyDefault } = useI18n();
  const [settings, setSettings] = useState<Settings>(defaults);
  const refresh = useCallback(async () => {
    try { setSettings({ ...defaults, ...(await api<Settings>('public/settings')) }); } catch { /* static host: keep defaults */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (settings.defaultLang) applyDefault(settings.defaultLang); }, [settings.defaultLang, applyDefault]);
  // Your brand: accent colour and the browser-tab icon follow Settings → Branding.
  const accent = settings.brand?.accent;
  const icon = settings.brand?.icon;
  useEffect(() => {
    const root = document.documentElement;
    if (accent) root.style.setProperty('--nt-volt', accent); else root.style.removeProperty('--nt-volt');
  }, [accent]);
  useEffect(() => {
    if (!icon) return;
    let l = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.href = assetUrl(icon);
  }, [icon]);
  return <SiteCtx.Provider value={{ settings, refresh }}>{children}</SiteCtx.Provider>;
}

export const useSite = () => useContext(SiteCtx);

/** An uploaded file (uploads/…) as a URL that works from any folder. */
export function assetUrl(path: string): string {
  try { return new URL(path, document.baseURI).href; } catch { return path; }
}

/** Currency label: the admin's setting wins, otherwise EGP / ج.م by language. */
export function useCurrency(): string {
  const { L } = useI18n();
  const { settings } = useSite();
  return settings.currency || L(CURRENCY);
}
