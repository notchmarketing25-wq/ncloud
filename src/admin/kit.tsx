import { TechIcon } from '../site/svc';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const st = String(item.status);
  // The menu is drawn on <body> (fixed), so a table card with overflow:hidden can never clip it.
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = btn.current?.getBoundingClientRect(); if (!r) return; const w = 210; const rtl = document.documentElement.dir === 'rtl'; const left = Math.min(Math.max(8, rtl ? r.left : r.right - w), window.innerWidth - w - 8); const h = 200; const top = r.bottom + h > window.innerHeight ? Math.max(8, r.top - h) : r.bottom + 4; setPos({ top, left }); };
    place(); const close = () => setOpen(false);
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  const set = (status: string, msg: string) => { setOpen(false); void run(() => api('admin/item-save', { item: { ...item, status } }, { res }), msg); };
  return (
    <span className="menu-wrap" onClick={(e) => e.stopPropagation()}>
      <button ref={btn} className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} aria-label={t('خيارات', 'Options')} onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)}>⋮</button>
      {open && pos && createPortal(
        <div className="menu-pop menu-fixed" role="menu" style={{ top: pos.top, left: pos.left }}>
          {st !== 'active' && st !== 'archived' && <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('active', t('اتفعّل.', 'Activated.'))}>{t('تفعيل', 'Activate')}</button>}
          {st === 'active' && <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('stopped', t('اتوقف.', 'Suspended.'))}>{t('إيقاف', 'Suspend')}</button>}
          {st !== 'archived' ? <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('archived', t('اتأرشف وبقى مخفي عن العميل.', 'Archived and hidden from the client.'))}>{t('أرشفة (إخفاء عن العميل)', 'Archive (hide from client)')}</button>
            : <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => set('active', t('رجع من الأرشيف.', 'Restored from the archive.'))}>{t('استرجاع من الأرشيف', 'Restore from archive')}</button>}
          <button role="menuitem" className="danger" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); if (window.confirm(t('تحذف نهائيًا؟ لا يمكن التراجع.', 'Delete permanently? This cannot be undone.'))) void run(() => api('admin/item-delete', { id: item.id }, { res }), t('اتحذف.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>
        </div>, document.body)}
    </span>
  );
}

export const Field = ({ id, label, children, wide }: { id: string; label: string; children: ReactNode; wide?: boolean }) => <div className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}><label htmlFor={id}>{label}</label>{children}</div>;

/** What the provider itself reports about a site or server (kept when it was imported from Apps). */
export function ProviderCard({ item, extra }: { item: Item; extra?: [string, ReactNode][] }) {
  const { t } = useI18n();
  const d = (item.providerData ?? {}) as Record<string, string>;
  const rows: [string, ReactNode][] = [
    ...(item.provider ? [[t('المزوّد', 'Provider'), String(item.provider)] as [string, ReactNode]] : []),
    ...(item.appType ? [[t('نوع الموقع', 'Site type'), <TechIcon type={item.appType} label />] as [string, ReactNode]] : []),
    ...(item.dataCenter ? [[t('مركز البيانات', 'Data center'), String(item.dataCenter)] as [string, ReactNode]] : []),
    ...(item.username ? [[t('اسم المستخدم', 'Username'), <span className="latin">{String(item.username)}</span>] as [string, ReactNode]] : []),
    ...(extra ?? []),
  ];
  const keys = Object.keys(d);
  if (rows.length === 0 && keys.length === 0) return null;
  return (
    <SideCard title={t('تفاصيل المزوّد', 'Provider details')}>
      {rows.map(([k, v]) => <p key={k} style={{ margin: '4px 0' }}><span className="muted">{k}:</span> {v}</p>)}
      {keys.length > 0 && <details><summary className="muted">{t('كل البيانات من المزوّد', 'Everything the provider returned')}</summary><dl className="kv-list">{keys.map((k) => <div key={k}><dt className="latin">{k}</dt><dd className="latin">{d[k]}</dd></div>)}</dl></details>}
    </SideCard>
  );
}
