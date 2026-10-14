import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { api, type User } from '../lib/api';
import { errText } from './errors';

export type Item = { id: string; uid: string; [k: string]: unknown };
export type AllData = { users: (User & { phone?: string; company?: string; source?: string })[]; items: Record<string, Item[]>; tickets: { id: string; uid: string; subject: string; status: string; updated: string }[] };

export const PROVIDERS = ['hostinger', 'namecheap', 'resellerclub'];
export const STATUS: [string, string, string][] = [['active', 'نشط', 'Active'], ['pending', 'قيد التفعيل', 'Pending'], ['expiring', 'قرب ينتهي', 'Expiring'], ['stopped', 'متوقف', 'Stopped']];
export const DNS_PULL = ['hostinger', 'namecheap', 'resellerclub'];
export const DNS_PUSH = ['hostinger', 'namecheap'];

/** The whole account in one request: every detail page reads from it and reloads after a change. */
export function useAll() {
  const { t } = useI18n();
  const [all, setAll] = useState<AllData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api<AllData>('admin/all').then(setAll).catch((e) => setError(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  return { all, error, load };
}

export const under = (host: unknown, name: unknown) => { const h = String(host ?? '').toLowerCase(), n = String(name ?? '').toLowerCase(); return n !== '' && (h === n || h.endsWith('.' + n)); };
export const gb = (n: unknown) => `${Math.round(Number(n ?? 0) * 100) / 100} GB`;
export const pctUsed = (it: Item) => (Number(it.diskGb) > 0 ? (Number(it.usedGb) / Number(it.diskGb)) * 100 : 0);
export const num = (v: unknown) => Number(v ?? 0);

export function Notice({ err, ok }: { err: string; ok: string }) {
  return <>{err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}</>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string, number?][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs tabs-bar" role="tablist">
      {tabs.map(([k, label, n]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}{n !== undefined && <> <span className="latin">({n})</span></>}</button>)}
    </div>
  );
}

export function Strip({ items }: { items: [string, ReactNode][] }) {
  return <div className="stat-strip">{items.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>;
}

export function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="side-card"><h3>{title}</h3>{children}</div>;
}

export function ClientLine({ users, uid }: { users: AllData['users']; uid: string }) {
  const { t } = useI18n();
  const u = users.find((x) => x.id === uid);
  return u ? <Link className="link" to={`/admin/users/${u.id}`}>{u.name}</Link> : <span className="muted">{t('بدون عميل', 'No client')}</span>;
}

export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export const LtrText = ({ children }: { children: ReactNode }) => <Ltr>{children}</Ltr>;
