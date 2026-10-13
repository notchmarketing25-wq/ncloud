import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { api, ApiError, post, type User } from '../lib/api';
import { LangToggle, Logo } from '../site/Layout';

function errText(e: unknown, t: (ar: string, en: string) => string): string {
  const m = e instanceof ApiError ? e.message : '';
  const map: Record<string, [string, string]> = {
    'this email is already registered': ['الإيميل ده مسجّل قبل كده.', 'This email is already registered.'],
    'invalid email': ['الإيميل غير صحيح.', 'Invalid email.'],
    'name is required': ['الاسم مطلوب.', 'Name is required.'],
    'password must be at least 8 characters': ['كلمة السر لازم تكون 8 حروف على الأقل.', 'Password must be at least 8 characters.'],
    'there must be at least one admin': ['لازم يفضل أدمن واحد على الأقل.', 'There must be at least one admin.'],
    'you cannot delete your own account': ['ماينفعش تحذف حسابك.', 'You cannot delete your own account.'],
    'current password is wrong': ['كلمة السر الحالية غلط.', 'Current password is wrong.'],
  };
  const hit = map[m];
  return hit ? t(hit[0], hit[1]) : m || t('حصل خطأ، حاول تاني.', 'Something went wrong, try again.');
}

export function AdminLayout() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { mode, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (mode === 'checking') return null;
  if (!user) return <Navigate to="/portal/login" replace />;
  if (mode === 'demo') return <DemoNotice />;
  if (user.role !== 'admin') return <Navigate to="/portal" replace />;
  const items = [
    { to: '/admin', label: t('نظرة عامة', 'Overview'), end: true },
    { to: '/admin/users', label: t('المستخدمين', 'Users') },
    { to: '/admin/account', label: t('حسابي', 'My account') },
  ];
  const signOut = async () => { await logout(); nav('/portal/login'); };
  return (
    <div className="portal">
      <aside className={`side on-dark${open ? ' is-open' : ''}`}>
        <Logo dark />
        <nav onClick={() => setOpen(false)}>{items.map((i) => <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>)}</nav>
        <div className="side-foot">
          <LangToggle />
          <Link to="/portal" className="side-link">{t('لوحة العميل', 'Client area')}</Link>
          <Link to="/" className="side-link">{t('الموقع', 'Website')}</Link>
          <button className="side-link" onClick={signOut}>{t('خروج', 'Sign out')}</button>
        </div>
      </aside>
      <div className="portal-main">
        <div className="portal-top">
          <button className="burger" onClick={() => setOpen(!open)} aria-label={t('القائمة', 'Menu')}><span /><span /><span /></button>
          <span className="tag dark">{t('أدمن', 'Admin')}</span><span className="tag">{user.name}</span>
        </div>
        <div className="portal-body"><Outlet /></div>
      </div>
    </div>
  );
}

function DemoNotice() {
  const { t } = useI18n();
  return (
    <div className="login-page" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form">
        <h2>{t('لوحة الإدارة محتاجة سيرفر PHP', 'The admin panel needs the PHP server')}</h2>
        <p className="muted">{t('الموقع شغال حاليًا كنسخة تجريبية (من غير API). ثبّته بملف install.php على استضافة فيها PHP عشان تنشئ حساب الأدمن.', 'The site is running as a static demo (no API). Install it with install.php on a PHP host to create the admin account.')}</p>
        <Link to="/" className="btn btn-primary">{t('رجوع للموقع', 'Back to site')}</Link>
      </div>
    </div>
  );
}

function Page({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <><div className="page-head"><h1>{title}</h1>{action}</div>{children}</>;
}

export function AdminOverview() {
  const { t } = useI18n();
  const [d, setD] = useState<{ users: number; admins: number; clients: number; site: string } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<typeof d>('admin/overview').then(setD).catch((e) => setErr(errText(e, t))); }, [t]);
  return (
    <Page title={t('نظرة عامة', 'Overview')}>
      {err && <div className="form-error">{err}</div>}
      {d && (
        <div className="grid g3 kpis">
          <div className="card kpi"><span className="nt-mono">{t('كل المستخدمين', 'All users')}</span><b className="latin">{d.users}</b></div>
          <div className="card kpi"><span className="nt-mono">{t('أدمن', 'Admins')}</span><b className="latin">{d.admins}</b></div>
          <div className="card kpi"><span className="nt-mono">{t('عملاء', 'Clients')}</span><b className="latin">{d.clients}</b></div>
        </div>
      )}
      <p className="muted" style={{ marginTop: 16 }}>{t('أنشئ حسابات العملاء من صفحة المستخدمين، وهم يدخلوا من صفحة دخول العميل.', 'Create client accounts from the Users page; they sign in from the client login.')}</p>
    </Page>
  );
}

