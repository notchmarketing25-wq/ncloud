import { useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { ApiError } from '../lib/api';
import { LangToggle, Logo } from '../site/Layout';
import { DomainSearch, Ph } from '../site/parts';
import { useCurrency } from '../site/settings';
import { day, InvoiceTag, Meter, Page, pct, StatusTag, Table, TicketTag } from '../ui';
import { PortalDataProvider, usePortal } from './PortalData';

/* ───────── Login (demo only: any input signs in) ───────── */
export function Login() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { mode, problem, detail, user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (mode !== 'checking' && user) return <Navigate to={user.role === 'admin' ? '/admin' : '/portal'} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = await login(email.trim(), password);
      nav(u.role === 'admin' ? '/admin' : '/portal');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 429 ? t('محاولات كتير. جرّب بعد 10 دقايق.', 'Too many attempts. Try again in 10 minutes.')
        : status === 401 ? t('الإيميل أو كلمة السر غلط.', 'Wrong email or password.')
        : t('تعذّر الاتصال بالسيرفر.', 'Could not reach the server.'));
    } finally { setBusy(false); }
  };
  if (mode === 'offline') return <BackendOffline problem={problem} detail={detail} />;
  return (
    <div className="login-page">
      <div className="login-side on-dark">
        <Logo dark />
        <div>
          <h1>{t('لوحة العميل', 'Client area')}</h1>
          <p>{t('دومينات، إيميلات، استضافة وسيرفرات في لوحة واحدة.', 'Domains, email, hosting and servers in one panel.')}</p>
        </div>
        {mode === 'demo' && <span className="tag volt latin">DEMO</span>}
      </div>
      <form className="login-form" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangToggle /></div>
        <h2>{t('تسجيل الدخول', 'Sign in')}</h2>
        {mode === 'demo' && <p className="muted">{t('نسخة تجريبية (من غير سيرفر): أي بيانات هتدخلك.', 'Demo build (no server): any details will sign you in.')}</p>}
        <div className="field"><label htmlFor="em">{t('الإيميل', 'Email')}</label><input id="em" className="input latin" type="email" autoComplete="username" required={mode === 'server'} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
        <div className="field"><label htmlFor="pw">{t('كلمة السر', 'Password')}</label><input id="pw" className="input latin" type="password" autoComplete="current-password" required={mode === 'server'} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || mode === 'checking'}>{busy ? '…' : t('دخول', 'Sign in')}</button>
        <Link to="/" className="muted back">{t('← رجوع للموقع', '← Back to site')}</Link>
      </form>
    </div>
  );
}

/** Shown instead of a fake sign-in when the site is live but its PHP backend does not answer. */
function BackendOffline({ problem, detail }: { problem: 'no-api' | 'not-installed' | 'error' | null; detail: string }) {
  const { t } = useI18n();
  const msg = problem === 'not-installed'
    ? [t('الباك إند موجود لكن التثبيت ما اكتملش (مفيش حساب أدمن).', 'The backend is there but the installation did not finish (no admin account).'), t('افتح install.php من نفس الفولدر وكمّل خطوات التثبيت.', 'Open install.php in this same folder and finish the setup.')]
    : problem === 'no-api'
      ? [t('الموقع اترفع لكن مجلد الـ API (باك إند PHP) مش موجود أو مش بيشتغل على الاستضافة دي.', 'The site was uploaded but the API folder (the PHP backend) is missing or not running on this host.'), t('ارفع ملف install.php بس (مش ncloud-site.zip) في الفولدر ده وافتحه من المتصفح: هو اللي بينشئ الـ API وحساب الأدمن.', 'Upload install.php only (not ncloud-site.zip) to this folder and open it in the browser: it creates the API and the admin account.')]
      : [t('الباك إند موجود لكنه بيرجّع خطأ.', 'The backend is there but returns an error.'), t('تأكد إن إصدار PHP 7.0 أو أحدث، وإن مجلد api/data قابل للكتابة (755).', 'Make sure PHP is 7.0 or newer and the api/data folder is writable (755).')];
  return (
    <div className="login-page" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form">
        <h2>{t('الباك إند مش متصل', 'The backend is not connected')}</h2>
        <div className="form-error" role="alert">{msg[0]}</div>
        <p className="muted">{msg[1]}</p>
        <p className="muted latin" dir="ltr">{t('للتأكد افتح: ', 'To check, open: ')}<a href="./api/index.php?r=status" target="_blank" rel="noreferrer">api/index.php?r=status</a> → {'{"installed":true}'}{detail ? ` (${detail})` : ''}</p>
        <Link to="/" className="btn btn-primary">{t('رجوع للموقع', 'Back to site')}</Link>
      </div>
    </div>
  );
}

