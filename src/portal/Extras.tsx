import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { api, ApiError, post } from '../lib/api';
import type { Business, Invoice, Order } from '../lib/types';
import { LangToggle, Logo } from '../site/Layout';
import { useCurrency, useSite, assetUrl } from '../site/settings';
import { InvoiceTag, Page, day } from '../ui';
import { usePortal } from './PortalData';
import { ClientLine, useAll } from '../admin/kit';

/* ───────── password reset by email ───────── */
function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="login-page">
      <div className="login-side on-dark"><Logo dark /><div><h1>{t('استرجاع كلمة السر', 'Password recovery')}</h1><p>{t('هنبعتلك لينك على الإيميل تختار منه كلمة سر جديدة.', 'We email you a link to choose a new password.')}</p></div></div>
      <div className="login-form"><div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangToggle /></div><h2>{title}</h2>{children}</div>
    </div>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  const { mode } = useAuth();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await post('auth/forgot', { email: email.trim() }); setDone(true); }
    catch (x) { setError(x instanceof ApiError && x.status === 429 ? t('محاولات كتير. جرّب بعد شوية.', 'Too many requests. Try again later.') : t('تعذّر الإرسال، حاول تاني.', 'Could not send. Try again.')); }
    finally { setBusy(false); }
  };
  return (
    <AuthShell title={t('نسيت كلمة السر', 'Forgot your password')}>
      {done ? <div className="form-ok" role="status">{t('لو الإيميل ده مسجّل عندنا، هيوصله لينك لتغيير كلمة السر (صالح ساعة). راجع الـ Spam كمان.', 'If this email is registered, a link to change the password is on its way (valid for one hour). Check spam too.')}</div> : (
        <form className="form" onSubmit={submit}>
          <div className="field"><label htmlFor="fe">{t('الإيميل', 'Email')}</label><input id="fe" className="input latin" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy || mode !== 'server'}>{busy ? '…' : t('ابعت لينك الاسترجاع', 'Send the reset link')}</button>
        </form>
      )}
      <Link to="/portal/login" className="muted back">{t('← رجوع لتسجيل الدخول', '← Back to sign in')}</Link>
    </AuthShell>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await post('auth/reset', { email: qs.get('email') ?? '', token: qs.get('token') ?? '', password: pw }); nav('/portal/login?reset=1'); }
    catch (x) { const m = x instanceof ApiError ? x.message : ''; setError(m.includes('password') ? t('كلمة السر لازم تكون 8 حروف على الأقل.', 'The password must be at least 8 characters.') : t('اللينك ده غير صالح أو انتهت صلاحيته. اطلب لينك جديد.', 'This link is invalid or expired. Request a new one.')); }
    finally { setBusy(false); }
  };
  return (
    <AuthShell title={t('كلمة سر جديدة', 'Choose a new password')}>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="np">{t('كلمة السر الجديدة (8 حروف على الأقل)', 'New password (8+ characters)')}</label><input id="np" className="input latin" type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '…' : t('حفظ كلمة السر', 'Save password')}</button>
      </form>
      <Link to="/portal/forgot" className="muted back">{t('اطلب لينك جديد', 'Request a new link')}</Link>
    </AuthShell>
  );
}

