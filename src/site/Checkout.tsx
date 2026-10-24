import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { ApiError, api, post } from '../lib/api';
import type { Order, PayMethod } from '../lib/types';
import { TermsBox, termsText, useTerms } from '../portal/Identity';
import { useCart } from './cart';
import { unitLabel, usePriced } from './CartPages';
import { type CPlan, useCatalog } from './catalog';
import { Money } from './parts';
import { useCurrency } from './settings';
import { clearSetup, readSetup } from '../portal/EmailApp';

type Mode = 'existing' | 'new' | 'transfer' | 'external';
type Route = { mode: 'none' | 'ip' | 'cname'; value: string };
type Choice = { mode: Mode; name: string; epp: string; route: Route };
type Found = { domain: string; tld: string; available: boolean; sell: number; currency: string };
const KEY = 'nc-domain-choice';
const SUGGEST = ['hello', 'info', 'sales', 'support', 'contact', 'billing', 'admin', 'team'];
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const empty: Choice = { mode: 'new', name: '', epp: '', route: { mode: 'none', value: '' } };
const loadChoice = (): Choice => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && v.mode ? { ...empty, ...v } : empty; } catch { return empty; } };

const typeLabel = (m: PayMethod, t: (a: string, e: string) => string) => ({ bank: t('تحويل بنكي', 'Bank transfer'), wallet: t('محفظة / إنستا باي', 'Wallet / InstaPay'), card: t('بطاقة / رابط دفع', 'Card / payment link'), instapay: 'InstaPay', fawateerk: 'Fawateerk', cash: t('كاش', 'Cash'), stripe: t('بطاقة أونلاين', 'Card online'), paymob: t('بطاقة / محفظة أونلاين', 'Card / wallet online'), other: t('أخرى', 'Other') } as Record<string, string>)[m.type] ?? m.type;

function Step({ n, title, hint, children, done }: { n: number; title: string; hint?: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className={`co-step${done ? ' done' : ''}`}>
      <header><span className="co-n latin">{done ? '✓' : n}</span><div><h3>{title}</h3>{hint && <p className="muted">{hint}</p>}</div></header>
      <div className="co-body">{children}</div>
    </section>
  );
}