export function AdminUsers() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'client', password: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');

  const load = useCallback(() => { api<{ users: User[] }>('admin/users').then((r) => setUsers(r.users)).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(''); setOk('');
    try { await fn(); setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => post('admin/users', form), t('تم إنشاء المستخدم.', 'User created.'))) setForm({ name: '', email: '', role: 'client', password: '' });
  };

  return (
    <Page title={t('المستخدمين', 'Users')}>
      {err && <div className="form-error" role="alert">{err}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <form className="card inline-form" onSubmit={create} style={{ gridTemplateColumns: '1fr 1.2fr 120px 1fr auto', margin: '16px 0' }}>
        <div className="field"><label htmlFor="un">{t('الاسم', 'Name')}</label><input id="un" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="ue">{t('الإيميل', 'Email')}</label><input id="ue" className="input latin" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="ur">{t('النوع', 'Role')}</label><select id="ur" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="client">{t('عميل', 'Client')}</option><option value="admin">{t('أدمن', 'Admin')}</option></select></div>
        <div className="field"><label htmlFor="up">{t('كلمة السر', 'Password')}</label><input id="up" className="input latin" type="password" minLength={8} required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <button className="btn btn-accent" type="submit">{t('إضافة', 'Add')}</button>
      </form>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('الاسم', 'Name')}</th><th>{t('الإيميل', 'Email')}</th><th>{t('النوع', 'Role')}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td>{u.name}{me?.id === u.id && <> <span className="tag">{t('أنت', 'You')}</span></>}</td>
                  <td><Ltr>{u.email}</Ltr></td>
                  <td><span className={`tag ${u.role === 'admin' ? 'dark' : ''}`}>{u.role === 'admin' ? t('أدمن', 'Admin') : t('عميل', 'Client')}</span></td>
                  <td><div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(editing === u.id ? null : u.id); setNewPass(''); }}>{t('كلمة سر جديدة', 'New password')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => run(() => post('admin/user-update', { id: u.id, role: u.role === 'admin' ? 'client' : 'admin' }), t('تم تغيير النوع.', 'Role changed.'))}>{u.role === 'admin' ? t('خفّض لعميل', 'Make client') : t('اجعله أدمن', 'Make admin')}</button>
                    {me?.id !== u.id && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف المستخدم ده؟', 'Delete this user?'))) run(() => post('admin/user-delete', { id: u.id }), t('تم الحذف.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>}
                  </div></td>
                </tr>
                {editing === u.id && (
                  <tr className="edit-row"><td colSpan={4}>
                    <form className="inline-edit" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('admin/user-update', { id: u.id, password: newPass }), t('تم تغيير كلمة السر.', 'Password changed.'))) setEditing(null); }}>
                      <input className="input latin" type="password" minLength={8} required autoComplete="new-password" placeholder={t('كلمة السر الجديدة (8+)', 'New password (8+)')} value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                      <button className="btn btn-primary btn-sm" type="submit">{t('حفظ', 'Save')}</button>
                    </form>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

export function AdminAccount() {
  const { t } = useI18n();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setOk('');
    try { await post('auth/password', { current: cur, new: next }); setOk(t('تم تغيير كلمة السر.', 'Password changed.')); setCur(''); setNext(''); } catch (x) { setErr(errText(x, t)); }
  };
  return (
    <Page title={t('حسابي', 'My account')}>
      <form className="card form" onSubmit={submit} style={{ maxWidth: 480 }}>
        <h3>{t('تغيير كلمة السر', 'Change password')}</h3>
        {err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}
        <div className="field"><label htmlFor="cp">{t('الحالية', 'Current')}</label><input id="cp" className="input latin" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="field"><label htmlFor="np">{t('الجديدة (8+)', 'New (8+)')}</label><input id="np" className="input latin" type="password" minLength={8} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit">{t('حفظ', 'Save')}</button>
      </form>
    </Page>
  );
}