/* ───────── Shell ───────── */
export function PortalLayout() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { mode, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (mode === 'checking') return null;
  if (!user) return <Navigate to="/portal/login" replace />;
  const items = [
    { to: '/portal', label: t('نظرة عامة', 'Overview'), end: true },
    { to: '/portal/domains', label: t('الدومينات', 'Domains') },
    { to: '/portal/email', label: t('الإيميلات', 'Email') },
    { to: '/portal/hosting', label: t('الاستضافة', 'Hosting') },
    { to: '/portal/servers', label: t('السيرفرات', 'Servers') },
    { to: '/portal/billing', label: t('الفواتير', 'Billing') },
    { to: '/portal/support', label: t('الدعم', 'Support') },
  ];
  const signOut = async () => { await logout(); nav('/portal/login'); };
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
          {user.role === 'admin' && mode === 'server' && <Link to="/admin" className="side-link">{t('لوحة الإدارة', 'Admin panel')}</Link>}
          <button className="side-link" onClick={signOut}>{t('خروج', 'Sign out')}</button>
        </div>
      </aside>
      <div className="portal-main">
        <div className="portal-top">
          <button className="burger" onClick={() => setOpen(!open)} aria-label={t('القائمة', 'Menu')}><span /><span /><span /></button>
          <span className="tag"><span className="dot pulse" /> <span className="latin">{mode === 'server' ? user.name : 'ACME TRADING'}</span></span>
          <span className="tag ph-tag"><Ph /> {t('بيانات تجريبية', 'demo data')}</span>
        </div>
        <div className="portal-body"><PortalDataProvider><Outlet /></PortalDataProvider></div>
      </div>
    </div>
  );
}


/* ───────── Pages ───────── */
function Loading() {
  const { t } = useI18n();
  const { error } = usePortal();
  return error ? <div className="form-error">{error}</div> : <p className="muted">{t('جاري التحميل…', 'Loading…')}</p>;
}
function Empty({ children }: { children: string }) { return <div className="empty-note nt-hatch">{children}</div>; }

export function Overview() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { data } = usePortal();
  if (!data) return <Loading />;
  const due = data.invoices.filter((i) => i.status === 'due');
  const kpis = [
    { to: '/portal/domains', label: t('دومينات', 'Domains'), v: data.domains.length },
    { to: '/portal/email', label: t('إيميلات', 'Mailboxes'), v: data.mailboxes.length },
    { to: '/portal/hosting', label: t('استضافة', 'Hosting'), v: data.hosting.length },
    { to: '/portal/servers', label: t('سيرفرات', 'Servers'), v: data.servers.length },
  ];
  const attention = data.domains.filter((d) => d.status === 'expiring').length + due.length + data.servers.filter((s) => s.status === 'stopped').length;
  return (
    <Page title={t('نظرة عامة', 'Overview')}>
      <div className="grid g4 kpis">
        {kpis.map((k) => <Link to={k.to} className="card kpi" key={k.to}><span className="nt-mono">{k.label}</span><b className="latin">{k.v}</b></Link>)}
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h3>{t('محتاج انتباه', 'Needs attention')}</h3>
          {attention === 0 && <p className="muted">{t('كل حاجة تمام.', 'Everything looks good.')}</p>}
          <ul className="attn">
            {data.domains.filter((d) => d.status === 'expiring').map((d) => <li key={d.id}><i className="dot bad" /> <Ltr>{d.name}</Ltr> {t('بينتهي في', 'expires')} <Ltr>{d.expires}</Ltr></li>)}
            {due.map((i) => <li key={i.id}><i className="dot bad" /> {t('فاتورة مستحقة', 'Invoice due')}: <Ltr>{i.number}</Ltr> · {i.item} · <Ltr>{i.amount} {cur}</Ltr></li>)}
            {data.servers.filter((s) => s.status === 'stopped').map((s) => <li key={s.id}><i className="dot idle" /> <Ltr>{s.name}</Ltr> {t('متوقف', 'is stopped')}</li>)}
          </ul>
        </div>
        <div className="card"><h3>{t('حالة الخدمات', 'Service health')}</h3>
          <p className="status-line-d"><i className="dot pulse" /> <span className="latin">ALL SYSTEMS OPERATIONAL</span></p>
        </div>
      </div>
    </Page>
  );
}

