import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CURRENCY, SHOW_PLACEHOLDER } from '../data/content';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import type { Settings } from '../lib/types';

const defaults: Settings = { site: '', contactEmail: '', placeholder: SHOW_PLACEHOLDER, currency: '' };
type Ctx = { settings: Settings; refresh: () => Promise<void> };
const SiteCtx = createContext<Ctx>({ settings: defaults, refresh: async () => {} });

/** Public site settings from the API (company name, placeholder tags on/off, currency). Static hosts keep the defaults. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const refresh = useCallback(async () => {
    try { setSettings({ ...defaults, ...(await api<Settings>('public/settings')) }); } catch { /* static host: keep defaults */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <SiteCtx.Provider value={{ settings, refresh }}>{children}</SiteCtx.Provider>;
}

export const useSite = () => useContext(SiteCtx);

/** Currency label: the admin's setting wins, otherwise EGP / ج.م by language. */
export function useCurrency(): string {
  const { L } = useI18n();
  const { settings } = useSite();
  return settings.currency || L(CURRENCY);
}
