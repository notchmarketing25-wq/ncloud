import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useCart } from './cart';
import { tlds } from '../data/content';
import type { CPlan } from './catalog';
import { Ltr, useI18n } from '../i18n';
import { useCurrency, useSite } from './settings';

export function SectionHead({ title, text }: { title: string; text?: string }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

/** Marks a number as a placeholder until real pricing is set (see SHOW_PLACEHOLDER). */
export function Ph() {
  const { t } = useI18n();
  const { settings } = useSite();
  if (!settings.placeholder) return null;
  return <span className="ph" title={t('رقم تجريبي', 'Placeholder value')}>{t('تجريبي', 'placeholder')}</span>;
}

export function Money({ value }: { value: number }) {
  const cur = useCurrency();
  return <span className="money"><b className="latin">{value.toLocaleString('en-US')}</b> <small>{cur}</small></span>;
}

export function PlanCard({ plan, ctaLabel }: { plan: CPlan; ctaLabel?: string }) {
  const { L, t } = useI18n();
  const { addPlan } = useCart();
  const nav = useNavigate();
  const per = plan.per === 'year' ? t('سنة', 'yr') : plan.per === 'once' ? t('مرة واحدة', 'one-time') : t('شهر', 'mo');
  return (
    <article className={`plan${plan.featured ? ' is-featured on-dark' : ''}`}>
      <header>
        <h3>{L(plan.name)}</h3>
        {plan.featured && <span className="tag volt">{t('الأكثر طلبًا', 'Most popular')}</span>}
      </header>
      <div className="plan-price">
        <Money value={plan.price} /> <span className="per">/ {per}</span> <Ph />
      </div>
      <dl className="plan-specs">
        {plan.specs.map((s) => (
          <div key={s.label.en}><dt>{L(s.label)}</dt><dd className="latin">{L(s.value)}</dd></div>
        ))}
      </dl>
      <ul className="plan-list">{plan.features.map((f) => <li key={f.en}>{L(f)}</li>)}</ul>
      <div className="plan-cta"><button type="button" onClick={() => { addPlan(plan.id); nav('/cart'); }} className={`btn ${plan.featured ? 'btn-accent' : 'btn-ghost'}`}>{ctaLabel ?? t('أضف للسلة', 'Add to cart')}</button></div>
    </article>
  );
}

export function Faq({ items }: { items: { q: { ar: string; en: string }; a: { ar: string; en: string } }[] }) {
  const { L } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map((it, i) => (
        <div key={it.q.en} className={`faq-item${open === i ? ' is-open' : ''}`}>
          <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{L(it.q)}</span><i aria-hidden>{open === i ? '−' : '+'}</i>
          </button>
          {open === i && <p>{L(it.a)}</p>}
        </div>
      ))}
    </div>
  );
}

/** Deterministic mock availability so results are stable while typing. Replace with a registrar API. */
function mockTaken(name: string, ext: string): boolean {
  let h = 0;
  for (const c of name + ext) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 5 === 0;
}

type Found = { domain: string; tld: string; available: boolean; sell: number; renewSell: number; currency: string };

/** Domain search. Connected to the registrars (cheapest provider per extension, with your margin) when the backend runs; a demo list otherwise. */
export function DomainSearch({ dark = false, showResults = true }: { dark?: boolean; showResults?: boolean }) {
  const { t } = useI18n();
  const { mode } = useAuth();
  const { addDomain } = useCart();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [live, setLive] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const raw = q.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '');
    const clean = raw.split('.')[0];
    setName(clean); setErr(''); setLive(null);
    if (mode !== 'server' || !clean) return;
    setBusy(true);
    try { const r = await api<{ results: Found[]; errors?: Record<string, string> }>('public/domain-search', undefined, { q: raw }); setLive(r.results); if (r.results.length === 0 && r.errors && Object.keys(r.errors).length) setErr(t('البحث مش متاح لحظيًا، جرّب بعد شوية.', 'Search is temporarily unavailable, try again shortly.')); }
    catch (x) { setErr(x instanceof Error && /enabled|prices/.test(x.message) ? t('البحث غير متاح حاليًا.', 'Search is not available right now.') : t('تعذّر البحث، حاول تاني.', 'Search failed, please try again.')); }
    finally { setBusy(false); }
  };
  const row = (domain: string, taken: boolean, price: ReactNode, key: string) => (
    <li key={key}>
      <span className="dot-wrap"><i className={`dot${taken ? ' bad' : ''}`} /> <Ltr>{domain}</Ltr></span>
      <span className={`tag ${taken ? 'bad' : 'ok'}`}>{taken ? t('محجوز', 'Taken') : t('متاح', 'Available')}</span>
      <span className="dprice">{taken ? '—' : price}</span>
      <button type="button" className="btn btn-ghost btn-sm" disabled={taken} onClick={() => { if (mode === 'server') { addDomain(domain); nav('/cart'); } else nav(`/portal/support?new=domain&d=${encodeURIComponent(domain)}`); }}>{t('أضف للسلة', 'Add to cart')}</button>
    </li>
  );
  return (
    <div className={dark ? 'dsearch on-dark' : 'dsearch'}>
      <form onSubmit={submit} role="search">
        <label className="sr-only" htmlFor="dq">{t('اسم الدومين', 'Domain name')}</label>
        <input id="dq" className="input latin" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder="yourbrand.com" autoComplete="off" />
        <button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('ابحث', 'Search')}</button>
      </form>
      {showResults && name && (
        <ul className="dresults" aria-live="polite">
          {mode === 'server' ? (
            <>
              {live && live.map((r) => row(r.domain, !r.available, <><b className="latin">{r.sell.toLocaleString('en-US')}</b> <small>{r.currency}</small> <small className="muted">/ {t('سنة', 'yr')}</small></>, r.domain))}
              {live && live.length === 0 && <li className="dnote">{t('مفيش نتائج للامتدادات دي.', 'No results for these extensions.')}</li>}
              {err && <li className="dnote">{err}</li>}
            </>
          ) : (
            <>
              {tlds.slice(0, 6).map((tl) => row(`${name}${tl.ext}`, mockTaken(name, tl.ext), <><Money value={tl.register} /> <Ph /></>, tl.ext))}
              <li className="dnote">{t('نتائج تجريبية لعرض التصميم فقط، مش ربط حقيقي بالـ registrar.', 'Demo results to show the design only, not a live registrar lookup.')}</li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