export function PortalDomains() {
  const { t } = useI18n();
  const { data, addDns, delDns } = usePortal();
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState({ type: 'A', host: '', value: '', ttl: 3600 });
  const [err, setErr] = useState('');
  if (!data) return <Loading />;
  const current = data.domains.find((d) => d.id === sel) ?? data.domains[0];
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!current || !form.value.trim()) return;
    setErr('');
    try { await addDns(current.id, { ...form, host: form.host.trim() || '@', value: form.value.trim() }); setForm({ ...form, host: '', value: '' }); } catch (x) { setErr(x instanceof Error ? x.message : 'error'); }
  };
  return (
    <Page title={t('الدومينات', 'Domains')} action={<Link to="/portal/support?new=domain" className="btn btn-primary btn-sm">{t('+ دومين جديد', '+ New domain')}</Link>}>
      <div className="card" style={{ marginBottom: 16 }}><h3>{t('ابحث عن دومين جديد', 'Find a new domain')}</h3><DomainSearch /></div>
      {data.domains.length === 0 ? <Empty>{t('مفيش دومينات لسه. اطلب دومين من الدعم.', 'No domains yet. Request one from support.')}</Empty> : (
        <>
          <Table head={[t('الدومين', 'Domain'), t('الحالة', 'Status'), t('ينتهي', 'Expires'), t('تجديد تلقائي', 'Auto-renew'), '']}>
            {data.domains.map((d) => (
              <tr key={d.id} className={d.id === current?.id ? 'is-sel' : ''}>
                <td><Ltr>{d.name}</Ltr></td><td><StatusTag s={d.status} /></td><td><Ltr>{d.expires || '-'}</Ltr></td>
                <td>{d.autoRenew ? t('مفعّل', 'On') : t('مقفول', 'Off')}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => setSel(d.id)}>{t('إدارة DNS', 'Manage DNS')}</button></td>
              </tr>
            ))}
          </Table>
          {current && (
            <>
              <h2 className="sub">{t('سجلات DNS', 'DNS records')} · <Ltr>{current.name}</Ltr></h2>
              <div className="dns">
                <div className="dns-row dns-head"><span>TYPE</span><span>HOST</span><span>VALUE</span><span>TTL</span><span /></div>
                {current.dns.length === 0 && <div className="dns-empty nt-hatch-dark">{t('مفيش سجلات لسه', 'No records yet')}</div>}
                {current.dns.map((r) => (
                  <div className="dns-row" key={r.id}>
                    <span>{r.type}</span><span>{r.host}</span><span>{r.value}</span><span>{r.ttl}</span>
                    <button className="dns-del" onClick={() => void delDns(current.id, r.id)} aria-label={t('حذف السجل', 'Delete record')}>×</button>
                  </div>
                ))}
              </div>
              {err && <div className="form-error" style={{ marginTop: 10 }}>{err}</div>}
              <form className="dns-form" onSubmit={add}>
                <select className="select" aria-label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map((x) => <option key={x}>{x}</option>)}</select>
                <input className="input latin" aria-label="Host" placeholder="@ / www" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                <input className="input latin" aria-label="Value" placeholder={t('القيمة', 'Value')} required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                <select className="select" aria-label="TTL" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })}>{[300, 3600, 14400, 86400].map((x) => <option key={x}>{x}</option>)}</select>
                <button className="btn btn-primary" type="submit">{t('إضافة', 'Add')}</button>
              </form>
            </>
          )}
        </>
      )}
    </Page>
  );
}