/* ───────── renew a domain / hosting plan ───────── */
export function RenewPage() {
  const { t } = useI18n();
  const { res, id } = useParams();
  const nav = useNavigate();
  const cur = useCurrency();
  const { data } = usePortal();
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState('');
  const [code, setCode] = useState('');
  const [off, setOff] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const svc = res === 'domains' ? data.domains.find((d) => d.id === id) : res === 'hosting' ? data.hosting.find((h) => h.id === id) : undefined;
  const back = res === 'domains' ? `/portal/domains/${id}` : `/portal/hosting/${id}`;
  if (!svc) return <Navigate to="/portal" replace />;
  const price = svc.price ?? 0;
  const yearly = res === 'domains' || (svc as { billing?: string }).billing === 'yearly';
  const label = res === 'domains' ? (svc as { name: string }).name : (svc as { plan: string }).plan;
  const methods = data.payments ?? [];
  const sub = price * qty;
  const apply = async () => { setError(''); setOff(null); try { const r = await post<{ discount: number }>('orders/coupon', { code, total: sub }); setOff(r.discount); } catch (x) { setError(x instanceof ApiError && x.message ? x.message : t('الكوبون مش صالح.', 'Invalid coupon.')); } };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { const r = await post<{ order: Order }>('orders/create', { items: [{ kind: 'renew', res, id, qty }], method: method || methods[0]?.id || '', coupon: off !== null ? code : '' }); nav(`/portal/orders/${r.order.id}`); }
    catch (x) { setError(x instanceof ApiError && x.message.includes('no renewal price') ? t('الخدمة دي ملهاش سعر تجديد. تواصل معنا.', 'This service has no renewal price. Contact us.') : t('تعذّر إنشاء طلب التجديد.', 'Could not create the renewal order.')); }
    finally { setBusy(false); }
  };
  const opts = yearly ? [1, 2, 3] : [1, 3, 6, 12];
  return (
    <Page title={t('تجديد', 'Renew') + ' ' + label} action={<Link to={back} className="btn btn-ghost btn-sm">{t('← رجوع', '← Back')}</Link>}>
      <form className="cart" onSubmit={submit}>
        <div className="cart-list">
          <div className="card form">
            <p>{t('ينتهي في', 'Expires on')} <Ltr>{svc.expires || '-'}</Ltr></p>
            <div className="field"><label htmlFor="rq">{t('مدة التجديد', 'Renewal term')}</label><select id="rq" className="select" value={qty} onChange={(e) => setQty(Number(e.target.value))}>{opts.map((o) => <option key={o} value={o}>{yearly ? t(`${o} سنة`, `${o} yr`) : t(`${o} شهر`, `${o} mo`)}</option>)}</select></div>
            {methods.length > 0 && <div className="field"><label>{t('وسيلة الدفع', 'Payment method')}</label>{methods.map((m) => <label key={m.id} className={`pay-opt${(method || methods[0].id) === m.id ? ' on' : ''}`}><input type="radio" name="rm" checked={(method || methods[0].id) === m.id} onChange={() => setMethod(m.id)} /> <b>{m.nameAr || m.nameEn}</b></label>)}</div>}
          </div>
        </div>
        <aside className="card cart-sum">
          <h3>{t('ملخص', 'Summary')}</h3>
          <div className="coupon-row"><input className="input latin" dir="ltr" placeholder={t('كوبون خصم', 'Discount code')} value={code} onChange={(e) => { setCode(e.target.value); setOff(null); }} maxLength={40} /><button type="button" className="btn btn-ghost btn-sm" disabled={!code.trim()} onClick={apply}>{t('تطبيق', 'Apply')}</button></div>
          {off !== null && <p className="muted">{t('خصم', 'Discount')}: <b className="latin">−{off}</b></p>}
          <div className="cart-total"><span>{t('الإجمالي', 'Total')}</span><b className="latin">{(sub - (off ?? 0)).toLocaleString('en-US')} {cur}</b></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-accent" type="submit" disabled={busy || price <= 0}>{busy ? '…' : t('إنشاء طلب التجديد', 'Create renewal order')}</button>
          {price <= 0 && <p className="muted">{t('مفيش سعر تجديد للخدمة دي. تواصل معنا.', 'There is no renewal price for this service. Contact us.')}</p>}
        </aside>
      </form>
    </Page>
  );
}

export function RenewButton({ res, id, expires }: { res: 'domains' | 'hosting'; id: string; expires?: string }) {
  const { t } = useI18n();
  const days = expires ? Math.floor((new Date(expires + 'T00:00:00Z').getTime() - Date.now()) / 86400000) : null;
  const { mode } = useAuth();
  if (mode !== 'server') return null;
  return <span className="row-actions">{days !== null && days <= 30 && <span className={`tag ${days < 0 ? 'bad' : 'warn'}`}>{days < 0 ? t('منتهي', 'Expired') : t(`ينتهي بعد ${days} يوم`, `Expires in ${days} d`)}</span>}<Link className="btn btn-accent btn-sm" to={`/portal/renew/${res}/${id}`}>{t('جدّد', 'Renew')}</Link></span>;
}

