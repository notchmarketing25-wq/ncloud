import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CURRENCY } from '../data/content';
import { Ltr, useI18n } from '../i18n';
import { LangToggle, Logo } from '../site/Layout';
import { Ph } from '../site/parts';
import { dnsRecords, domains, hosting, invoices, mailboxes, servers, tickets, type Status } from './data';

const KEY = 'ncloud-auth';
const authed = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/* ───────── Login (demo only: any input signs in) ───────── */
export function Login() {
  const { t } = useI18n();
  const nav = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    nav('/portal');
  };
  return (
    <div className="login-page">
      <div className="login-side on-dark">
        <Logo dark />
        <div>
          <h1>{t('لوحة العميل', 'Client area')}</h1>
          <p>{t('دومينات، إيميلات، استضافة وسيرفرات في لوحة واحدة.', 'Domains, email, hosting and servers in one panel.')}</p>
        </div>
        <span className="tag volt latin">DEMO</span>
      </div>
      <form className="login-form" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangToggle /></div>
        <h2>{t('تسجيل الدخول', 'Sign in')}</h2>
        <p className="muted">{t('نسخة تجريبية: أي بيانات هتدخلك.', 'Demo build: any details will sign you in.')}</p>
        <div className="field"><label htmlFor="em">{t('الإيميل', 'Email')}</label><input id="em" className="input latin" type="email" placeholder="you@company.com" /></div>
        <div className="field"><label htmlFor="pw">{t('كلمة السر', 'Password')}</label><input id="pw" className="input latin" type="password" /></div>
        <button className="btn btn-primary" type="submit">{t('دخول', 'Sign in')}</button>
        <Link to="/" className="muted back">{t('← رجوع للموقع', '← Back to site')}</Link>
      </form>
    </div>
  );
}

/* ───────── Shell ───────── */
export function PortalLayout() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!authed()) return <Navigate to="/portal/login" replace />;
  const items = [
    { to: '/portal', label: t('نظرة عامة', 'Overview'), end: true },
    { to: '/portal/domains', label: t('الدومينات', 'Domains') },
    { to: '/portal/email', label: t('الإيميلات', 'Email') },
    { to: '/portal/hosting', label: t('الاستضافة', 'Hosting') },
    { to: '/portal/servers', label: t('السيرفرات', 'Servers') },
    { to: '/portal/billing', label: t('الفواتير', 'Billing') },
    { to: '/portal/support', label: t('الدعم', 'Support') },
  ];
  const logout = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } nav('/portal/login'); };
  return (
    <div className="portal">
      <aside className={`side on-dark${open ? ' is-open' : ''}`}>
        <Logo dark />
        <nav onClick={() => setOpen(false)}>
          {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>)}
        </nav>
        <div className="side-foot">
          <LangToggle />
          <Link to="/" className="side-link">{t('الموقع', 'Website')}</Link>
          <button className="side-link" onClick={logout}>{t('خروج', 'Sign out')}</button>
        </div>
      </aside>
      <div className="portal-main">
        <div className="portal-top">
          <button className="burger" onClick={() => setOpen(!open)} aria-label={t('القائمة', 'Menu')}><span /><span /><span /></button>
          <span className="tag"><span className="dot pulse" /> <span className="latin">ACME TRADING</span></span>
          <span className="tag ph-tag"><Ph /> {t('بيانات تجريبية', 'demo data')}</span>
        </div>
        <div className="portal-body"><Outlet /></div>
      </div>
    </div>
  );
}

/* ───────── Helpers ───────── */
function Page({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <><div className="page-head"><h1>{title}</h1>{action}</div>{children}</>;
}
function StatusTag({ s }: { s: Status }) {
  const { t } = useI18n();
  const map: Record<Status, [string, string, string]> = {
    active: ['ok', 'نشط', 'Active'], pending: ['warn', 'قيد التفعيل', 'Pending'], expiring: ['bad', 'قرب ينتهي', 'Expiring'], stopped: ['', 'متوقف', 'Stopped'],
  };
  const [cls, ar, en] = map[s];
  return <span className={`tag ${cls}`}>{s === 'active' && <i className="dot" />}{t(ar, en)}</span>;
}
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap"><table className="tbl"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
  );
}
function Meter({ value, tone }: { value: number; tone?: 'warn' }) {
  return <div className={`meter${tone ? ' ' + tone : ''}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, value)}%` }} /></div>;
}