export function PortalEmail() {
  const { t } = useI18n();
  const { data, demo } = usePortal();
  const [adding, setAdding] = useState(false);
  const [local, setLocal] = useState('');
  const [quota, setQuota] = useState(5);
  if (!data) return <Loading />;
  const domain = data.domains[0]?.name ?? 'example.com';
  const create = (e: FormEvent) => { e.preventDefault(); if (demo && local) { demo.addMailbox(`${local.toLowerCase()}@${domain}`, quota); setLocal(''); setAdding(false); } };
  return (
    <Page title={t('الإيميلات', 'Email')} action={demo
      ? <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>{adding ? t('إلغاء', 'Cancel') : t('+ صندوق جديد', '+ New mailbox')}</button>
      : <Link to="/portal/support?new=mailbox" className="btn btn-primary btn-sm">{t('+ اطلب صندوق جديد', '+ Request mailbox')}</Link>}>
      {adding && demo && (
        <form className="card inline-form" onSubmit={create} style={{ gridTemplateColumns: '1fr 120px auto' }}>
          <div className="field"><label htmlFor="ml">{t('الاسم', 'Name')}</label><input id="ml" className="input latin" value={local} onChange={(e) => setLocal(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))} placeholder="support" required /></div>
          <div className="field"><label htmlFor="mq">{t('المساحة', 'Quota')}</label><select id="mq" className="select" value={quota} onChange={(e) => setQuota(Number(e.target.value))}>{[5, 30, 100].map((q) => <option key={q} value={q}>{q} GB</option>)}</select></div>
          <button className="btn btn-accent" type="submit">{t('إنشاء', 'Create')}</button>
        </form>
      )}
      {data.mailboxes.length === 0 ? <Empty>{t('مفيش صناديق إيميل لسه.', 'No mailboxes yet.')}</Empty> : (
        <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage'), t('الحالة', 'Status'), '']}>
          {data.mailboxes.map((m) => (
            <tr key={m.id}>
              <td><Ltr>{m.address}</Ltr></td>
              <td className="usage"><Meter value={pct(m.usedGb, m.quotaGb)} /><span className="latin">{m.usedGb} / {m.quotaGb} GB</span></td>
              <td><StatusTag s={m.status} /></td>
              <td>{demo && <button className="btn btn-ghost btn-sm" onClick={() => demo.delMailbox(m.id)}>{t('حذف', 'Delete')}</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

export function PortalHosting() {
  const { t } = useI18n();
  const { data } = usePortal();
  if (!data) return <Loading />;
  return (
    <Page title={t('الاستضافة', 'Hosting')} action={<Link to="/portal/support?new=hosting" className="btn btn-primary btn-sm">{t('+ اطلب استضافة', '+ Request hosting')}</Link>}>
      {data.hosting.length === 0 ? <Empty>{t('مفيش خطط استضافة لسه.', 'No hosting plans yet.')}</Empty> : (
        <Table head={[t('الخطة', 'Plan'), t('الدومين', 'Domain'), t('المساحة', 'Disk'), t('الحالة', 'Status')]}>
          {data.hosting.map((h) => (
            <tr key={h.id}>
              <td>{h.plan}</td><td><Ltr>{h.domain || '-'}</Ltr></td>
              <td className="usage"><Meter value={pct(h.usedGb, h.diskGb)} /><span className="latin">{h.usedGb} / {h.diskGb} GB</span></td>
              <td><StatusTag s={h.status} /></td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

export function PortalServers() {
  const { t } = useI18n();
  const { data, power, snapshot, demo } = usePortal();
  if (!data) return <Loading />;
  return (
    <Page title={t('السيرفرات', 'Servers')} action={demo
      ? <button className="btn btn-primary btn-sm" onClick={demo.addServer}>{t('+ سيرفر جديد', '+ New server')}</button>
      : <Link to="/portal/support?new=server" className="btn btn-primary btn-sm">{t('+ اطلب سيرفر', '+ Request server')}</Link>}>
      {data.servers.length === 0 ? <Empty>{t('مفيش سيرفرات لسه.', 'No servers yet.')}</Empty> : (
        <div className="grid g3">
          {data.servers.map((s) => (
            <div className="card" key={s.id}>
              <div className="srv-head"><h3 className="latin">{s.name}</h3><StatusTag s={s.status} /></div>
              <p className="latin muted">{s.ip}</p><p className="latin spec">{s.spec}</p>
              <div className="srv-m"><span className="nt-mono">CPU</span><Meter value={s.cpu} /><span className="latin">{s.cpu}%</span></div>
              <div className="srv-m"><span className="nt-mono">RAM</span><Meter value={s.ram} tone={s.ram > 80 ? 'warn' : undefined} /><span className="latin">{s.ram}%</span></div>
              <div className="srv-btns">
                <button className="btn btn-ghost btn-sm" disabled={s.status === 'pending'} onClick={() => void power(s.id, s.status === 'stopped')}>{s.status === 'stopped' ? t('تشغيل', 'Start') : t('إيقاف', 'Stop')}</button>
                <button className="btn btn-ghost btn-sm" disabled={s.status === 'pending'} onClick={() => void snapshot(s.id)}>Snapshot{s.snapshots > 0 && <span className="latin"> ({s.snapshots})</span>}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

export function PortalBilling() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { data, demo } = usePortal();
  if (!data) return <Loading />;
  const hasDue = data.invoices.some((i) => i.status === 'due');
  return (
    <Page title={t('الفواتير', 'Billing')}>
      {hasDue && !demo && <div className="card" style={{ marginBottom: 16 }}><p>{t('عندك فواتير مستحقة. للدفع تواصل مع الدعم وهنأكد الدفع من عندنا.', 'You have invoices due. Contact support to pay and we will confirm the payment.')} <Link to="/portal/support?new=payment" className="link">{t('تواصل مع الدعم', 'Contact support')}</Link></p></div>}
      {data.invoices.length === 0 ? <Empty>{t('مفيش فواتير لسه.', 'No invoices yet.')}</Empty> : (
        <Table head={[t('الرقم', 'No.'), t('التاريخ', 'Date'), t('البند', 'Item'), t('المبلغ', 'Amount'), t('الحالة', 'Status'), '']}>
          {data.invoices.map((i) => (
            <tr key={i.id}>
              <td><Ltr>{i.number}</Ltr></td><td><Ltr>{day(i.date)}</Ltr></td><td>{i.item}</td>
              <td><b className="latin">{i.amount}</b> {cur} {demo && <Ph />}</td>
              <td><InvoiceTag s={i.status} /></td>
              <td>{demo && i.status === 'due' && <button className="btn btn-accent btn-sm" onClick={() => demo.pay(i.id)}>{t('ادفع', 'Pay')}</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

export function PortalSupport() {
  const { t } = useI18n();
  const { data, createTicket, replyTicket, closeTicket } = usePortal();
  const [params, setParams] = useSearchParams();
  const topic = params.get('new');
  const topics: Record<string, [string, string]> = {
    domain: ['طلب دومين جديد', 'New domain request'], mailbox: ['طلب صندوق إيميل جديد', 'New mailbox request'], hosting: ['طلب خطة استضافة', 'Hosting request'],
    server: ['طلب سيرفر جديد', 'New server request'], payment: ['دفع فاتورة', 'Invoice payment'],
  };
  const [creating, setCreating] = useState(Boolean(topic));
  const [subject, setSubject] = useState(topic && topics[topic] ? t(topics[topic][0], topics[topic][1]) : '');
  const [text, setText] = useState(params.get('d') ? `${t('الدومين المطلوب', 'Requested domain')}: ${params.get('d')}` : '');
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  if (!data) return <Loading />;
  const run = async (fn: () => Promise<void>) => { setErr(''); try { await fn(); return true; } catch (x) { setErr(x instanceof Error ? x.message : 'error'); return false; } };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => createTicket(subject.trim(), text.trim()))) { setCreating(false); setSubject(''); setText(''); setParams({}); }
  };
  const current = data.tickets.find((x) => x.id === open);
  return (
    <Page title={t('الدعم', 'Support')} action={<button className="btn btn-primary btn-sm" onClick={() => setCreating(!creating)}>{creating ? t('إلغاء', 'Cancel') : t('+ تذكرة جديدة', '+ New ticket')}</button>}>
      {err && <div className="form-error" role="alert">{err}</div>}
      {creating && (
        <form className="card form" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="field"><label htmlFor="ts">{t('الموضوع', 'Subject')}</label><input id="ts" className="input" required maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field"><label htmlFor="tt">{t('التفاصيل', 'Details')}</label><textarea id="tt" className="textarea" required maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <button className="btn btn-accent" type="submit">{t('إرسال', 'Send')}</button>
        </form>
      )}
      {data.tickets.length === 0 ? <Empty>{t('مفيش تذاكر لسه.', 'No tickets yet.')}</Empty> : (
        <Table head={[t('الموضوع', 'Subject'), t('آخر تحديث', 'Updated'), t('الحالة', 'Status'), '']}>
          {data.tickets.map((k) => (
            <tr key={k.id} className={k.id === open ? 'is-sel' : ''}>
              <td>{k.subject}</td><td><Ltr>{day(k.updated)}</Ltr></td><td><TicketTag s={k.status} /></td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === k.id ? null : k.id)}>{t('فتح', 'Open')}</button></td>
            </tr>
          ))}
        </Table>
      )}
      {current && (
        <div className="card thread">
          <h3>{current.subject}</h3>
          {current.messages.map((m, i) => (
            <div key={i} className={`msg ${m.from}`}><b>{m.from === 'admin' ? t('الدعم', 'Support') : m.name}</b> <span className="muted latin">{day(m.at)}</span><p>{m.text}</p></div>
          ))}
          {current.status !== 'closed' ? (
            <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => replyTicket(current.id, reply.trim()))) setReply(''); }}>
              <textarea className="textarea" required maxLength={4000} placeholder={t('اكتب ردك…', 'Write a reply…')} value={reply} onChange={(e) => setReply(e.target.value)} />
              <div className="row-actions"><button className="btn btn-primary btn-sm" type="submit">{t('رد', 'Reply')}</button><button className="btn btn-ghost btn-sm" type="button" onClick={() => void run(() => closeTicket(current.id))}>{t('إغلاق التذكرة', 'Close ticket')}</button></div>
            </form>
          ) : <p className="muted">{t('التذكرة مغلقة.', 'This ticket is closed.')}</p>}
        </div>
      )}
    </Page>
  );
}
