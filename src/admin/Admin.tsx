import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { api, post } from '../lib/api';
import { LangToggle, Logo } from '../site/Layout';
import { useCurrency } from '../site/settings';
import { Page } from '../ui';
import { errText } from './errors';

type Overview = {
  users: number; admins: number; clients: number; paid: number; due: number; activeServices: number; openTickets: number; newLeads: number; pendingOrders?: number;
  expiring: { id: string; name: string; expires: string; owner: string }[]; recent: { at: string; by: string; action: string; detail: string }[];
};

export function AdminLayout() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { mode, user, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({ tickets: 0, leads: 0, orders: 0 });
  useEffect(() => {
    if (mode !== 'server' || user?.role !== 'admin') return;
    api<Overview>('admin/overview').then((o) => setBadges({ tickets: o.openTickets, leads: o.newLeads, orders: o.pendingOrders ?? 0 })).catch(() => undefined);
  }, [mode, user, pathname]);
  if (mode === 'checking') return <div className="boot-loading" role="status">…</div>;
  if (!user) return <Navigate to="/portal/login" replace />;
  if (mode === 'demo') return <DemoNotice />;
  if (user.role !== 'admin') return <Navigate to="/portal" replace />;
  const items = [
    { to: '/admin', label: t('نظرة عامة', 'Overview'), end: true },
    { to: '/admin/users', label: t('العملاء', 'Customers') },
    { to: '/admin/domains', label: t('الدومينات', 'Domains') },
    { to: '/admin/email', label: t('الإيميلات', 'Email') },
    { to: '/admin/hosting', label: t('الاستضافة', 'Hosting') },
    { to: '/admin/websites', label: t('المواقع', 'Websites') },
    { to: '/admin/servers', label: t('السيرفرات', 'Servers') },
    { to: '/admin/orders', label: t('الطلبات', 'Orders'), badge: badges.orders },
    { to: '/admin/invoices', label: t('الفواتير', 'Invoices') },
    { to: '/admin/tickets', label: t('تذاكر الدعم', 'Tickets'), badge: badges.tickets },
    { to: '/admin/leads', label: t('طلبات التواصل', 'Leads'), badge: badges.leads },
    { to: '/admin/plans', label: t('الباقات والأسعار', 'Plans') },
    { to: '/admin/apps', label: t('التطبيقات', 'Apps') },
    { to: '/admin/pricing', label: t('أسعار الدومينات', 'TLD pricing') },
    { to: '/admin/purchases', label: t('فواتير الشراء', 'Purchases') },
    { to: '/admin/updates', label: t('التحديثات', 'Updates') },
    { to: '/admin/settings', label: t('الإعدادات', 'Settings') },
    { to: '/admin/activity', label: t('سجل النشاط', 'Activity') },
    { to: '/admin/account', label: t('حسابي', 'My account') },
  ];
  const signOut = async () => { await logout(); nav('/portal/login'); };
  return (
    <div className="portal">
      <aside className={`side on-dark${open ? ' is-open' : ''}`}>
        <Logo dark />
        <nav onClick={() => setOpen(false)}>{items.map((i) => <NavLink key={i.to} to={i.to} end={i.end}>{i.label}{i.badge ? <span className="badge-n latin">{i.badge}</span> : null}</NavLink>)}</nav>
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

export function AdminOverview() {
  const { t } = useI18n();
  const cur = useCurrency();
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Overview>('admin/overview').then(setD).catch((e) => setErr(errText(e, t))); }, [t]);
  const kpi = (to: string, label: string, v: string | number) => <Link to={to} className="card kpi" key={to + label}><span className="nt-mono">{label}</span><b className="latin">{v}</b></Link>;
  return (
    <Page title={t('نظرة عامة', 'Overview')}>
      {err && <div className="form-error">{err}</div>}
      {d && (
        <>
          <div className="grid g4 kpis">
            {kpi('/admin/users', t('العملاء', 'Clients'), d.clients)}
            {kpi('/admin/domains', t('خدمات نشطة', 'Active services'), d.activeServices)}
            {kpi('/admin/tickets', t('تذاكر مفتوحة', 'Open tickets'), d.openTickets)}
            {kpi('/admin/leads', t('طلبات جديدة', 'New leads'), d.newLeads)}
          </div>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card kpi"><span className="nt-mono">{t('مدفوع', 'Paid')}</span><b className="latin">{d.paid.toLocaleString('en-US')} <small>{cur}</small></b></div>
            <Link to="/admin/invoices" className="card kpi"><span className="nt-mono">{t('مستحق', 'Due')}</span><b className="latin">{d.due.toLocaleString('en-US')} <small>{cur}</small></b></Link>
          </div>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card"><h3>{t('دومينات قربت تنتهي', 'Domains expiring soon')}</h3>
              {d.expiring.length === 0 ? <p className="muted">{t('مفيش.', 'None.')}</p> : (
                <ul className="attn">{d.expiring.map((x) => <li key={x.id}><i className="dot bad" /> <Ltr>{x.name}</Ltr> · {x.owner} · <Ltr>{x.expires}</Ltr></li>)}</ul>)}
            </div>
            <div className="card"><h3>{t('آخر النشاط', 'Recent activity')}</h3>
              {d.recent.length === 0 ? <p className="muted">{t('مفيش نشاط لسه.', 'No activity yet.')}</p> : (
                <ul className="attn">{d.recent.map((x, i) => <li key={i}><span className="tag latin">{x.action}</span> {x.by} <span className="muted">{x.detail}</span></li>)}</ul>)}
              <p style={{ marginTop: 10 }}><Link to="/admin/activity" className="link">{t('كل السجل', 'Full log')}</Link></p>
            </div>
          </div>
        </>
      )}
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