/* ───────── Pages ───────── */
export function Overview() {
  const { t, L } = useI18n();
  const due = invoices.filter((i) => i.status === 'due');
  const kpis = [
    { to: '/portal/domains', label: t('دومينات', 'Domains'), v: domains.length },
    { to: '/portal/email', label: t('إيميلات', 'Mailboxes'), v: mailboxes.length },
    { to: '/portal/hosting', label: t('استضافة', 'Hosting'), v: hosting.length },
    { to: '/portal/servers', label: t('سيرفرات', 'Servers'), v: servers.length },
  ];
  return (
    <Page title={t('نظرة عامة', 'Overview')}>
      <div className="grid g4 kpis">
        {kpis.map((k) => <Link to={k.to} className="card kpi" key={k.to}><span className="nt-mono">{k.label}</span><b className="latin">{k.v}</b></Link>)}
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h3>{t('محتاج انتباه', 'Needs attention')}</h3>
          <ul className="attn">
            {domains.filter((d) => d.status === 'expiring').map((d) => <li key={d.name}><i className="dot bad" /> <Ltr>{d.name}</Ltr> {t('بينتهي في', 'expires')} <Ltr>{d.expires}</Ltr></li>)}
            {due.map((i) => <li key={i.id}><i className="dot bad" /> {t('فاتورة مستحقة', 'Invoice due')}: <Ltr>{i.id}</Ltr> · {L(i.item)}</li>)}
            {servers.filter((s) => s.status === 'stopped').map((s) => <li key={s.name}><i className="dot idle" /> <Ltr>{s.name}</Ltr> {t('متوقف', 'is stopped')}</li>)}
          </ul>
        </div>
        <div className="card"><h3>{t('حالة الخدمات', 'Service health')}</h3>
          <p className="status-line-d"><i className="dot pulse" /> <span className="latin">ALL SYSTEMS OPERATIONAL</span></p>
          <p className="muted">{t('آخر فحص: دلوقتي (تجريبي)', 'Last check: just now (demo)')}</p>
        </div>
      </div>
    </Page>
  );
}

export function PortalDomains() {
  const { t } = useI18n();
  const [sel, setSel] = useState(domains[0].name);
  return (
    <Page title={t('الدومينات', 'Domains')} action={<Link to="/domains" className="btn btn-primary btn-sm">{t('+ دومين جديد', '+ New domain')}</Link>}>
      <Table head={[t('الدومين', 'Domain'), t('الحالة', 'Status'), t('ينتهي', 'Expires'), t('تجديد تلقائي', 'Auto-renew'), '']}>
        {domains.map((d) => (
          <tr key={d.name}>
            <td><Ltr>{d.name}</Ltr></td><td><StatusTag s={d.status} /></td><td><Ltr>{d.expires}</Ltr></td>
            <td>{d.autoRenew ? t('مفعّل', 'On') : t('مقفول', 'Off')}</td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => setSel(d.name)}>{t('إدارة DNS', 'Manage DNS')}</button></td>
          </tr>
        ))}
      </Table>
      <h2 className="sub">{t('سجلات DNS', 'DNS records')} · <Ltr>{sel}</Ltr></h2>
      <div className="dns">
        <div className="dns-row dns-head"><span>TYPE</span><span>HOST</span><span>VALUE</span><span>TTL</span></div>
        {dnsRecords.map((r, i) => <div className="dns-row" key={i}><span>{r.type}</span><span>{r.host}</span><span>{r.value}</span><span>{r.ttl}</span></div>)}
      </div>
    </Page>
  );
}

