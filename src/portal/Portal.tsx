import { useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DnsEditor } from '../dns';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { ApiError, post } from '../lib/api';
import { LangToggle, Logo } from '../site/Layout';
import { DomainSearch, Money, Ph } from '../site/parts';
import { useCurrency } from '../site/settings';
import { OrderButton } from '../site/CartPages';
import { RenewButton } from './Extras';
import { DomainName, SubLine, SvcCard } from '../site/svc';
import { day, InvoiceTag, Meter, Page, pct, StatusTag, Table, TicketTag } from '../ui';
import { PortalDataProvider, usePortal } from './PortalData';

/* ───────── Login (demo only: any input signs in) ───────── */
export function Login() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { mode, problem, detail, user, login } = useAuth();
  const [qs] = useSearchParams();
  const next = qs.get('next') && qs.get('next')!.startsWith('/portal') ? qs.get('next')! : '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (mode !== 'checking' && user) return <Navigate to={user.role === 'admin' ? '/admin' : (next || '/portal')} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = await login(email.trim(), password);
      nav(u.role === 'admin' ? '/admin' : (next || '/portal'));
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
        {qs.get('reset') && <div className="form-ok" role="status">{t('اتغيّرت كلمة السر. سجّل دخول بيها.', 'Your password was changed. Sign in with it.')}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || mode === 'checking'}>{busy ? '…' : t('دخول', 'Sign in')}</button>
        {mode === 'server' && <Link className="link" to="/portal/forgot">{t('نسيت كلمة السر؟', 'Forgot your password?')}</Link>}
        {mode === 'server' && <p className="muted">{t('لسه مالكش حساب؟', 'No account yet?')} <Link className="link" to={`/portal/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('سجّل حساب جديد', 'Create an account')}</Link></p>}
        <Link to="/" className="muted back">{t('← رجوع للموقع', '← Back to site')}</Link>
      </form>
    </div>
  );
}

/** New client sign-up: creates the account, signs in and opens the client area. */
export function Register() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { mode, problem, detail, user, refresh } = useAuth();
  const [qs] = useSearchParams();
  const next = qs.get('next') && qs.get('next')!.startsWith('/portal') ? qs.get('next')! : '/portal';
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (mode === 'offline') return <BackendOffline problem={problem} detail={detail} />;
  if (mode !== 'checking' && user) return <Navigate to={user.role === 'admin' ? '/admin' : next} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await post('auth/register', { ...f, email: f.email.trim() }); await refresh(); nav(next); }
    catch (err) {
      const m = err instanceof ApiError ? err.message : '';
      setError(m === 'this email is already registered' ? t('الإيميل ده مسجّل قبل كده. سجّل دخول.', 'This email is already registered. Sign in instead.')
        : m === 'new sign-ups are closed' ? t('التسجيل الجديد مقفول حاليًا. تواصل معنا.', 'New sign-ups are closed right now. Contact us.')
        : m.includes('too many') ? t('محاولات كتير. جرّب بعد شوية.', 'Too many attempts. Try again later.')
        : m.includes('password') ? t('كلمة السر لازم تكون 8 حروف على الأقل.', 'The password must be at least 8 characters.')
        : t('تعذّر إنشاء الحساب. راجع البيانات وحاول تاني.', 'Could not create the account. Check the details and try again.'));
    } finally { setBusy(false); }
  };
  return (
    <div className="login-page">
      <div className="login-side on-dark">
        <Logo dark />
        <div><h1>{t('ابدأ مع نوتش كلاود', 'Start with Notch Cloud')}</h1><p>{t('أنشئ حسابك وادير دومينك وإيميلاتك واستضافتك وطلباتك من مكان واحد.', 'Create your account and manage your domains, email, hosting and orders in one place.')}</p></div>
      </div>
      <form className="login-form" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangToggle /></div>
        <h2>{t('إنشاء حساب', 'Create an account')}</h2>
        {mode === 'demo' && <p className="muted">{t('نسخة تجريبية (من غير سيرفر): التسجيل بيشتغل بس بعد تثبيت الموقع على استضافة PHP.', 'Demo build (no server): sign-up works once the site is installed on a PHP host.')}</p>}
        <div className="field"><label htmlFor="rn">{t('الاسم', 'Full name')}</label><input id="rn" className="input" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="rc">{t('اسم الشركة (اختياري)', 'Company (optional)')}</label><input id="rc" className="input" maxLength={80} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
        <div className="field"><label htmlFor="re">{t('الإيميل', 'Email')}</label><input id="re" className="input latin" type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="rp">{t('الموبايل (اختياري)', 'Phone (optional)')}</label><input id="rp" className="input latin" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label htmlFor="rw">{t('كلمة السر (8 حروف على الأقل)', 'Password (8+ characters)')}</label><input id="rw" className="input latin" type="password" autoComplete="new-password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || mode !== 'server'}>{busy ? '…' : t('إنشاء الحساب', 'Create account')}</button>
        <p className="muted">{t('عندك حساب؟', 'Already have an account?')} <Link className="link" to="/portal/login">{t('سجّل دخول', 'Sign in')}</Link></p>
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
  const { mode, user, logout, impersonating, stopImpersonate } = useAuth();
  const [open, setOpen] = useState(false);
  if (mode === 'checking') return <div className="boot-loading" role="status">…</div>;
  if (!user) return <Navigate to={`/portal/login?next=${encodeURIComponent(window.location.hash.replace(/^#/, '') || window.location.pathname)}`} replace />;
  const items = [
    { to: '/portal', label: t('نظرة عامة', 'Overview'), end: true },
    { to: '/portal/domains', label: t('الدومينات', 'Domains') },
    { to: '/portal/email', label: t('الإيميلات', 'Email') },
    { to: '/portal/hosting', label: t('الاستضافة', 'Hosting') },
    { to: '/portal/websites', label: t('المواقع', 'Websites') },
    { to: '/portal/servers', label: t('السيرفرات', 'Servers') },
    { to: '/portal/orders', label: t('الطلبات', 'Orders') },
    { to: '/portal/quotes', label: t('عروض الأسعار', 'Quotes') },
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
        {impersonating && <div className="imp-bar" role="status"><span>{t('أنت بتشوف لوحة العميل بحسابه:', 'You are viewing the client area as')} <b>{user.name}</b></span><button className="btn btn-accent btn-sm" onClick={() => void stopImpersonate().then(() => nav('/admin'))}>{t('← الرجوع للإدارة', '← Back to admin')}</button></div>}
        <div className="portal-top">
          <button className="burger" onClick={() => setOpen(!open)} aria-label={t('القائمة', 'Menu')}><span /><span /><span /></button>
          <span className="tag"><span className="dot pulse" /> <span className="latin">{mode === 'server' ? user.name : 'ACME TRADING'}</span></span>
          {mode !== 'server' && <span className="tag ph-tag"><Ph /> {t('بيانات تجريبية', 'demo data')}</span>}
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
  const { mode } = useAuth();
  const { data } = usePortal();
  if (!data) return <Loading />;
  return (
    <Page title={t('الدومينات', 'Domains')} action={<Link to={mode === 'server' ? '/domains' : '/portal/support?new=domain'} className="btn btn-primary btn-sm">{t('+ دومين جديد', '+ New domain')}</Link>}>
      <div className="card" style={{ marginBottom: 16 }}><h3>{t('ابحث عن دومين جديد', 'Find a new domain')}</h3><DomainSearch /></div>
      {data.domains.length === 0 ? <Empty>{t('مفيش دومينات لسه. اطلب دومين من الدعم.', 'No domains yet. Request one from support.')}</Empty> : (
        <div className="svc-list">
          {data.domains.map((d) => (
            <SvcCard key={d.id} host={d.name} to={`/portal/domains/${d.id}`} dim={d.status === 'stopped'}
              title={<DomainName name={d.name} />}
              sub={<SubLine sub={d.sub} started={d.started} expires={d.expires} extra={<StatusTag s={d.status} />} />}
              actions={<><RenewButton res="domains" id={d.id} expires={d.expires} /><Link className="btn btn-ghost btn-sm" to={`/portal/domains/${d.id}`}>{t('التفاصيل و DNS', 'Details & DNS')}</Link></>} />
          ))}
        </div>
      )}
    </Page>
  );
}

/** Opens the webmail in a new tab and copies the address so it can be pasted into the sign-in form. */
function MailOpen({ address, url }: { address: string; url?: string }) {
  const { t } = useI18n();
  return <a className="btn btn-accent btn-sm" href={url || 'https://mail.hostinger.com'} target="_blank" rel="noreferrer" onClick={() => { void navigator.clipboard?.writeText(address).catch(() => undefined); }} title={t('بيتنسخ العنوان تلقائيًا', 'The address is copied for you')}>{t('افتح الإيميل', 'Open mailbox')}</a>;
}

/** One domain: its details, DNS records, and everything linked to it (hosting, websites, mailboxes). */
export function PortalDomainDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { data, addDns, delDns } = usePortal();
  const [err, setErr] = useState('');
  if (!data) return <Loading />;
  const d = data.domains.find((x) => x.id === id);
  if (!d) return <Page title={t('الدومين', 'Domain')}><Empty>{t('الدومين ده مش موجود.', 'Domain not found.')}</Empty><Link to="/portal/domains" className="btn btn-ghost btn-sm">{t('← كل الدومينات', '← All domains')}</Link></Page>;
  const under = (h: string) => { h = (h || '').toLowerCase(); return h === d.name.toLowerCase() || h.endsWith('.' + d.name.toLowerCase()); };
  const sites = (data.websites ?? []).filter((w) => w.domainId === d.id || under(w.url));
  const hosts = data.hosting.filter((h) => under(h.domain) || sites.some((w) => w.hostingId === h.id));
  const mails = data.mailboxes.filter((m) => m.address.toLowerCase().endsWith('@' + d.name.toLowerCase()));
  return (
    <Page title={d.name} action={<div className="row-actions"><RenewButton res="domains" id={d.id} expires={d.expires} /><Link to="/portal/domains" className="btn btn-ghost btn-sm">{t('← كل الدومينات', '← All domains')}</Link></div>}>
      <div className="card"><dl className="kv">
        <div><dt>{t('الحالة', 'Status')}</dt><dd><StatusTag s={d.status} /></dd></div>
        <div><dt>{t('ينتهي', 'Expires')}</dt><dd><Ltr>{d.expires || '-'}</Ltr></dd></div>
        <div><dt>{t('تجديد تلقائي', 'Auto-renew')}</dt><dd>{d.autoRenew ? t('مفعّل', 'On') : t('مقفول', 'Off')}</dd></div>
        {d.price ? <div><dt>{t('سعر التجديد', 'Renewal price')}</dt><dd><Money value={d.price} /></dd></div> : null}
        <div><dt>{t('معرّف الاشتراك', 'Subscription ID')}</dt><dd><Ltr>{d.sub || '-'}</Ltr></dd></div>
        <div><dt>{t('بدأ في', 'Started')}</dt><dd><Ltr>{d.started || '-'}</Ltr></dd></div>
      </dl></div>
      <h2 className="sub">{t('سجلات DNS', 'DNS records')}</h2>
      <DnsEditor records={d.dns} err={err} readOnly={!!d.dnsOff}
        onAdd={async (r) => { setErr(''); try { await addDns(d.id, r); } catch (x) { setErr(x instanceof Error ? x.message : 'error'); } }}
        onDelete={async (rid) => { setErr(''); try { await delDns(d.id, rid); } catch (x) { setErr(x instanceof Error ? x.message : 'error'); } }} />
      <h2 className="sub">{t('الإيميلات', 'Mailboxes')}</h2>
      {mails.length === 0 ? <p className="muted">{t('مفيش إيميلات على الدومين ده لسه.', 'No mailboxes on this domain yet.')} <Link className="link" to="/portal/support?new=mailbox">{t('اطلب صندوق', 'Request a mailbox')}</Link></p> : (
        <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage'), '']}>{mails.map((m) => <tr key={m.id}><td><Ltr>{m.address}</Ltr></td><td><Ltr>{m.usedGb} / {m.quotaGb} GB</Ltr></td><td><MailOpen address={m.address} url={data.webmail} /></td></tr>)}</Table>
      )}
      <h2 className="sub">{t('المرتبط بالدومين', 'Linked to this domain')}</h2>
      <div className="linked">
        {sites.map((w) => <div key={w.id}><span>{t('موقع', 'Website')}: <Ltr>{w.name}</Ltr></span><StatusTag s={w.status} /></div>)}
        {hosts.map((h) => <div key={h.id}><span>{t('استضافة', 'Hosting')}: {h.plan}</span><StatusTag s={h.status} /></div>)}
        {mails.map((m) => <div key={m.id}><span>{t('إيميل', 'Mailbox')}: <Ltr>{m.address}</Ltr></span><StatusTag s={m.status} /></div>)}
        {sites.length + hosts.length + mails.length === 0 && <p className="muted">{t('مفيش حاجة مرتبطة لسه.', 'Nothing linked yet.')}</p>}
      </div>
    </Page>
  );
}

export function PortalWebsites() {
  const { t } = useI18n();
  const { data } = usePortal();
  if (!data) return <Loading />;
  const sites = data.websites ?? [];
  const dom = (id: string) => data.domains.find((d) => d.id === id);
  const host = (id: string) => data.hosting.find((h) => h.id === id);
  return (
    <Page title={t('المواقع', 'Websites')} action={<OrderButton category="site" fallback="/portal/support?new=website" label={t('+ اطلب موقع', '+ Request a website')} />}>
      {sites.length === 0 ? <Empty>{t('مفيش مواقع لسه.', 'No websites yet.')}</Empty> : (
        <div className="svc-list">
          {sites.map((w) => (
            <SvcCard key={w.id} host={w.url || dom(w.domainId)?.name || w.name} to={`/portal/websites/${w.id}`} dim={w.status === 'stopped'}
              title={<Ltr>{w.name}</Ltr>}
              sub={<SubLine sub={w.sub} started={w.started} expires={w.expires} extra={<><StatusTag s={w.status} />{dom(w.domainId) && <span><Ltr>{dom(w.domainId)!.name}</Ltr></span>}{host(w.hostingId) && <span>{host(w.hostingId)!.plan}</span>}</>} />}
              actions={<Link className="btn btn-ghost btn-sm" to={`/portal/websites/${w.id}`}>{t('التفاصيل', 'Details')}</Link>} />
          ))}
        </div>
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
      : <div className="row-actions"><OrderButton category="email" fallback="/portal/support?new=mailbox" label={t('+ اطلب إيميلات', '+ Order email')} /><Link to="/portal/support?new=mailbox" className="btn btn-ghost btn-sm">{t('صندوق إضافي', 'Extra mailbox')}</Link></div>}>
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
              <td><div className="row-actions"><MailOpen address={m.address} url={data.webmail} />{demo && <button className="btn btn-ghost btn-sm" onClick={() => demo.delMailbox(m.id)}>{t('حذف', 'Delete')}</button>}</div></td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}

const underHost = (host: string, name: string) => { const h = (host || '').toLowerCase(), n = (name || '').toLowerCase(); return n !== '' && (h === n || h.endsWith('.' + n)); };

export function PortalHosting() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { data } = usePortal();
  if (!data) return <Loading />;
  const sites = data.websites ?? [];
  const used = data.hosting.reduce((n, h) => n + (h.usedGb || 0), 0), total = data.hosting.reduce((n, h) => n + (h.diskGb || 0), 0);
  return (
    <Page title={t('الاستضافة', 'Hosting')} action={<OrderButton category="hosting" fallback="/portal/support?new=hosting" label={t('+ اطلب استضافة', '+ Order hosting')} />}>
      {data.hosting.length === 0 ? <Empty>{t('مفيش خطط استضافة لسه.', 'No hosting plans yet.')}</Empty> : (
        <>
          <div className="stat-strip">
            <div><span>{t('الخطط', 'Plans')}</span><b className="latin">{data.hosting.length}</b></div>
            <div><span>{t('المواقع', 'Websites')}</span><b className="latin">{sites.length}</b></div>
            <div><span>{t('المساحة', 'Disk')}</span><b className="latin">{used} / {total} GB</b></div>
          </div>
          <Table head={[t('الخطة', 'Plan'), t('الدومين', 'Domain'), t('المواقع', 'Websites'), t('المساحة', 'Disk'), t('الحالة', 'Status')]}>
            {data.hosting.map((h) => (
              <tr key={h.id} className="row-link" onClick={() => nav(`/portal/hosting/${h.id}`)}>
                <td><Link className="link" to={`/portal/hosting/${h.id}`} onClick={(e) => e.stopPropagation()}>{h.plan}</Link></td><td><Ltr>{h.domain || '-'}</Ltr></td>
                <td className="latin">{sites.filter((w) => w.hostingId === h.id).length}</td>
                <td className="usage"><Meter value={pct(h.usedGb, h.diskGb)} /><span className="latin">{h.usedGb} / {h.diskGb} GB</span></td>
                <td><StatusTag s={h.status} /></td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Page>
  );
}

/** One hosting plan: size, the websites on it, their domains and mailboxes. */
export function PortalHostingDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { data } = usePortal();
  const [tab, setTab] = useState<'overview' | 'websites' | 'domains' | 'email'>('overview');
  if (!data) return <Loading />;
  const h = data.hosting.find((x) => x.id === id);
  if (!h) return <Page title={t('الاستضافة', 'Hosting')}><Empty>{t('الاستضافة دي مش موجودة.', 'Hosting not found.')}</Empty><Link to="/portal/hosting" className="btn btn-ghost btn-sm">{t('← الاستضافة', '← Hosting')}</Link></Page>;
  const sites = (data.websites ?? []).filter((w) => w.hostingId === h.id);
  const doms = data.domains.filter((d) => underHost(h.domain, d.name) || sites.some((w) => w.domainId === d.id));
  const mails = data.mailboxes.filter((m) => doms.some((d) => m.address.toLowerCase().endsWith('@' + d.name.toLowerCase())));
  const p = pct(h.usedGb, h.diskGb);
  const tabs: [typeof tab, string, number?][] = [['overview', t('نظرة عامة', 'Overview')], ['websites', t('المواقع', 'Websites'), sites.length], ['domains', t('الدومينات', 'Domains'), doms.length], ['email', t('الإيميلات', 'Email'), mails.length]];
  return (
    <Page title={h.plan} action={<div className="row-actions"><RenewButton res="hosting" id={h.id} expires={h.expires} /><Link to="/portal/hosting" className="btn btn-ghost btn-sm">{t('← الاستضافة', '← Hosting')}</Link></div>}>
      <div className="stat-strip">
        <div><span>{t('الحالة', 'Status')}</span><b><StatusTag s={h.status} /></b></div>
        <div><span>{t('المساحة', 'Disk')}</span><b className="latin">{h.usedGb} / {h.diskGb} GB</b></div>
        <div><span>{t('المواقع', 'Websites')}</span><b className="latin">{sites.length}</b></div>
        <div><span>{t('الدومين', 'Domain')}</span><b><Ltr>{h.domain || '-'}</Ltr></b></div>
        {h.expires && <div><span>{t('التجديد', 'Renews')}</span><b><Ltr>{h.expires}</Ltr></b></div>}
        <div><span>{t('معرّف الاشتراك', 'Subscription ID')}</span><b><Ltr>{h.sub || '-'}</Ltr></b></div>
      </div>
      <div className="tabs tabs-bar" role="tablist">{tabs.map(([k, label, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}{n !== undefined && <> <span className="latin">({n})</span></>}</button>)}</div>
      {tab === 'overview' && <div className="card"><h3>{t('حجم الاستضافة', 'Hosting size')}</h3><p className="muted latin">{h.usedGb} / {h.diskGb} GB · {Math.round(p)}%</p><Meter value={p} tone={p > 85 ? 'warn' : undefined} />
        <h3 style={{ marginTop: 18 }}>{t('المساحة لكل موقع', 'Space per website')}</h3>
        <div className="linked">{sites.map((w) => <div key={w.id}><Link className="link" to={`/portal/websites/${w.id}`}><Ltr>{w.name}</Ltr></Link><span style={{ minWidth: 200 }}><span className="latin muted">{w.usedGb ?? 0} / {w.diskGb ?? 0} GB</span><Meter value={pct(w.usedGb ?? 0, w.diskGb ?? 0)} /></span></div>)}{sites.length === 0 && <p className="muted">{t('مفيش مواقع على الاستضافة دي.', 'No websites on this hosting.')}</p>}</div></div>}
      {tab === 'websites' && <div className="linked">{sites.map((w) => <div key={w.id}><Link className="link" to={`/portal/websites/${w.id}`}><Ltr>{w.name}</Ltr></Link><StatusTag s={w.status} /></div>)}{sites.length === 0 && <p className="muted">{t('مفيش مواقع.', 'No websites.')}</p>}</div>}
      {tab === 'domains' && <div className="linked">{doms.map((d) => <div key={d.id}><Link className="link" to={`/portal/domains/${d.id}`}><Ltr>{d.name}</Ltr></Link><StatusTag s={d.status} /></div>)}{doms.length === 0 && <p className="muted">{t('مفيش دومينات.', 'No domains.')}</p>}</div>}
      {tab === 'email' && <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage')]} empty={mails.length === 0 ? t('مفيش إيميلات.', 'No mailboxes.') : undefined}>{mails.map((m) => <tr key={m.id}><td><Ltr>{m.address}</Ltr></td><td className="latin">{m.usedGb} / {m.quotaGb} GB</td></tr>)}</Table>}
    </Page>
  );
}

/** One website: its domain, hosting, space and mailboxes. */
export function PortalWebsiteDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { data } = usePortal();
  const [tab, setTab] = useState<'overview' | 'hosting' | 'email'>('overview');
  if (!data) return <Loading />;
  const w = (data.websites ?? []).find((x) => x.id === id);
  if (!w) return <Page title={t('الموقع', 'Website')}><Empty>{t('الموقع ده مش موجود.', 'Website not found.')}</Empty><Link to="/portal/websites" className="btn btn-ghost btn-sm">{t('← المواقع', '← Websites')}</Link></Page>;
  const dom = data.domains.find((d) => d.id === w.domainId) ?? data.domains.find((d) => underHost(w.url || w.name, d.name));
  const host = data.hosting.find((x) => x.id === w.hostingId);
  const mails = dom ? data.mailboxes.filter((m) => m.address.toLowerCase().endsWith('@' + dom.name.toLowerCase())) : [];
  const p = pct(w.usedGb ?? 0, w.diskGb ?? 0);
  const tabs: [typeof tab, string, number?][] = [['overview', t('نظرة عامة', 'Overview')], ['hosting', t('الاستضافة', 'Hosting')], ['email', t('الإيميلات', 'Email'), mails.length]];
  return (
    <Page title={w.name} action={<Link to="/portal/websites" className="btn btn-ghost btn-sm">{t('← المواقع', '← Websites')}</Link>}>
      <div className="stat-strip">
        <div><span>{t('الحالة', 'Status')}</span><b><StatusTag s={w.status} /></b></div>
        <div><span>{t('الدومين', 'Domain')}</span><b>{dom ? <Link className="link" to={`/portal/domains/${dom.id}`}><Ltr>{dom.name}</Ltr></Link> : '-'}</b></div>
        <div><span>{t('الاستضافة', 'Hosting')}</span><b>{host ? <Link className="link" to={`/portal/hosting/${host.id}`}>{host.plan}</Link> : '-'}</b></div>
        <div><span>{t('المساحة', 'Disk')}</span><b className="latin">{w.usedGb ?? 0} / {w.diskGb ?? 0} GB</b></div>
        <div><span>{t('معرّف الاشتراك', 'Subscription ID')}</span><b><Ltr>{w.sub || '-'}</Ltr></b></div>
        <div><span>{t('بدأ / ينتهي', 'Started / renews')}</span><b><Ltr>{w.started || '-'} → {w.expires || '-'}</Ltr></b></div>
      </div>
      <div className="tabs tabs-bar" role="tablist">{tabs.map(([k, label, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}{n !== undefined && <> <span className="latin">({n})</span></>}</button>)}</div>
      {tab === 'overview' && <div className="card"><dl className="kv"><div><dt>{t('الرابط', 'URL')}</dt><dd><Ltr>{w.url || w.name}</Ltr></dd></div><div><dt>{t('ملاحظات', 'Notes')}</dt><dd>{w.notes || '-'}</dd></div></dl>{(w.diskGb ?? 0) > 0 && <><h3 style={{ marginTop: 16 }}>{t('المساحة', 'Disk')}</h3><p className="muted latin">{Math.round(p)}%</p><Meter value={p} tone={p > 85 ? 'warn' : undefined} /></>}</div>}
      {tab === 'hosting' && (host ? <div className="card"><h3><Link className="link" to={`/portal/hosting/${host.id}`}>{host.plan}</Link></h3><p className="muted latin">{host.usedGb} / {host.diskGb} GB</p><Meter value={pct(host.usedGb, host.diskGb)} /></div> : <p className="muted">{t('مفيش استضافة مربوطة.', 'No hosting linked.')}</p>)}
      {tab === 'email' && <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage')]} empty={mails.length === 0 ? t('مفيش إيميلات على دومين الموقع.', 'No mailboxes on the website’s domain.') : undefined}>{mails.map((m) => <tr key={m.id}><td><Ltr>{m.address}</Ltr></td><td className="latin">{m.usedGb} / {m.quotaGb} GB</td></tr>)}</Table>}
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
      : <OrderButton category="vps" fallback="/portal/support?new=server" label={t('+ اطلب سيرفر', '+ Order server')} />}>
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
  const visible = data.invoices.filter((i) => i.status !== 'draft');
  const due = visible.filter((i) => i.status === 'due' || i.status === 'collections');
  const owed = due.reduce((n, i) => n + (i.balance ?? i.amount), 0);
  const overdue = due.filter((i) => i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10)).length;
  const m = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Page title={t('الفواتير', 'Billing')}>
      {!demo && <div className="stat-strip">
        <div><span>{t('المستحق', 'Amount due')}</span><b className="latin">{m(owed)} {cur}</b></div>
        <div><span>{t('فواتير متأخرة', 'Overdue')}</span><b className="latin">{overdue}</b></div>
        <div><span>{t('رصيدك', 'Credit balance')}</span><b className="latin">{m(data.credit ?? 0)} {cur}</b></div>
      </div>}
      {due.length > 0 && !demo && <div className="card" style={{ marginBottom: 16 }}><p>{t('عندك فواتير مستحقة. افتح الفاتورة وشوف طرق الدفع، أو الطلب المرتبط بيها وادفع منه.', 'You have invoices due. Open the invoice to see how to pay, or the order behind it.')} <Link to="/portal/orders" className="link">{t('الطلبات', 'Orders')}</Link></p></div>}
      {visible.length === 0 ? <Empty>{t('مفيش فواتير لسه.', 'No invoices yet.')}</Empty> : (
        <Table head={[t('الرقم', 'No.'), t('التاريخ', 'Date'), t('الاستحقاق', 'Due'), t('البند', 'Item'), t('المبلغ', 'Amount'), t('المتبقي', 'Balance'), t('الحالة', 'Status'), '']}>
          {visible.map((i) => (
            <tr key={i.id}>
              <td>{demo ? <Ltr>{i.number}</Ltr> : <Link className="link latin" to={`/portal/invoices/${i.id}`}>{i.number}</Link>}</td><td><Ltr>{day(i.date)}</Ltr></td><td><Ltr>{i.dueDate || '-'}</Ltr></td><td>{i.item}</td>
              <td><b className="latin">{i.amount}</b> {cur} {demo && <Ph />}</td>
              <td className="latin">{i.status === 'due' || i.status === 'collections' ? m(i.balance ?? i.amount) : '-'}</td>
              <td><InvoiceTag s={i.status} /></td>
              <td>{demo && i.status === 'due' && <button className="btn btn-accent btn-sm" onClick={() => demo.pay(i.id)}>{t('ادفع', 'Pay')}</button>}{!demo && <Link className="btn btn-ghost btn-sm" to={`/portal/invoices/${i.id}`}>{t('عرض', 'View')}</Link>}</td>
            </tr>
          ))}
        </Table>
      )}
      {!demo && (data.transactions ?? []).length > 0 && <>
        <h2 className="sub">{t('المعاملات', 'Transactions')}</h2>
        <Table head={[t('التاريخ', 'Date'), t('الفاتورة', 'Invoice'), t('النوع', 'Type'), t('وسيلة الدفع', 'Method'), t('المرجع', 'Reference'), t('المبلغ', 'Amount')]}>
          {(data.transactions ?? []).map((e) => <tr key={e.id}><td><Ltr>{(e.at || '').slice(0, 10)}</Ltr></td><td><Link className="link latin" to={`/portal/invoices/${e.invoiceId}`}>{e.number}</Link></td><td>{e.type === 'refund' ? t('استرداد', 'Refund') : e.type === 'credit' ? t('رصيد', 'Credit') : t('دفعة', 'Payment')}</td><td>{e.method || '-'}</td><td><Ltr>{e.ref || '-'}</Ltr></td><td className="latin">{e.type === 'refund' ? '−' : ''}{m(e.amount)} {cur}</td></tr>)}
        </Table>
      </>}
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
    server: ['طلب سيرفر جديد', 'New server request'], website: ['طلب موقع جديد', 'New website request'], payment: ['دفع فاتورة', 'Invoice payment'],
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