/* ───────── printable invoice (Print → Save as PDF) ───────── */
type Line = { name: string; qty: string; price: number };
function Sheet({ inv, lines, biz, taxRate, customer, order }: { inv: Invoice; lines: Line[]; biz: Business; taxRate: number; customer: { name: string; email: string; phone?: string; company?: string }; order?: Order }) {
  const { t } = useI18n();
  const { settings } = useSite();
  const cur = useCurrency();
  const total = order ? order.total : inv.amount;
  const net = taxRate > 0 ? total / (1 + taxRate / 100) : total;
  const tax = total - net;
  const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const logo = settings.brand?.logo;
  return (
    <div className="invoice-sheet">
      <header className="inv-head">
        <div>{logo ? <img src={assetUrl(logo)} alt="" className="inv-logo" /> : <b className="inv-brand">{settings.site || 'Notch Cloud'}</b>}
          <div className="muted">{biz.legalName || settings.site}<br />{[biz.address, biz.address2].filter(Boolean).join(', ')}{(biz.city || biz.governorate) && <><br />{[biz.city, biz.governorate, biz.postalCode].filter(Boolean).join(', ')}</>}{biz.country && <><br />{biz.country}</>}{biz.taxId && <><br />{t('الرقم الضريبي', 'Tax ID')}: <Ltr>{biz.taxId}</Ltr></>}</div></div>
        <div className="inv-meta"><h1>{t('فاتورة', 'INVOICE')}</h1><div className="latin"><b>{inv.number}</b></div><div className="muted"><Ltr>{day(inv.date)}</Ltr></div><InvoiceTag s={inv.status} /></div>
      </header>
      <section className="inv-bill"><span className="muted">{t('فاتورة إلى', 'Bill to')}</span><b>{customer.company || customer.name}</b>{customer.company && <span>{customer.name}</span>}<span className="latin">{customer.email}</span>{customer.phone && <span className="latin">{customer.phone}</span>}</section>
      <table className="tbl inv-tbl"><thead><tr><th>{t('البند', 'Description')}</th><th>{t('الكمية', 'Qty')}</th><th>{t('المبلغ', 'Amount')}</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}><td>{l.name}</td><td>{l.qty}</td><td className="latin">{f(l.price)}</td></tr>)}</tbody></table>
      <div className="inv-sum">
        {order && !!order.discount && <div><span>{t('خصم', 'Discount')} {order.coupon && <Ltr>({order.coupon})</Ltr>}</span><b className="latin">−{f(order.discount)}</b></div>}
        {taxRate > 0 && <><div><span>{t('الإجمالي قبل الضريبة', 'Subtotal (excl. tax)')}</span><b className="latin">{f(net)}</b></div><div><span>{t('ضريبة القيمة المضافة', 'VAT')} {taxRate}%</span><b className="latin">{f(tax)}</b></div></>}
        <div className="inv-total"><span>{t('الإجمالي', 'Total')}</span><b className="latin">{f(total)} {cur}</b></div>
        {taxRate > 0 && <small className="muted">{t('الأسعار شاملة الضريبة.', 'Prices include tax.')}</small>}
      </div>
      <footer className="muted">{t('شكرًا لتعاملكم معنا.', 'Thank you for your business.')}</footer>
    </div>
  );
}
const toLines = (order: Order | undefined, inv: Invoice, locale: (a: string, b: string) => string, L: (b: { ar: string; en: string }) => string): Line[] =>
  order ? order.lines.map((l) => ({ name: L({ ar: l.nameAr, en: l.nameEn }), qty: l.unit === 'once' ? '1' : `${l.qty} ${l.unit === 'year' ? locale('سنة', 'yr') : locale('شهر', 'mo')}`, price: l.price })) : [{ name: inv.item, qty: '1', price: inv.amount }];

export function PortalInvoice() {
  const { t, L } = useI18n();
  const { id } = useParams();
  const { data } = usePortal();
  if (!data) return null;
  const inv = data.invoices.find((x) => x.id === id);
  if (!inv) return <Navigate to="/portal/billing" replace />;
  const order = (data.orders ?? []).find((o) => o.id === (inv as Invoice & { orderId?: string }).orderId);
  return (
    <Page title={`${t('فاتورة', 'Invoice')} ${inv.number}`} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => window.print()}>{t('طباعة / PDF', 'Print / PDF')}</button><Link to="/portal/billing" className="btn btn-ghost btn-sm">{t('← الفواتير', '← Billing')}</Link></div>}>
      <Sheet inv={inv} lines={toLines(order, inv, t, L)} biz={data.business ?? {}} taxRate={data.taxRate ?? 0} customer={data.me ?? { name: '', email: '' }} order={order} />
    </Page>
  );
}

export function AdminInvoice() {
  const { t, L } = useI18n();
  const { id } = useParams();
  const { all } = useAll();
  const [set, setSet] = useState<{ business?: Business; taxRate?: number } | null>(null);
  useEffect(() => { api<{ business?: Business; taxRate?: number }>('admin/settings').then(setSet).catch(() => setSet({})); }, []);
  if (!all || !set) return null;
  const inv = all.items.invoices?.find((x) => x.id === id) as unknown as Invoice & { uid: string; orderId?: string } | undefined;
  if (!inv) return <Navigate to="/admin/invoices" replace />;
  const order = (all.items.orders as unknown as Order[] | undefined)?.find((o) => o.id === inv.orderId);
  const u = all.users.find((x) => x.id === inv.uid);
  return (
    <Page title={`${t('فاتورة', 'Invoice')} ${inv.number}`} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => window.print()}>{t('طباعة / PDF', 'Print / PDF')}</button><Link to="/admin/invoices" className="btn btn-ghost btn-sm">{t('← الفواتير', '← Invoices')}</Link></div>}>
      <Sheet inv={inv} lines={toLines(order, inv, t, L)} biz={set.business ?? {}} taxRate={set.taxRate ?? 0} customer={u ? { name: u.name, email: u.email, phone: u.phone, company: u.company } : { name: '-', email: '' }} order={order} />
      {u && <p className="muted"><ClientLine users={all.users} uid={u.id} /></p>}
    </Page>
  );
}
