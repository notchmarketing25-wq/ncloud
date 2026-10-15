import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { api, type User } from '../lib/api';
import { errText } from './errors';

export type Item = { id: string; uid: string; [k: string]: unknown };
export type AllData = { users: (User & { phone?: string; company?: string; source?: string; disabled?: boolean })[]; items: Record<string, Item[]>; tickets: { id: string; uid: string; subject: string; status: string; updated: string }[] };

export const PROVIDERS = ['hostinger', 'namecheap', 'resellerclub'];
export const STATUS: [string, string, string][] = [['active', 'نشط', 'Active'], ['pending', 'قيد التفعيل', 'Pending'], ['expiring', 'قرب ينتهي', 'Expiring'], ['stopped', 'متوقف', 'Stopped'], ['archived', 'مؤرشف (مخفي عن العميل)', 'Archived (hidden from client)']];
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

/** ⋮ menu on a service row: suspend / activate / archive / delete. Archived services disappear from the client's account. */
export function StatusMenu({ res, item, run }: { res: string; item: Item; run: (fn: () => Promise<unknown>, done: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const st = String(item.status);
  const set = (status: string, msg: string) => { setOpen(false); void run(() => api('admin/item-save', { item: { ...item, status } }, { res }), msg); };
  return (
    <span className="menu-wrap" onClick={(e) => e.stopPropagation()}>
      <button className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} aria-label={t('خيارات', 'Options')} onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)}>⋮</button>
      {open && (
        <div className="menu-pop" role="menu">
          {st !== 'active' && st !== 'archived' && <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('active', t('اتفعّل.', 'Activated.'))}>{t('تفعيل', 'Activate')}</button>}
          {st === 'active' && <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('stopped', t('اتوقف.', 'Suspended.'))}>{t('إيقاف', 'Suspend')}</button>}
          {st !== 'archived' ? <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('archived', t('اتأرشف وبقى مخفي عن العميل.', 'Archived and hidden from the client.'))}>{t('أرشفة (إخفاء عن العميل)', 'Archive (hide from client)')}</button>
            : <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('active', t('رجع من الأرشيف.', 'Restored from the archive.'))}>{t('استرجاع من الأرشيف', 'Restore from archive')}</button>}
          <button role="menuitem" className="danger" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); if (window.confirm(t('تحذف نهائيًا؟ لا يمكن التراجع.', 'Delete permanently? This cannot be undone.'))) void run(() => api('admin/item-delete', { id: item.id }, { res }), t('اتحذف.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>
        </div>
      )}
    </span>
  );
}

export const Field = ({ id, label, children, wide }: { id: string; label: string; children: ReactNode; wide?: boolean }) => <div className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}><label htmlFor={id}>{label}</label>{children}</div>;
