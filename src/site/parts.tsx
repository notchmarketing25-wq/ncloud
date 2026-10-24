import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useCart } from './cart';
import { DomainName } from './svc';
import type { CPlan } from './catalog';
import { useI18n } from '../i18n';
import { useCurrency } from './settings';

export function SectionHead({ title, text }: { title: string; text?: string }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
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
        <Money value={plan.price} /> <span className="per">/ {per}</span>
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

type Found = { domain: string; tld: string; available: boolean; sell: number; renewSell: number; currency: string };

/** Domain search. Connected to the registrars (cheapest provider per extension, with your margin). */
export function DomainSearch({ dark = false, showResults = true }: { dark?: boolean; showResults?: boolean }) {
  const { t } = useI18n();
  const { mode } = useAuth();
  const { addDomain } = useCart();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [live, setLive] = useState<Found[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const raw = q.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '');
    const clean = raw.split('.')[0];
    setName(clean); setErr(''); setLive(null); setMs(null);
    if (mode !== 'server' || !clean) return;
    setBusy(true);
    try { const r = await api<{ results: Found[]; errors?: Record<string, string>; ms?: number }>('public/domain-search', undefined, { q: raw }); setLive(r.results); setMs(typeof r.ms === 'number' ? r.ms : null); if (r.results.length === 0 && r.errors && Object.keys(r.errors).length) setErr(t('البحث مش متاح لحظيًا، جرّب بعد شوية.', 'Search is temporarily unavailable, try again shortly.')); }
    catch (x) { setErr(x instanceof Error && /enabled|prices/.test(x.message) ? t('البحث غير متاح حاليًا.', 'Search is not available right now.') : t('تعذّر البحث، حاول تاني.', 'Search failed, please try again.')); }
    finally { setBusy(false); }
  };
  const add = (domain: string) => { if (mode === 'server') { addDomain(domain); nav('/cart'); } else nav(`/portal/support?new=domain&d=${encodeURIComponent(domain)}`); };
  const price = (r: Found) => <><b className="latin">{r.sell.toLocaleString('en-US')}</b> <small>{r.currency}</small> <small className="muted">/ {t('سنة', 'yr')}</small></>;
  const row = (domain: string, taken: boolean, pr: ReactNode, key: string, best = false) => (
    <li key={key} className={`drow${best ? ' best' : ''}${taken ? ' taken' : ''}`}>
      <span className="dot-wrap">{best && <span className="tag volt">{t('الأنسب', 'Best match')}</span>}<DomainName name={domain} /></span>
      <span className={`tag ${taken ? 'bad' : 'ok'}`}>{taken ? t('محجوز', 'Taken') : t('متاح', 'Available')}</span>
      <span className="dprice">{taken ? '—' : pr}</span>
      <button type="button" className={`btn btn-sm ${best ? 'btn-accent' : 'btn-ghost'}`} disabled={taken} onClick={() => add(domain)}>{t('أضف للسلة', 'Add to cart')}</button>
    </li>
  );
  const avail = (live ?? []).filter((r) => r.available);
  const taken = (live ?? []).filter((r) => !r.available);
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
              {busy && <li className="dnote">{t('بنسأل المسجّلين…', 'Checking with the registrars…')}</li>}
              {live && live.length > 0 && <li className="dhead"><span>{t(`${avail.length} متاح من ${live.length}`, `${avail.length} available of ${live.length}`)}</span>{ms !== null && <span className="muted latin">{ms} ms</span>}</li>}
              {avail.map((r, i) => row(r.domain, false, price(r), r.domain, i === 0))}
              {taken.length > 0 && <li className="dtaken"><details><summary>{t(`محجوز (${taken.length})`, `Taken (${taken.length})`)}</summary><ul>{taken.map((r) => <li key={r.domain} className="drow taken"><DomainName name={r.domain} /><span className="tag bad">{t('محجوز', 'Taken')}</span></li>)}</ul></details></li>}
              {live && live.length === 0 && <li className="dnote">{t('مفيش نتائج للامتدادات دي.', 'No results for these extensions.')}</li>}
              {err && <li className="dnote">{err}</li>}
            </>
          ) : <li className="dnote">{t('البحث عن الدومينات مش متاح حاليًا.', 'Domain search is not available right now.')}</li>}
        </ul>
      )}
    </div>
  );
}
