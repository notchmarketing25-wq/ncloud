import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { ApiError, post } from '../lib/api';
import type { Order, PayMethod } from '../lib/types';
import { usePortal } from '../portal/PortalData';
import { day, InvoiceTag, Modal, Page, Table } from '../ui';
import { useCart, type CartItem } from './cart';
import { type CPlan, useCatalog } from './catalog';
import { Money } from './parts';
import { useCurrency } from './settings';
import { useAuth } from '../auth';

const PERIODS: Record<string, number[]> = { month: [1, 3, 6, 12], year: [1, 2, 3], once: [1] };
export type Priced = { item: CartItem; name: { ar: string; en: string }; unit: string; price: number; options: number[]; needsDomain: boolean } | null;

/** The cart as a customer sees it. The server computes the real total again when the order is placed. */
export function usePriced(): Priced[] {
  const { items } = useCart();
  const { plans, tlds } = useCatalog();
  const { t } = useI18n();
  return useMemo(() => items.map((it): Priced => {
    if (it.kind === 'plan') {
      const p: CPlan | undefined = plans.find((x) => x.id === it.id);
      if (!p) return null;
      return { item: it, name: p.name, unit: p.per, price: p.price * it.qty, options: PERIODS[p.per] ?? [1], needsDomain: p.category === 'hosting' || p.category === 'site' || p.category === 'bundle' };
    }
    const tl = tlds.filter((x) => it.name.endsWith(x.ext)).sort((a, b) => b.ext.length - a.ext.length)[0];
    if (!tl) return null;
    return { item: it, name: { ar: `تسجيل دومين ${it.name}`, en: `Domain registration ${it.name}` }, unit: 'year', price: tl.register + (it.qty - 1) * tl.renew, options: [1, 2, 3, 5, 10], needsDomain: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, plans, tlds, t]);
}

export const unitLabel = (unit: string, qty: number, t: (a: string, e: string) => string) => (unit === 'once' ? t('مرة واحدة', 'One-time') : unit === 'year' ? t(`${qty} سنة`, `${qty} yr`) : t(`${qty} شهر`, `${qty} mo`));

/** Public cart page. */
export function CartPage() {
  const { t, L } = useI18n();
  const { user } = useAuth();
  const { items, setQty, remove } = useCart();
  const { ready } = useCatalog();
  const priced = usePriced();
  const total = priced.reduce((n, p) => n + (p?.price ?? 0), 0);
  const checkout = '/portal/checkout';
  return (
    <>
      <section className="container hero-wrap"><div className="hero hero-sm on-dark"><span className="eyebrow latin">CART</span><h1>{t('سلة الطلبات', 'Your cart')}</h1><p>{t('راجع طلبك، اختار مدة الاشتراك وكمّل للدفع.', 'Review your order, pick the term and continue to payment.')}</p></div></section>
      <section className="section container">
        {ready && items.length === 0 ? (
          <div className="card"><h3>{t('السلة فاضية', 'Your cart is empty')}</h3><p>{t('اختار باقة أو دومين وضيفه للسلة.', 'Pick a plan or a domain and add it to the cart.')}</p><div className="cta-btns"><Link to="/pricing" className="btn btn-accent">{t('الباقات والأسعار', 'Plans & pricing')}</Link><Link to="/domains" className="btn btn-ghost">{t('ابحث عن دومين', 'Find a domain')}</Link></div></div>
        ) : (
          <div className="cart">
            <div className="cart-list">
              {items.map((it, i) => {
                const p = priced[i];
                return (
                  <div className="card cart-row" key={it.kind === 'plan' ? it.id : it.name}>
                    <div><b>{p ? L(p.name) : (it.kind === 'domain' ? it.name : '…')}</b>{!p && ready && <p className="muted">{t('العنصر ده مش متاح حاليًا.', 'This item is no longer available.')}</p>}</div>
                    {p && p.options.length > 1 && <select className="select" aria-label={t('المدة', 'Term')} value={it.qty} onChange={(e) => setQty(i, Number(e.target.value))}>{p.options.map((o) => <option key={o} value={o}>{unitLabel(p.unit, o, t)}</option>)}</select>}
                    {p && p.options.length === 1 && <span className="muted">{unitLabel(p.unit, it.qty, t)}</span>}
                    <b>{p ? <Money value={p.price} /> : '—'}</b>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(i)} aria-label={t('إزالة', 'Remove')}>×</button>
                  </div>
                );
              })}
            </div>
            <aside className="card cart-sum">
              <h3>{t('الإجمالي', 'Total')}</h3>
              <div className="cart-total"><Money value={total} /></div>
              <p className="muted">{t('بتختار وسيلة الدفع في الخطوة الجاية.', 'You choose the payment method in the next step.')}</p>
              <Link className="btn btn-accent" to={user ? checkout : `/portal/login?next=${encodeURIComponent(checkout)}`} aria-disabled={total <= 0}>{t('إتمام الطلب', 'Checkout')}</Link>
              {!user && <p className="muted">{t('هتسجّل دخول أو تنشئ حساب في الخطوة الجاية.', 'You will sign in or create an account next.')} <Link className="link" to={`/portal/register?next=${encodeURIComponent(checkout)}`}>{t('حساب جديد', 'New account')}</Link></p>}
            </aside>
          </div>
        )}
      </section>
    </>
  );
}

/** Old "/portal/order/:id" links: put the plan in the cart and open it. */
export function OrderRedirect() {
  const { id } = useParams();
  const { addPlan } = useCart();
  const nav = useNavigate();
  useState(() => { if (id) addPlan(id); nav('/cart', { replace: true }); });
  return null;
}

const typeLabel = (m: PayMethod, t: (a: string, e: string) => string) => ({ bank: t('تحويل بنكي', 'Bank transfer'), wallet: t('محفظة / إنستا باي', 'Wallet / InstaPay'), card: t('بطاقة / رابط دفع', 'Card / payment link'), cash: t('كاش عند الاستلام', 'Cash'), other: t('أخرى', 'Other') }[m.type]);

export function PayDetails({ m }: { m: PayMethod }) {
  const { t, L } = useI18n();
  const urls = (m.details ?? '').split(/(\bhttps?:\/\/\S+)/g);
  return (
    <div className="pay-box"><b>{L({ ar: m.nameAr || m.nameEn, en: m.nameEn || m.nameAr })}</b> <span className="tag">{typeLabel(m, t)}</span>
      {m.details && <p className="pay-details">{urls.map((x, i) => (/^https?:\/\//.test(x) ? <a key={i} className="link latin" href={x} target="_blank" rel="noreferrer">{x}</a> : <span key={i}>{x}</span>))}</p>}
    </div>
  );
}

/** Portal checkout: payment method, domain for the plans, notes → creates the order and its invoice. */
export function Checkout() {
  const { t, L } = useI18n();
  const nav = useNavigate();
  const { data, reload } = usePortal();
  const { items, clear } = useCart();
  const { mode } = useAuth();
  const priced = usePriced();
  const cur = useCurrency();
  const [method, setMethod] = useState('');
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (mode !== 'server') return <Page title={t('إتمام الطلب', 'Checkout')}><div className="empty-note nt-hatch">{t('الطلبات بتشتغل بعد تثبيت الموقع على استضافة PHP.', 'Orders work once the site is installed on a PHP host.')}</div></Page>;
  if (!data) return null;
  if (items.length === 0) return <Page title={t('إتمام الطلب', 'Checkout')}><div className="empty-note nt-hatch">{t('السلة فاضية.', 'Your cart is empty.')}</div><Link to="/pricing" className="btn btn-ghost btn-sm">{t('الباقات والأسعار', 'Plans & pricing')}</Link></Page>;
  const methods = data.payments ?? [];
  const total = priced.reduce((n, p) => n + (p?.price ?? 0), 0);
  const needsDomain = priced.some((p) => p?.needsDomain);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await post<{ order: Order }>('orders/create', { items, method: method || methods[0]?.id || '', domain: domain.trim(), note });
      clear(); await reload(); nav(`/portal/orders/${r.order.id}`);
    } catch (x) {
      const m = x instanceof ApiError ? x.message : '';
      setError(m.startsWith('domain is no longer available') ? t('أحد الدومينات اتحجز. شيله من السلة وجرّب غيره.', 'One of the domains was just taken. Remove it from the cart and try another.') : m === 'choose a payment method' ? t('اختار وسيلة الدفع.', 'Choose a payment method.') : t('تعذّر إتمام الطلب، راجع السلة وحاول تاني.', 'Could not place the order. Check the cart and try again.'));
    } finally { setBusy(false); }
  };
  return (
    <Page title={t('إتمام الطلب', 'Checkout')} action={<Link to="/cart" className="btn btn-ghost btn-sm">{t('← السلة', '← Cart')}</Link>}>
      <form className="cart" onSubmit={submit}>
        <div className="cart-list">
          <div className="card form">
            <h3>{t('وسيلة الدفع', 'Payment method')}</h3>
            {methods.length === 0 ? <p className="muted">{t('هنتواصل معاك بعد الطلب لتحديد طريقة الدفع.', 'We will contact you after the order to arrange payment.')}</p> : methods.map((m) => (
              <label key={m.id} className={`pay-opt${(method || methods[0].id) === m.id ? ' on' : ''}`}>
                <input type="radio" name="pm" checked={(method || methods[0].id) === m.id} onChange={() => setMethod(m.id)} />
                <span><b>{L({ ar: m.nameAr || m.nameEn, en: m.nameEn || m.nameAr })}</b> <span className="muted">· {typeLabel(m, t)}</span></span>
              </label>
            ))}
            <p className="muted">{t('تفاصيل الدفع بتظهر لك بعد تأكيد الطلب، وبعد ما تدفع بتبعت رقم العملية من صفحة الطلب.', 'Payment details appear after you confirm the order; once you have paid, send the reference from the order page.')}</p>
          </div>
          {needsDomain && <div className="card form"><h3>{t('الدومين', 'Domain')}</h3><div className="field"><label htmlFor="cd">{t('الدومين اللي هتربطه بالخدمة (اختياري)', 'The domain to use with the service (optional)')}</label><input id="cd" className="input latin" dir="ltr" maxLength={253} placeholder="yourbrand.com" value={domain} onChange={(e) => setDomain(e.target.value)} /></div></div>}
          <div className="card form"><div className="field"><label htmlFor="cn">{t('ملاحظات (اختياري)', 'Notes (optional)')}</label><textarea id="cn" className="textarea" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></div></div>
        </div>
        <aside className="card cart-sum">
          <h3>{t('ملخص الطلب', 'Order summary')}</h3>
          <ul className="cart-lines">{priced.map((p, i) => p && <li key={i}><span>{L(p.name)} <small className="muted">· {unitLabel(p.unit, p.item.qty, t)}</small></span><b className="latin">{p.price.toLocaleString('en-US')}</b></li>)}</ul>
          <div className="cart-total"><span>{t('الإجمالي', 'Total')}</span><b className="latin">{total.toLocaleString('en-US')} {cur}</b></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-accent" type="submit" disabled={busy || total <= 0}>{busy ? '…' : t('تأكيد الطلب', 'Place order')}</button>
        </aside>
      </form>
    </Page>
  );
}

export const OrderTag = ({ s }: { s: Order['status'] }) => {
  const { t } = useI18n();
  const map = { pending: ['warn', 'في انتظار الدفع', 'Awaiting payment'], paid: ['ok', 'مدفوع', 'Paid'], active: ['ok', 'مفعّل', 'Active'], cancelled: ['', 'ملغي', 'Cancelled'] } as const;
  const [cls, ar, en] = map[s] ?? ['', s, s];
  return <span className={`tag ${cls}`}>{t(ar, en)}</span>;
};

/** Portal → Orders. */
export function PortalOrders() {
  const { t } = useI18n();
  const nav = useNavigate();
  const cur = useCurrency();
  const { data } = usePortal();
  if (!data) return null;
  const orders = [...(data.orders ?? [])].sort((a, b) => b.created.localeCompare(a.created));
  return (
    <Page title={t('الطلبات', 'Orders')} action={<Link to="/pricing" className="btn btn-primary btn-sm">{t('+ طلب جديد', '+ New order')}</Link>}>
      {orders.length === 0 ? <div className="empty-note nt-hatch">{t('مفيش طلبات لسه. اختار باقة وضيفها للسلة.', 'No orders yet. Pick a plan and add it to the cart.')}</div> : (
        <Table head={[t('الرقم', 'No.'), t('التاريخ', 'Date'), t('الطلب', 'Order'), t('الإجمالي', 'Total'), t('الحالة', 'Status')]}>
          {orders.map((o) => <tr key={o.id} className="row-link" onClick={() => nav(`/portal/orders/${o.id}`)}><td><Link className="link latin" to={`/portal/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link></td><td><Ltr>{day(o.created)}</Ltr></td><td>{o.summary}</td><td><b className="latin">{o.total}</b> {cur}</td><td><OrderTag s={o.status} /></td></tr>)}
        </Table>
      )}
    </Page>
  );
}

/** One order: lines, payment instructions, "I paid" with a reference, and its invoice. */
export function PortalOrderDetail() {
  const { t, L } = useI18n();
  const { id } = useParams();
  const cur = useCurrency();
  const { data, reload } = usePortal();
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const o = (data.orders ?? []).find((x) => x.id === id);
  if (!o) return <Navigate to="/portal/orders" replace />;
  const m = (data.payments ?? []).find((x) => x.id === o.method);
  const inv = data.invoices.find((x) => x.id === o.invoiceId);
  const sendPaid = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await post('orders/pay', { id: o.id, ref, method: o.method }); await reload(); setRef(''); } catch { setErr(t('تعذّر الإرسال، اكتب رقم العملية وحاول تاني.', 'Could not send. Enter the reference and try again.')); } finally { setBusy(false); }
  };
  return (
    <Page title={`${t('طلب', 'Order')} ${o.number}`} action={<div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => window.print()}>{t('طباعة', 'Print')}</button><Link to="/portal/orders" className="btn btn-ghost btn-sm">{t('← كل الطلبات', '← All orders')}</Link></div>}>
      <div className="cust-layout">
        <div>
          <div className="card">
            <div className="row-actions" style={{ justifyContent: 'space-between' }}><OrderTag s={o.status} />{inv && <span className="muted">{t('فاتورة', 'Invoice')} <Ltr>{inv.number}</Ltr> <InvoiceTag s={inv.status} /></span>}</div>
            <Table head={[t('البند', 'Item'), t('المدة', 'Term'), t('السعر', 'Price')]}>
              {o.lines.map((l, i) => <tr key={i}><td>{L({ ar: l.nameAr, en: l.nameEn })}</td><td>{unitLabel(l.unit, l.qty, t)}</td><td className="latin">{l.price.toLocaleString('en-US')}</td></tr>)}
            </Table>
            <div className="cart-total"><span>{t('الإجمالي', 'Total')}</span><b className="latin">{o.total.toLocaleString('en-US')} {cur}</b></div>
            {o.domain && <p className="muted">{t('الدومين:', 'Domain:')} <Ltr>{o.domain}</Ltr></p>}
          </div>
        </div>
        <aside>
          {o.status === 'pending' && (
            <div className="card">
              <h3>{t('الدفع', 'Payment')}</h3>
              {m ? <PayDetails m={m} /> : <p className="muted">{t('هنتواصل معاك لتحديد طريقة الدفع.', 'We will contact you to arrange payment.')}</p>}
              {o.payRef ? <p className="form-ok">{t('اتبعت رقم العملية:', 'Reference sent:')} <Ltr>{o.payRef}</Ltr><br />{t('بنراجع الدفع ونفعّل الخدمة.', 'We are verifying the payment and will activate the service.')}</p> : (
                <form className="form" onSubmit={sendPaid}>
                  <div className="field"><label htmlFor="pr">{t('رقم العملية / اسم المحوِّل', 'Transaction reference / sender name')}</label><input id="pr" className="input latin" required maxLength={160} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
                  {err && <div className="form-error" role="alert">{err}</div>}
                  <button className="btn btn-accent btn-sm" type="submit" disabled={busy}>{busy ? '…' : t('دفعت', 'I have paid')}</button>
                </form>
              )}
            </div>
          )}
          {o.status === 'paid' && <div className="card"><p className="form-ok">{t('الدفع اتأكد. بنجهّز الخدمة وهتظهر في حسابك.', 'Payment confirmed. We are setting up your service and it will appear in your account.')}</p></div>}
          {o.status === 'active' && <div className="card"><p className="form-ok">{t('الخدمة مفعّلة وظاهرة في حسابك.', 'Your service is active and visible in your account.')}</p></div>}
        </aside>
      </div>
    </Page>
  );
}

/** "Order …" button for a portal page: opens the plans of that category; picking one puts it in the cart and goes to checkout. Falls back to a support ticket in the demo build. */
export function OrderButton({ category, label, fallback }: { category: 'hosting' | 'email' | 'vps' | 'site'; label: string; fallback: string }) {
  const { t, L } = useI18n();
  const { mode } = useAuth();
  const { of, ready } = useCatalog();
  const { addPlan } = useCart();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (mode !== 'server') return <Link to={fallback} className="btn btn-primary btn-sm">{label}</Link>;
  const plans = of(category);
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title={label} onClose={() => setOpen(false)} wide>
          {ready && plans.length === 0 && <p className="muted">{t('مفيش باقات متاحة حاليًا. تواصل معنا.', 'No plans are available right now. Contact us.')} <Link className="link" to="/portal/support?new=order">{t('الدعم', 'Support')}</Link></p>}
          <div className="grid g3 plans">{plans.map((p) => (
            <article key={p.id} className={`plan${p.featured ? ' is-featured' : ''}`}>
              <header><h3>{L(p.name)}</h3></header>
              <div className="plan-price"><Money value={p.price} /> <span className="per">/ {p.per === 'year' ? t('سنة', 'yr') : p.per === 'once' ? t('مرة', 'once') : t('شهر', 'mo')}</span></div>
              <dl className="plan-specs">{p.specs.map((s) => <div key={s.label.en}><dt>{L(s.label)}</dt><dd className="latin">{L(s.value)}</dd></div>)}</dl>
              <div className="plan-cta"><button className="btn btn-accent" onClick={() => { addPlan(p.id); nav('/portal/checkout'); }}>{t('اطلب', 'Order')}</button></div>
            </article>
          ))}</div>
        </Modal>
      )}
    </>
  );
}
