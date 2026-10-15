import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IdentityFields } from '../portal/Identity';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { api, post, type User } from '../lib/api';
import { day, Modal, Page } from '../ui';
import { errText } from './errors';
import { usePaged } from './pager';

type Item = { id: string; uid: string; [k: string]: unknown };
type All = { users: (User & { phone?: string; company?: string; source?: string })[]; items: Record<string, Item[]>; tickets: { uid: string }[] };
type Tab = 'all' | 'clients' | 'admins' | 'new' | 'empty';
const SERVICES = ['domains', 'hosting', 'websites', 'mailboxes', 'servers'];
const WEEK = 7 * 86400000;

/** Admin → Customers: everyone who has an account, with what they own, newest first. */
export function AdminUsers() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { user: me } = useAuth();
  const [all, setAll] = useState<All | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [asc, setAsc] = useState(false);
  const [adding, setAdding] = useState(false);
  const blankForm = { name: '', email: '', role: 'client', password: '', phone: '', type: 'individual' as 'individual' | 'company', company: '', nationalId: '', commercialReg: '', taxId: '' };
  const [form, setForm] = useState(blankForm);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => { api<All>('admin/all').then(setAll).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!all) return [];
    const count = (uid: string) => SERVICES.reduce((n, r) => n + (all.items[r] ?? []).filter((x) => x.uid === uid).length, 0);
    return all.users.map((u) => ({ u, services: count(u.id), due: (all.items.invoices ?? []).filter((i) => i.uid === u.id && i.status === 'due').length, at: Date.parse(u.created ?? '') || 0 }));
  }, [all]);
  const now = Date.now();
  const counts = {
    all: rows.length, clients: rows.filter((r) => r.u.role === 'client').length, admins: rows.filter((r) => r.u.role === 'admin').length,
    new: rows.filter((r) => now - r.at < WEEK).length, empty: rows.filter((r) => r.u.role === 'client' && r.services === 0).length,
  };
  const shown = rows
    .filter((r) => (tab === 'all' ? true : tab === 'clients' ? r.u.role === 'client' : tab === 'admins' ? r.u.role === 'admin' : tab === 'new' ? now - r.at < WEEK : r.u.role === 'client' && r.services === 0))
    .filter((r) => !q.trim() || `${r.u.name} ${r.u.email} ${r.u.phone ?? ''} ${r.u.company ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (asc ? a.at - b.at : b.at - a.at));

  const { rows: pageRows, pager } = usePaged(shown, `${tab}|${q}|${asc}`);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setOk('');
    try { await post('admin/users', form); setOk(t('تم إنشاء المستخدم.', 'User created.')); setForm(blankForm); setAdding(false); load(); } catch (x) { setErr(errText(x, t)); }
  };
  const tabs: [Tab, string][] = [['all', t('الكل', 'All')], ['clients', t('عملاء', 'Clients')], ['admins', t('أدمن', 'Admins')], ['new', t('جدد (7 أيام)', 'New (7 days)')], ['empty', t('من غير خدمات', 'No services')]];
  return (
    <Page title={t('العملاء', 'Customers')} action={<button className="btn btn-accent btn-sm" onClick={() => setAdding(true)}>{t('+ إضافة عميل', '+ Add customer')}</button>}>
      {err && <div className="form-error" role="alert">{err}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <div className="stat-strip">
        <div><span>{t('كل الحسابات', 'Accounts')}</span><b className="latin">{counts.all}</b></div>
        <div><span>{t('عملاء جدد (7 أيام)', 'New clients (7 days)')}</span><b className="latin">{rows.filter((r) => r.u.role === 'client' && now - r.at < WEEK).length}</b></div>
        <div><span>{t('عندهم خدمات', 'With services')}</span><b className="latin">{counts.clients - counts.empty}</b></div>
        <div><span>{t('فواتير مستحقة', 'Invoices due')}</span><b className="latin">{rows.reduce((n, r) => n + r.due, 0)}</b></div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cust-bar">
          <div className="tabs" role="tablist">{tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label} <span className="latin">({counts[k]})</span></button>)}</div>
          <div className="row-actions" style={{ alignItems: 'center' }}>
            <input className="input" style={{ height: 40, width: 220 }} placeholder={t('ابحث بالاسم أو الإيميل أو الموبايل', 'Search name, email or phone')} aria-label={t('بحث', 'Search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-ghost btn-sm" onClick={() => setAsc(!asc)} aria-label={t('ترتيب', 'Sort')}>{asc ? '↑' : '↓'} {t('التسجيل', 'Registered')}</button>
          </div>
        </div>
        <p className="muted" style={{ padding: '0 20px' }}>{t('مرتّبين بتاريخ تسجيل الحساب.', 'Sorted by the date the account was registered.')}</p>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="tbl">
            <thead><tr><th>{t('الاسم', 'Name')}</th><th>{t('التسجيل', 'Registered')}</th><th>{t('النوع', 'Role')}</th><th>{t('الموبايل', 'Phone')}</th><th>{t('الشركة', 'Company')}</th><th>{t('الخدمات', 'Services')}</th><th>{t('الإيميل', 'Email')}</th></tr></thead>
            <tbody>
              {pageRows.map(({ u, services, at }) => (
                <tr key={u.id} className="row-link" onClick={() => nav(`/admin/users/${u.id}`)}>
                  <td><Link className="link" to={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()}>{u.name}</Link>{me?.id === u.id && <> <span className="tag">{t('أنت', 'You')}</span></>}{u.disabled && <> <span className="tag bad">{t('موقوف', 'Suspended')}</span></>}{now - at < WEEK && u.role === 'client' && <> <span className="tag volt">{t('جديد', 'New')}</span></>}</td>
                  <td><Ltr>{day(u.created ?? '') || '-'}</Ltr></td>
                  <td><span className={`tag ${u.role === 'admin' ? 'dark' : ''}`}>{u.role === 'admin' ? t('أدمن', 'Admin') : services === 0 ? t('عميل · من غير خدمات', 'Client · no services') : t('عميل', 'Client')}</span></td>
                  <td><Ltr>{u.phone || '-'}</Ltr></td><td>{u.company || '-'}</td><td className="latin">{services}</td><td><Ltr>{u.email}</Ltr></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7}><div className="empty-note">{all ? t('مفيش نتائج.', 'No results.') : '…'}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}>{pager}</div>
      </div>
      {adding && (
        <Modal title={t('إضافة عميل', 'Add customer')} onClose={() => setAdding(false)}>
          <form className="form" onSubmit={create}>
            <div className="admin-form"><IdentityFields v={form} set={(p) => setForm({ ...form, ...p })} idp="nc" /></div>
            <div className="field"><label htmlFor="un">{t('الاسم', 'Name')}</label><input id="un" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="nph">{t('الموبايل', 'Phone')}</label><input id="nph" className="input latin" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label htmlFor="ue">{t('الإيميل', 'Email')}</label><input id="ue" className="input latin" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="ur">{t('النوع', 'Role')}</label><select id="ur" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="client">{t('عميل', 'Client')}</option><option value="admin">{t('أدمن', 'Admin')}</option></select></div>
            <div className="field"><label htmlFor="up">{t('كلمة السر', 'Password')}</label><input id="up" className="input latin" type="password" minLength={8} required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <button className="btn btn-accent" type="submit">{t('إضافة', 'Add')}</button>
          </form>
        </Modal>
      )}
    </Page>
  );
}