export function PortalEmail() {
  const { t } = useI18n();
  return (
    <Page title={t('الإيميلات', 'Email')} action={<button className="btn btn-primary btn-sm">{t('+ صندوق جديد', '+ New mailbox')}</button>}>
      <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage'), t('الحالة', 'Status')]}>
        {mailboxes.map((m) => (
          <tr key={m.address}>
            <td><Ltr>{m.address}</Ltr></td>
            <td className="usage"><Meter value={(m.usedGb / m.quotaGb) * 100} /><span className="latin">{m.usedGb} / {m.quotaGb} GB</span></td>
            <td><StatusTag s={m.status} /></td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}

export function PortalHosting() {
  const { t } = useI18n();
  return (
    <Page title={t('الاستضافة', 'Hosting')}>
      <Table head={[t('الخطة', 'Plan'), t('الدومين', 'Domain'), t('المساحة', 'Disk'), t('الحالة', 'Status'), '']}>
        {hosting.map((h) => (
          <tr key={h.domain}>
            <td>{h.plan}</td><td><Ltr>{h.domain}</Ltr></td>
            <td className="usage"><Meter value={(h.usedGb / h.diskGb) * 100} /><span className="latin">{h.usedGb} / {h.diskGb} GB</span></td>
            <td><StatusTag s={h.status} /></td>
            <td><button className="btn btn-ghost btn-sm">{t('فتح اللوحة', 'Open panel')}</button></td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}

export function PortalServers() {
  const { t } = useI18n();
  return (
    <Page title={t('السيرفرات', 'Servers')} action={<button className="btn btn-primary btn-sm">{t('+ سيرفر جديد', '+ New server')}</button>}>
      <div className="grid g3">
        {servers.map((s) => (
          <div className="card" key={s.name}>
            <div className="srv-head"><h3 className="latin">{s.name}</h3><StatusTag s={s.status} /></div>
            <p className="latin muted">{s.ip}</p><p className="latin spec">{s.spec}</p>
            <div className="srv-m"><span className="nt-mono">CPU</span><Meter value={s.cpu} /><span className="latin">{s.cpu}%</span></div>
            <div className="srv-m"><span className="nt-mono">RAM</span><Meter value={s.ram} tone={s.ram > 80 ? 'warn' : undefined} /><span className="latin">{s.ram}%</span></div>
            <div className="srv-btns"><button className="btn btn-ghost btn-sm">{s.status === 'stopped' ? t('تشغيل', 'Start') : t('إعادة تشغيل', 'Reboot')}</button><button className="btn btn-ghost btn-sm">Snapshot</button></div>
          </div>
        ))}
      </div>
    </Page>
  );
}

export function PortalBilling() {
  const { t, L } = useI18n();
  return (
    <Page title={t('الفواتير', 'Billing')}>
      <Table head={[t('الرقم', 'No.'), t('التاريخ', 'Date'), t('البند', 'Item'), t('المبلغ', 'Amount'), t('الحالة', 'Status'), '']}>
        {invoices.map((i) => (
          <tr key={i.id}>
            <td><Ltr>{i.id}</Ltr></td><td><Ltr>{i.date}</Ltr></td><td>{L(i.item)}</td>
            <td><b className="latin">{i.amount}</b> {L(CURRENCY)} <Ph /></td>
            <td><span className={`tag ${i.status === 'paid' ? 'ok' : 'bad'}`}>{i.status === 'paid' ? t('مدفوعة', 'Paid') : t('مستحقة', 'Due')}</span></td>
            <td>{i.status === 'due' && <button className="btn btn-accent btn-sm">{t('ادفع', 'Pay')}</button>}</td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}

export function PortalSupport() {
  const { t, L } = useI18n();
  return (
    <Page title={t('الدعم', 'Support')} action={<button className="btn btn-primary btn-sm">{t('+ تذكرة جديدة', '+ New ticket')}</button>}>
      <Table head={[t('الرقم', 'No.'), t('الموضوع', 'Subject'), t('آخر تحديث', 'Updated'), t('الحالة', 'Status')]}>
        {tickets.map((k) => (
          <tr key={k.id}>
            <td><Ltr>{k.id}</Ltr></td><td>{L(k.subject)}</td><td><Ltr>{k.updated}</Ltr></td>
            <td><span className={`tag ${k.status === 'closed' ? '' : k.status === 'answered' ? 'ok' : 'warn'}`}>{k.status === 'closed' ? t('مغلقة', 'Closed') : k.status === 'answered' ? t('تم الرد', 'Answered') : t('مفتوحة', 'Open')}</span></td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}
