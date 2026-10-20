import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { bundle as demoBundle, emailPlans, hostingPlans, sitePackages, tlds as demoTlds, vpsPlans, type Plan, type Tld } from '../data/content';
import { api } from '../lib/api';
import type { Bi } from '../i18n';

export type Category = 'hosting' | 'email' | 'vps' | 'site' | 'bundle';
export type CPlan = Plan & { per: 'month' | 'year' | 'once'; category: Category; included?: Bi[]; seats?: number };
type Ctx = { plans: CPlan[]; tlds: Tld[]; ready: boolean; live: boolean; of: (c: Category) => CPlan[] };

type ApiPlan = { id: string; category: Category; nameAr: string; nameEn?: string; price: number; per: 'month' | 'year' | 'once'; featured?: boolean; sort?: number; specs?: string; features?: string; seats?: number };

/** "ar | en" on every side; a missing English half falls back to the Arabic one. */
const bi = (s: string): Bi => { const [ar, en] = s.split('|').map((x) => x.trim()); return { ar: ar ?? '', en: en || ar || '' }; };
const lines = (s?: string) => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
/** A spec line is "label : value", each half optionally "ar | en". */
const spec = (l: string) => { const i = l.indexOf(':'); return i < 0 ? { label: bi(l), value: bi('') } : { label: bi(l.slice(0, i)), value: bi(l.slice(i + 1)) }; };

export function fromApi(p: ApiPlan): CPlan {
  const features = lines(p.features).map(bi);
  return { id: p.id, category: p.category, per: p.per, name: { ar: p.nameAr, en: p.nameEn || p.nameAr }, price: p.price, featured: !!p.featured, specs: lines(p.specs).map(spec), features, included: features, seats: p.seats };
}

const per = (c: Category): CPlan['per'] => (c === 'site' ? 'once' : c === 'bundle' ? 'year' : 'month');
const demo: CPlan[] = [
  ...hostingPlans.map((p) => ({ ...p, category: 'hosting' as const, per: per('hosting') })),
  ...emailPlans.map((p) => ({ ...p, category: 'email' as const, per: per('email') })),
  ...vpsPlans.map((p) => ({ ...p, category: 'vps' as const, per: per('vps') })),
  ...sitePackages.map((p) => ({ ...p, category: 'site' as const, per: per('site') })),
  { id: 'bundle', category: 'bundle', per: 'year', name: demoBundle.title, price: demoBundle.price, specs: [], features: demoBundle.items, included: demoBundle.items },
];

const Cat = createContext<Ctx>({ plans: [], tlds: [], ready: false, live: false, of: () => [] });
export const useCatalog = () => useContext(Cat);

/** What the website sells. With the backend running it is exactly what you set in Admin → Plans and TLD pricing; the demo list only exists in local previews. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { mode } = useAuth();
  const [state, setState] = useState<{ plans: CPlan[]; tlds: Tld[]; ready: boolean }>({ plans: [], tlds: [], ready: false });
  useEffect(() => {
    if (mode === 'checking') return;
    if (mode === 'demo') { setState({ plans: demo, tlds: demoTlds, ready: true }); return; }
    if (mode === 'offline') { setState({ plans: [], tlds: [], ready: true }); return; }
    api<{ plans: ApiPlan[]; tlds: Tld[] }>('public/catalog')
      .then((r) => setState({ plans: r.plans.map(fromApi), tlds: r.tlds, ready: true }))
      .catch(() => setState({ plans: [], tlds: [], ready: true }));
  }, [mode]);
  const value = useMemo<Ctx>(() => ({ ...state, live: mode === 'server', of: (c) => state.plans.filter((p) => p.category === c) }), [state, mode]);
  return <Cat.Provider value={value}>{children}</Cat.Provider>;
}