/** One page for the whole purchase: what you buy, the domain it hangs on, extras, your account (sign in or create it right here) and payment. */
export function CheckoutPage() {
  const { t, L, lang } = useI18n();
  const nav = useNavigate();
  const cur = useCurrency();
  const { user, mode: authMode, login, refresh } = useAuth();
  const { items, setQty, remove, clear, addDomain, addTransfer, removeWhere, replacePlan } = useCart();
  const { of, ready } = useCatalog();
  const priced = usePriced();
  const terms = useTerms();
  const [choice, setChoiceState] = useState<Choice>(loadChoice);
  const setChoice = (c: Choice) => { setChoiceState(c); try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } };
  const [mine, setMine] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [method, setMethod] = useState('');
  const [q, setQ] = useState(''); const [found, setFound] = useState<Found[] | null>(null); const [busySearch, setBusySearch] = useState(false); const [searchErr, setSearchErr] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const [acc, setAcc] = useState({ name: '', email: '', phone: '', company: '', password: '', code: '' });
  const [needCode, setNeedCode] = useState(false);
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState(''); const [code, setCode] = useState('');
  const [off, setOff] = useState<{ code: string; discount: number } | null>(null); const [cerr, setCerr] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ payments?: PayMethod[] }>('public/catalog').then((r) => { setMethods(r.payments ?? []); }).catch(() => undefined); }, []);
  useEffect(() => { if (user && authMode === 'server') api<{ domains: { id: string; name: string; status: string }[] }>('me/data').then((r) => setMine(r.domains.filter((d) => d.status !== 'archived'))).catch(() => undefined); }, [user, authMode]);

  const plans = items.filter((i) => i.kind === 'plan').map((i) => (i.kind === 'plan' ? of('hosting').concat(of('email'), of('vps'), of('site'), of('bundle')).find((p) => p.id === i.id) : undefined)).filter(Boolean) as CPlan[];
  const needsDomain = priced.some((p) => p?.needsDomain);
  const emailPlans = of('email');
  const cartEmail = plans.find((p) => p.category === 'email');
  const hasDomainLine = items.some((i) => i.kind === 'domain' || i.kind === 'transfer');
  const total = priced.reduce((n, p) => n + (p?.price ?? 0), 0);
  const discount = off?.discount ?? 0;
  const domainName = choice.name.trim().toLowerCase();
  const domainOk = DOMAIN_RE.test(domainName) && (choice.mode !== 'transfer' || choice.epp.trim() !== '') && (choice.mode !== 'new' || items.some((i) => i.kind === 'domain' && i.name === domainName)) && (choice.mode !== 'transfer' || items.some((i) => i.kind === 'transfer' && i.name === domainName));
  const needDomainNow = needsDomain || hasDomainLine;
  const routeOk = choice.route.mode === 'none' || (choice.route.mode === 'ip' ? /^[0-9a-fA-F:.]+$/.test(choice.route.value.trim()) : DOMAIN_RE.test(choice.route.value.trim().toLowerCase()));

  // Setup from the email page (plan + domain + names) arrives here as the starting point.
  useEffect(() => { const s = readSetup(); if (s && s.domain) { setChoiceState((c) => (c.name ? c : { ...c, mode: 'external', name: s.domain })); setNames(s.names); } }, []);
  useEffect(() => { if (cartEmail && names.length === 0) setNames(SUGGEST.slice(0, Math.max(1, Math.min(cartEmail.seats ?? 5, 5)))); }, [cartEmail, names.length]);

  const search = async (e: FormEvent) => {
    e.preventDefault(); setSearchErr(''); setFound(null); setBusySearch(true);
    try { const r = await api<{ results: Found[] }>('public/domain-search', undefined, { q: q.trim() }); setFound(r.results); }
    catch { setSearchErr(t('تعذّر البحث، حاول تاني.', 'Search failed, please try again.')); } finally { setBusySearch(false); }
  };
  const pickNew = (name: string) => { removeWhere((x) => x.kind === 'domain' || x.kind === 'transfer'); addDomain(name); setChoice({ ...choice, mode: 'new', name, epp: '' }); setFound(null); };
  const pickTransfer = () => { const n = choice.name.trim().toLowerCase(); if (!DOMAIN_RE.test(n)) return; removeWhere((x) => x.kind === 'domain' || x.kind === 'transfer'); addTransfer(n); };
  const switchMode = (m: Mode) => { removeWhere((x) => x.kind === 'domain' || x.kind === 'transfer'); setChoice({ mode: m, name: m === 'existing' ? (mine[0]?.name ?? '') : '', epp: '', route: { mode: 'none', value: '' } }); setFound(null); };
  const setEmailPlan = (id: string) => { replacePlan(emailPlans.map((p) => p.id), id); if (!id) setNames([]); };
  const applyCoupon = async () => { setCerr(''); setOff(null); if (!user) { setCerr(t('هيتأكد من الكوبون لما تأكد الطلب.', 'The code is checked when you place the order.')); return; } try { setOff(await post<{ code: string; discount: number }>('orders/coupon', { code, total })); } catch (x) { setCerr(x instanceof ApiError && x.message ? x.message : t('الكوبون مش صالح.', 'Invalid coupon.')); } };

  const termsRequired = !!terms && terms.required && !!(terms.ar || terms.en);
  const accountOk = !!user || (tab === 'login' ? acc.email.trim() !== '' && acc.password !== '' : acc.name.trim() !== '' && /\S+@\S+\.\S+/.test(acc.email) && acc.password.length >= 8 && (!termsRequired || agree));
  const canPlace = !busy && total > 0 && accountOk && (!needDomainNow || (domainOk && routeOk)) && !(methods.length > 0 && !(method || methods[0]?.id));

  const place = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if (!user) {
        if (tab === 'login') { await login(acc.email.trim(), acc.password, needCode ? acc.code.trim() : undefined); }
        else { await post('auth/register', { name: acc.name.trim(), email: acc.email.trim(), phone: acc.phone.trim(), company: acc.company.trim(), password: acc.password, acceptTerms: agree }); await refresh(); }
      }
      const setup = readSetup(); const useSetup = !!setup && items.some((i) => i.kind === 'plan' && i.id === setup.planId);
      const body = { items, method: method || methods[0]?.id || '', note, coupon: off ? off.code : code.trim(), domainChoice: needDomainNow ? { mode: choice.mode, name: domainName, epp: choice.epp.trim(), route: choice.route } : undefined, mailboxes: cartEmail ? (useSetup ? setup!.names : names).map((n) => n.trim().toLowerCase()).filter(Boolean) : undefined };
      const r = await post<{ order: Order }>('orders/create', body);
      clear(); if (useSetup) clearSetup(); try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      nav(`/portal/orders/${r.order.id}`);
    } catch (x) {
      const m = x instanceof ApiError ? x.message : '';
      if (m === 'two-factor code required') { setNeedCode(true); setError(t('اكتب كود التحقق بخطوتين.', 'Enter your two-factor code.')); }
      else setError(m.startsWith('domain is no longer available') ? t('أحد الدومينات اتحجز. اختار غيره.', 'One of the domains was just taken. Pick another.')
        : m === 'this email is already registered' ? t('الإيميل ده مسجّل قبل كده، سجّل دخول بدل ما تنشئ حساب.', 'This email is already registered: sign in instead.')
        : m === 'wrong email or password' ? t('الإيميل أو كلمة السر غلط.', 'Wrong email or password.')
        : m === 'a domain is required for this service' ? t('لازم تحدد دومين للخدمة دي.', 'A domain is required for this service.')
        : m === 'choose a payment method' ? t('اختار وسيلة الدفع.', 'Choose a payment method.')
        : m === 'terms' ? t('لازم توافق على الشروط والأحكام من حسابك الأول.', 'Accept the terms and conditions from your account first.')
        : m.startsWith('enter a valid') ? t('راجع عنوان التوجيه للدومين.', 'Check the address the domain should point to.')
        : t('تعذّر إتمام الطلب. راجع البيانات وحاول تاني.', 'The order could not be placed. Check the details and try again.'));
    } finally { setBusy(false); }
  };

  const empty0 = ready && items.length === 0;
  return (
    <>
      <section className="container hero-wrap"><div className="hero hero-sm on-dark"><span className="eyebrow latin">CHECKOUT</span><h1>{t('إتمام الطلب', 'Checkout')}</h1><p>{t('كل حاجة في صفحة واحدة: الخدمات، الدومين، الإضافات، حسابك، والدفع.', 'Everything on one page: services, domain, extras, your account and payment.')}</p></div></section>
      <section className="section container">
        {empty0 ? (
          <div className="card co-empty"><h3>{t('السلة فاضية', 'Your cart is empty')}</h3><p className="muted">{t('اختار باقة أو دومين وضيفه للسلة.', 'Pick a plan or a domain and add it to the cart.')}</p><div className="row-actions"><Link className="btn btn-accent" to="/pricing">{t('الباقات والأسعار', 'Plans & pricing')}</Link><Link className="btn btn-ghost" to="/domains">{t('ابحث عن دومين', 'Find a domain')}</Link></div></div>
        ) : (
          <form className="co" onSubmit={place}>
            <div className="co-main">
              <Step n={1} title={t('طلبك', 'Your order')} done={items.length > 0}>
                {items.map((it, i) => { const p = priced[i]; return (
                  <div className="co-line" key={(it.kind === 'plan' ? it.id : it.kind + it.name)}>
                    <div><b>{p ? L(p.name) : (it.kind === 'plan' ? '…' : it.name)}</b>{!p && ready && <p className="muted">{t('العنصر ده مش متاح حاليًا.', 'This item is no longer available.')}</p>}</div>
                    {p && p.options.length > 1 ? <select className="select" aria-label={t('المدة', 'Term')} value={it.qty} onChange={(e) => setQty(i, Number(e.target.value))}>{p.options.map((o) => <option key={o} value={o}>{unitLabel(p.unit, o, t)}</option>)}</select> : p ? <span className="muted">{unitLabel(p.unit, it.qty, t)}</span> : null}
                    <b>{p ? <Money value={p.price} /> : '—'}</b>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (it.kind !== 'plan') setChoice({ ...choice, name: '' }); remove(i); }} aria-label={t('إزالة', 'Remove')}>×</button>
                  </div>); })}
                <p className="muted"><Link className="link" to="/pricing">{t('+ أضف خدمة', '+ Add a service')}</Link></p>
              </Step>

              {needDomainNow && (
                <Step n={2} title={t('الدومين', 'Domain')} hint={t('كل خدمة مربوطة بدومين. اختار طريقتك:', 'Every service is tied to a domain. Choose how you get it:')} done={domainOk}>
                  <div className="co-modes" role="radiogroup" aria-label={t('طريقة الدومين', 'Domain option')}>
                    {([['new', t('دومين جديد', 'Register a new domain')], ['existing', t('دومين عندي في حسابي', 'A domain already in my account')], ['transfer', t('نقل دومين لينا', 'Transfer a domain to us')], ['external', t('دومين عند مزوّد تاني', 'A domain I keep elsewhere')]] as [Mode, string][]).filter(([m]) => m !== 'existing' || mine.length > 0).map(([m, label]) => (
                      <label key={m} className={`co-mode${choice.mode === m ? ' on' : ''}`}><input type="radio" name="dm" checked={choice.mode === m} onChange={() => switchMode(m)} /><span>{label}</span></label>
                    ))}
                  </div>
                  {choice.mode === 'existing' && <div className="field"><label htmlFor="co-ex">{t('اختار الدومين', 'Choose the domain')}</label><select id="co-ex" className="select latin" dir="ltr" value={choice.name} onChange={(e) => setChoice({ ...choice, name: e.target.value })}>{mine.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}</select></div>}
                  {choice.mode === 'new' && (
                    <>
                      {domainOk && choice.mode === 'new' ? <p className="form-ok">{t('اخترت:', 'Chosen:')} <b className="latin">{domainName}</b> <button type="button" className="link" onClick={() => { removeWhere((x) => x.kind === 'domain'); setChoice({ ...choice, name: '' }); }}>{t('تغيير', 'Change')}</button></p> : (
                        <>
                          <div className="co-search"><input className="input latin" dir="ltr" aria-label={t('اسم الدومين', 'Domain name')} placeholder="yourbrand.com" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(e as never); }} /><button type="button" className="btn btn-accent" disabled={busySearch || !q.trim()} onClick={(e) => void search(e as never)}>{busySearch ? '…' : t('ابحث', 'Search')}</button></div>
                          {searchErr && <div className="form-error" role="alert">{searchErr}</div>}
                          {found && <ul className="co-results">{found.filter((f) => f.available).slice(0, 8).map((f) => <li key={f.domain}><b className="latin">{f.domain}</b><span><Money value={f.sell} /> <small className="muted">/ {t('سنة', 'yr')}</small></span><button type="button" className="btn btn-ghost btn-sm" onClick={() => pickNew(f.domain)}>{t('اختار', 'Choose')}</button></li>)}{found.filter((f) => f.available).length === 0 && <li className="muted">{t('مفيش متاح بالاسم ده. جرّب اسم تاني.', 'None available with that name. Try another.')}</li>}</ul>}
                        </>
                      )}
                    </>
                  )}
                  {choice.mode === 'transfer' && (
                    <div className="co-xfer">
                      <div className="field"><label htmlFor="co-tn">{t('الدومين اللي هتنقله', 'Domain to transfer')}</label><input id="co-tn" className="input latin" dir="ltr" placeholder="example.com" value={choice.name} onChange={(e) => { removeWhere((x) => x.kind === 'transfer'); setChoice({ ...choice, name: e.target.value.trim().toLowerCase() }); }} /></div>
                      <div className="field"><label htmlFor="co-te">{t('كود النقل (EPP) من المسجّل القديم', 'Transfer (EPP) code from the current registrar')}</label><input id="co-te" className="input latin" dir="ltr" autoComplete="off" value={choice.epp} onChange={(e) => setChoice({ ...choice, epp: e.target.value })} /></div>
                      <p className="muted">{t('افتح قفل الدومين عند المسجّل القديم الأول. النقل ممكن ياخد لحد 7 أيام، وبيتجدد سنة معاه.', 'Unlock the domain at the current registrar first. A transfer can take up to 7 days and adds a year to its term.')}</p>
                      {!items.some((i) => i.kind === 'transfer' && i.name === domainName) && <button type="button" className="btn btn-ghost btn-sm" disabled={!DOMAIN_RE.test(domainName)} onClick={pickTransfer}>{t('أضف النقل للطلب', 'Add the transfer to the order')}</button>}
                    </div>
                  )}
                  {choice.mode === 'external' && <div className="field"><label htmlFor="co-ext">{t('اسم الدومين', 'Domain name')}</label><input id="co-ext" className="input latin" dir="ltr" placeholder="example.com" value={choice.name} onChange={(e) => setChoice({ ...choice, name: e.target.value.trim().toLowerCase() })} /><p className="muted">{t('هتوجّه الـ DNS بتاعه لينا بعد التفعيل ونوريك إزاي.', 'You will point its DNS to us after activation and we will show you how.')}</p></div>}
                  {(choice.mode === 'new' || choice.mode === 'transfer') && domainOk && (
                    <fieldset className="co-route"><legend>{t('الدومين يشاور على فين؟', 'Where should the domain point?')}</legend>
                      {([['none', t('هحدد بعدين', 'Decide later')], ['ip', t('عنوان IP (سيرفرك)', 'An IP address (your server)')], ['cname', t('اسم مضيف (www)', 'A host name (www)')]] as [Route['mode'], string][]).map(([m, label]) => <label key={m} className="check"><input type="radio" name="rt" checked={choice.route.mode === m} onChange={() => setChoice({ ...choice, route: { mode: m, value: '' } })} /> {label}</label>)}
                      {choice.route.mode !== 'none' && <input className="input latin" dir="ltr" aria-label={t('العنوان', 'Address')} placeholder={choice.route.mode === 'ip' ? '203.0.113.10' : 'target.example.com'} value={choice.route.value} onChange={(e) => setChoice({ ...choice, route: { ...choice.route, value: e.target.value } })} />}
                      {!routeOk && <div className="form-error" role="alert">{t('العنوان غير صحيح.', 'That address is not valid.')}</div>}
                      <p className="muted">{t('بنضيف سجلات الـ DNS دي أول ما الدومين يتفعّل، وتقدر تغيّرها بعدين من صفحة الدومين.', 'These DNS records are added as soon as the domain is active, and you can change them later from the domain page.')}</p>
                    </fieldset>
                  )}
                </Step>
              )}

              {needDomainNow && domainOk && emailPlans.length > 0 && (
                <Step n={3} title={t('إضافات', 'Extras')} hint={t('اختياري', 'Optional')}>
                  <div className="co-addon">
                    <div><b>{t('إيميلات أعمال على', 'Business email on')} <Ltr>{domainName}</Ltr></b><p className="muted">{t('hello@ وinfo@ وغيرهم على دومينك، بحماية سبام وتطبيق موبايل.', 'hello@, info@ and more on your domain, with spam protection and a mobile app.')}</p></div>
                    <select className="select" aria-label={t('باقة الإيميل', 'Email plan')} value={cartEmail?.id ?? ''} onChange={(e) => setEmailPlan(e.target.value)}>
                      <option value="">{t('من غير إيميلات', 'No email')}</option>
                      {emailPlans.map((p) => <option key={p.id} value={p.id}>{L(p.name)} · {p.price.toLocaleString('en-US')} {cur} / {p.per === 'year' ? t('سنة', 'yr') : t('شهر', 'mo')}</option>)}
                    </select>
                  </div>
                  {cartEmail && (
                    <div className="co-names"><span className="muted">{t('الصناديق اللي هنحجزها (عدّل الأسماء):', 'Mailboxes we reserve (edit the names):')}</span>
                      <div className="chips">{names.map((n, i) => <span key={i} className="chip"><input className="latin" dir="ltr" aria-label={t('اسم الإيميل', 'Mailbox name')} value={n} size={Math.max(5, n.length)} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value.replace(/[^a-zA-Z0-9._-]/g, '') : x)))} /><small className="muted latin">@{domainName}</small><button type="button" aria-label={t('حذف', 'Remove')} onClick={() => setNames(names.filter((_, j) => j !== i))}>×</button></span>)}
                        {names.length < (cartEmail.seats && cartEmail.seats > 0 ? cartEmail.seats : 20) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNames([...names, SUGGEST.find((s) => !names.includes(s)) ?? ''])}>+</button>}</div>
                    </div>
                  )}
                </Step>
              )}

              {!user && authMode !== 'offline' && (
                <Step n={needDomainNow ? (emailPlans.length > 0 ? 4 : 3) : 2} title={t('حسابك', 'Your account')} hint={t('محتاجين حسابك عشان نتابع الطلب والخدمات.', 'We need an account to follow your order and services.')} done={accountOk}>
                  <div className="tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>{t('عميل جديد', 'New customer')}</button><button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>{t('عندي حساب', 'I have an account')}</button></div>
                  <div className="admin-form">
                    {tab === 'register' && <div className="field"><label htmlFor="ac-n">{t('الاسم', 'Full name')}</label><input id="ac-n" className="input" autoComplete="name" required value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} /></div>}
                    <div className="field"><label htmlFor="ac-e">{t('الإيميل', 'Email')}</label><input id="ac-e" className="input latin" dir="ltr" type="email" autoComplete="email" required value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></div>
                    {tab === 'register' && <div className="field"><label htmlFor="ac-p">{t('الموبايل', 'Phone')}</label><input id="ac-p" className="input latin" dir="ltr" autoComplete="tel" value={acc.phone} onChange={(e) => setAcc({ ...acc, phone: e.target.value })} /></div>}
                    {tab === 'register' && <div className="field"><label htmlFor="ac-c">{t('الشركة (اختياري)', 'Company (optional)')}</label><input id="ac-c" className="input" autoComplete="organization" value={acc.company} onChange={(e) => setAcc({ ...acc, company: e.target.value })} /></div>}
                    <div className="field"><label htmlFor="ac-w">{tab === 'register' ? t('كلمة السر (8 حروف على الأقل)', 'Password (8+ characters)') : t('كلمة السر', 'Password')}</label><input id="ac-w" className="input latin" dir="ltr" type="password" autoComplete={tab === 'register' ? 'new-password' : 'current-password'} required minLength={tab === 'register' ? 8 : undefined} value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} /></div>
                    {tab === 'login' && needCode && <div className="field"><label htmlFor="ac-t">{t('كود التحقق بخطوتين', 'Two-factor code')}</label><input id="ac-t" className="input latin" dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={acc.code} onChange={(e) => setAcc({ ...acc, code: e.target.value })} /></div>}
                  </div>
                  {tab === 'register' && termsRequired && <><details className="co-terms"><summary>{t('اقرا الشروط والأحكام', 'Read the terms and conditions')}</summary><TermsBox terms={terms} /></details><label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {t('قرأت الشروط والأحكام وأوافق عليها', 'I have read and accept the terms and conditions')}{termsText(terms, lang) === '' ? null : null}</label></>}
                  {tab === 'login' && <Link className="link" to="/portal/forgot">{t('نسيت كلمة السر؟', 'Forgot your password?')}</Link>}
                </Step>
              )}

              <Step n={needDomainNow ? (emailPlans.length > 0 ? (user ? 4 : 5) : (user ? 3 : 4)) : (user ? 2 : 3)} title={t('الدفع', 'Payment')} done={methods.length === 0 || !!(method || methods[0]?.id)}>
                {methods.length === 0 ? <p className="muted">{t('هنتواصل معاك بعد الطلب لتحديد طريقة الدفع.', 'We will contact you after the order to arrange payment.')}</p> : methods.map((m) => (
                  <label key={m.id} className={`pay-opt${(method || methods[0].id) === m.id ? ' on' : ''}`}><input type="radio" name="pm" checked={(method || methods[0].id) === m.id} onChange={() => setMethod(m.id)} /><span><b>{L({ ar: m.nameAr || m.nameEn, en: m.nameEn || m.nameAr })}</b> <span className="muted">· {typeLabel(m, t)}</span></span></label>
                ))}
                <p className="muted">{t('تفاصيل الدفع بتظهر لك بعد تأكيد الطلب. بعد ما تدفع، ابعت رقم العملية من صفحة الطلب.', 'Payment details appear after you place the order. Once you have paid, send the reference from the order page.')}</p>
                <div className="field"><label htmlFor="cn">{t('ملاحظات (اختياري)', 'Notes (optional)')}</label><textarea id="cn" className="textarea" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
              </Step>
            </div>

            <aside className="co-sum card">
              <h3>{t('ملخص الطلب', 'Order summary')}</h3>
              <ul className="cart-lines">{priced.map((p, i) => p && <li key={i}><span>{L(p.name)} <small className="muted">· {unitLabel(p.unit, p.item.qty, t)}</small></span><b className="latin">{p.price.toLocaleString('en-US')}</b></li>)}</ul>
              <div className="coupon-row"><input className="input latin" dir="ltr" placeholder={t('كوبون خصم', 'Discount code')} value={code} onChange={(e) => { setCode(e.target.value); setOff(null); setCerr(''); }} maxLength={40} /><button type="button" className="btn btn-ghost btn-sm" disabled={!code.trim()} onClick={applyCoupon}>{t('تطبيق', 'Apply')}</button></div>
              {cerr && <p className="muted" role="status">{cerr}</p>}
              {off && <ul className="cart-lines"><li><span>{t('خصم', 'Discount')} <small className="latin">({off.code})</small></span><b className="latin">−{off.discount.toLocaleString('en-US')}</b></li></ul>}
              <div className="cart-total"><span>{t('الإجمالي', 'Total')}</span><b className="latin">{(total - discount).toLocaleString('en-US')} {cur}</b></div>
              {error && <div className="form-error" role="alert">{error}</div>}
              {authMode === 'offline' && <div className="form-error" role="alert">{t('الموقع مش متصل بالباك إند حاليًا.', 'The site is not connected to its backend right now.')}</div>}
              <button className="btn btn-accent" type="submit" disabled={!canPlace || authMode === 'offline'}>{busy ? '…' : user ? t('تأكيد الطلب', 'Place order') : tab === 'register' ? t('أنشئ الحساب وأكّد الطلب', 'Create account & place order') : t('سجّل دخول وأكّد الطلب', 'Sign in & place order')}</button>
              {!canPlace && !busy && total > 0 && <p className="muted">{needDomainNow && !domainOk ? t('حدد الدومين عشان تكمّل.', 'Choose the domain to continue.') : !accountOk ? t('كمّل بيانات حسابك.', 'Complete your account details.') : ''}</p>}
            </aside>
          </form>
        )}
      </section>
    </>
  );
}

