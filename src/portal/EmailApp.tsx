import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { usePortal } from './PortalData';
import { useCart } from '../site/cart';
import { useCatalog, type CPlan } from '../site/catalog';
import { useCurrency } from '../site/settings';
import { Page } from '../ui';
import { copyText } from './Extras';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const SUGGEST = ['hello', 'sales', 'info', 'support', 'contact', 'billing', 'admin', 'hr', 'marketing', 'accounts', 'team', 'careers'];
const SETUP_KEY = 'nc-email-setup';
export type EmailSetup = { planId: string; domain: string; names: string[] };
export const readSetup = (): EmailSetup | null => { try { const v = JSON.parse(localStorage.getItem(SETUP_KEY) || 'null'); return v && typeof v.planId === 'string' ? v : null; } catch { return null; } };
export const clearSetup = () => { try { localStorage.removeItem(SETUP_KEY); } catch { /* ignore */ } };

/** One-line copy button. */
function Copy({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-ghost btn-sm" aria-label={t('نسخ', 'Copy')} onClick={async () => { setDone(await copyText(text)); window.setTimeout(() => setDone(false), 1800); }}>{done ? '✓' : label ?? t('نسخ', 'Copy')}</button>;
}

/** "My emails": status, numbers, the mailboxes with copy buttons, the login details and support. */
export function PortalEmail() {
  const { t } = useI18n();
  const { data } = usePortal();
  if (!data) return <Page title={t('الإيميلات', 'Email')}><p className="muted">…</p></Page>;
  const boxes = data.mailboxes.filter((m) => m.status !== 'archived');
  const ready = boxes.filter((m) => m.status === 'active').length;
  const pendingOrder = (data.orders ?? []).find((o) => o.status === 'pending' && boxes.some((m) => m.orderId === o.id));
  const domains = Array.from(new Set(boxes.map((m) => m.address.split('@')[1] ?? ''))).filter(Boolean);
  const srv = data.mailServer;
  const locked = ready === 0;
  return (
    <Page title={t('إيميلاتي', 'My email')} action={<div className="row-actions"><Link to="/mail" className="btn btn-primary btn-sm">N Emails</Link><Link to="/portal/email/new" className="btn btn-ghost btn-sm">{t('+ اطلب إيميلات', '+ Order email')}</Link></div>}>
      {pendingOrder && (
        <section className="em-hero">
          <div><span className="tag">{t('في انتظار الدفع', 'Awaiting payment')}</span><h2>{t('فاضل دفع المبلغ وتأكيد التحويل', 'Payment is the last step')}</h2><p>{t('الإيميلات محجوزة لحد تأكيد الدفع، وبعدها تشتغل فورًا وتفعّلها لكل فريقك.', 'Your mailboxes are reserved until payment is confirmed, then they switch on at once.')}</p></div>
          <Link to={`/portal/orders/${pendingOrder.id}`} className="btn btn-accent">{t('أكمل الدفع', 'Complete payment')} →</Link>
        </section>
      )}
      <div className="em-stats">
        <div className="card"><span className="muted">{t('إجمالي الإيميلات', 'Total mailboxes')}</span><b className="latin">{boxes.length}</b></div>
        <div className="card"><span className="muted">{t('جاهزة', 'Ready')}</span><b className="latin">{ready} / {boxes.length}</b></div>
        <div className="card"><span className="muted">{t('الدومينات', 'Domains')}</span><b className="latin">{domains.length}</b></div>
      </div>
      <div className="em-cols">
        <div>
          {boxes.length === 0 ? (
            <div className="card em-empty"><h3>{t('مفيش إيميلات لسه', 'No mailboxes yet')}</h3><p className="muted">{t('اختار عدد الإيميلات اللي شركتك محتاجاها وإحنا نجهزها على دومينك.', 'Choose how many mailboxes your company needs and we set them up on your domain.')}</p><Link to="/portal/email/new" className="btn btn-accent">{t('ابدأ التجهيز', 'Start setup')}</Link></div>
          ) : (
            <>
              <div className="em-head"><h3>{t('صناديق البريد', 'Mailboxes')} <span className="tag">{boxes.length}</span></h3><Copy text={boxes.map((m) => m.address).join('\n')} label={t('نسخ الكل', 'Copy all')} /></div>
              <div className="em-list">
                {boxes.map((m) => (
                  <div key={m.id} className="card em-box">
                    <div className="em-addr"><b className="latin">{m.address}</b><span className={`em-state ${m.status === 'active' ? 'ok' : ''}`}>{m.status === 'active' ? t('شغّال', 'Active') : m.status === 'pending' ? t('جاهز للتفعيل فور الدفع', 'Ready to switch on once paid') : m.status}</span></div>
                    <div className="row-actions"><Copy text={m.address} />{m.status === 'active' && <Link className="btn btn-primary btn-sm" to={`/mail?box=${m.id}`}>{t('افتح', 'Open')}</Link>}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="em-side">
          <div className="card">
            <h3>{t('بيانات الدخول', 'Login details')}</h3>
            <p className="muted">{locked ? t('مقفولة لحد ما الإيميلات تشتغل.', 'Locked until your mailboxes are active.') : t('اسم المستخدم هو الإيميل بالكامل، والباسورد اللي بعتناه لك.', 'The username is the full address, the password is the one we sent you.')}</p>
            {srv && (
              <div className="em-srv">
                <div><span className="muted">IMAP ({t('الوارد', 'incoming')})</span><b className="latin">{locked ? '••••••••••' : srv.imap.host}</b><span className="muted latin">Port {srv.imap.port} · SSL/TLS</span></div>
                <div><span className="muted">SMTP ({t('الصادر', 'outgoing')})</span><b className="latin">{locked ? '••••••••••' : srv.smtp.host}</b><span className="muted latin">Port {srv.smtp.port} · SSL/TLS</span></div>
              </div>
            )}
          </div>
          <div className="card em-help"><h3>{t('محتاج مساعدة؟', 'Need help?')}</h3><p className="muted">{t('فريق الدعم متاح لنقل بريدك الحالي وضبط الإعدادات.', 'Support can move your current mail and tune the settings.')}</p><Link to="/portal/support?new=mailbox" className="btn btn-ghost btn-sm">{t('تواصل معنا', 'Contact us')}</Link></div>
        </aside>
      </div>
    </Page>
  );
}

/** Choose the plan (how many mailboxes), then name them, then checkout. */
export function EmailPlans() {
  const { t, L } = useI18n();
  const nav = useNavigate();
  const cur = useCurrency();
  const { data } = usePortal();
  const { of, ready } = useCatalog();
  const { clear, addPlan } = useCart();
  const plans = useMemo(() => of('email').slice().sort((a, b) => (a.seats ?? 0) - (b.seats ?? 0) || a.price - b.price), [of]);
  const [planId, setPlanId] = useState('');
  const [step, setStep] = useState<'plan' | 'names'>('plan');
  const [domain, setDomain] = useState('');
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => { if (!planId && plans.length) setPlanId((plans.find((p) => p.featured) ?? plans[0]).id); }, [plans, planId]);
  const plan: CPlan | undefined = plans.find((p) => p.id === planId);
  const seats = plan?.seats && plan.seats > 0 ? plan.seats : 5;
  useEffect(() => { if (!domain && data?.domains[0]) setDomain(data.domains[0].name); }, [data, domain]);
  const yearly = plan ? (plan.per === 'year' ? plan.price : plan.price * 12) : 0;
  const perBox = plan ? yearly / 12 / seats : 0;
  const start = () => { setNames(SUGGEST.slice(0, seats)); setStep('names'); };
  const confirm = () => {
    if (!plan) return;
    try { localStorage.setItem(SETUP_KEY, JSON.stringify({ planId: plan.id, domain: domain.trim().toLowerCase(), names: names.map((n) => n.trim().toLowerCase()).filter(Boolean) } satisfies EmailSetup)); } catch { /* ignore */ }
    clear(); addPlan(plan.id); nav('/checkout');
  };
  const features = plan?.features ?? [];
  const bad = names.some((n) => n.trim() !== '' && !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(n.trim()));
  const okNames = names.map((n) => n.trim()).filter(Boolean);
  const dup = new Set(okNames.map((n) => n.toLowerCase())).size !== okNames.length;
  return (
    <Page title={t('طلب إيميلات', 'Order email')} action={<Link to="/portal/email" className="btn btn-ghost btn-sm">{t('← إيميلاتي', '← My email')}</Link>}>
      {!ready || !plan ? <div className="card"><p className="muted">{ready ? t('مفيش باقات إيميل متاحة حاليًا. تواصل معنا.', 'No email plans are available right now. Contact us.') : '…'}</p></div> : step === 'plan' ? (
        <div className="em-plans">
          <div className="card em-summary">
            <span className="tag">{t('بدون رسوم مخفية', 'No hidden fees')}</span>
            <p className="muted">{seats} {t('إيميلات', 'mailboxes')}</p>
            <div className="em-price"><b className="latin">{money(plan.price)}</b><span>{cur} / {plan.per === 'year' ? t('سنة', 'year') : t('شهر', 'month')}</span></div>
            <div className="em-per">{t('يعني حوالي', 'About')} <b className="latin">{money(perBox)} {cur}</b> / {t('إيميل شهريًا', 'mailbox per month')}</div>
            <button className="btn btn-accent" onClick={start}>{t('ابدأ التجهيز', 'Start setup')} →</button>
          </div>
          <div>
            <h2 style={{ marginTop: 0 }}>{t('اختار عدد الإيميلات', 'Choose the number of mailboxes')}</h2>
            <div className="em-tiers">
              {plans.map((p) => (
                <button key={p.id} type="button" className={`card em-tier${p.id === planId ? ' on' : ''}`} onClick={() => setPlanId(p.id)} aria-pressed={p.id === planId}>
                  {p.featured && <span className="tag">{t('الأكثر طلبًا', 'Most popular')}</span>}
                  <b>{L(p.name)}</b>
                  <span className="latin">{money(p.price)} {cur}</span>
                  <small className="muted">{p.per === 'year' ? t('سنويًا', 'yearly') : t('شهريًا', 'monthly')}{p.seats ? ` · ~${money((p.per === 'year' ? p.price : p.price * 12) / 12 / p.seats)} ${t('للإيميل شهريًا', 'per mailbox / month')}` : ''}</small>
                </button>
              ))}
            </div>
            {features.length > 0 && <ul className="em-feat">{features.map((f, i) => <li key={i}>✓ {L(f)}</li>)}</ul>}
          </div>
        </div>
      ) : (
        <div className="em-wizard">
          <div className="card form">
            <h3>{t('دي الإيميلات المقترحة لشركتك — أكّدها أو عدّلها', 'Suggested mailboxes for your company — confirm or edit them')}</h3>
            <div className="field"><label htmlFor="em-d">{t('الدومين', 'Domain')}</label>
              <input id="em-d" className="input latin" dir="ltr" list="em-doms" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
              <datalist id="em-doms">{(data?.domains ?? []).map((d) => <option key={d.id} value={d.name} />)}</datalist></div>
            <div className="em-names">
              {names.map((n, i) => (
                <div key={i} className="em-name"><input className="input latin" dir="ltr" aria-label={t('اسم الإيميل', 'Mailbox name')} value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value.replace(/[^a-zA-Z0-9._-]/g, '') : x)))} /><span className="latin muted">@{domain || 'domain'}</span>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={t('حذف', 'Remove')} onClick={() => setNames(names.filter((_, j) => j !== i))}>×</button></div>
              ))}
              {names.length < seats && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNames([...names, SUGGEST.find((s) => !names.includes(s)) ?? ''])}>{t('+ إيميل', '+ Mailbox')} ({names.length}/{seats})</button>}
            </div>
            {bad && <div className="form-error" role="alert">{t('الاسم بحروف إنجليزي وأرقام و . _ - فقط.', 'Use letters, digits and . _ - only.')}</div>}
            {dup && <div className="form-error" role="alert">{t('فيه اسم متكرر.', 'A name is repeated.')}</div>}
            <div className="row-actions"><button className="btn btn-accent" disabled={!domain.trim() || okNames.length === 0 || bad || dup} onClick={confirm}>{t('تمام، كمّل الطلب', 'Looks good, continue to checkout')} →</button><button className="btn btn-ghost" onClick={() => setStep('plan')}>{t('← الباقة', '← Plan')}</button></div>
          </div>
        </div>
      )}
    </Page>
  );
}

export { Ltr };
