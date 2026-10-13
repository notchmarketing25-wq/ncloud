import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { tlds, type Plan } from '../data/content';
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

export function PlanCard({ plan, per, cta }: { plan: Plan; per: string; cta: ReactNode }) {
  const { L, t } = useI18n();
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
      <div className="plan-cta">{cta}</div>
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

export function DomainSearch({ dark = false, showResults = true }: { dark?: boolean; showResults?: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = q.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9-]/g, '');
    setName(clean);
  };
  return (
    <div className={dark ? 'dsearch on-dark' : 'dsearch'}>
      <form onSubmit={submit} role="search">
        <label className="sr-only" htmlFor="dq">{t('اسم الدومين', 'Domain name')}</label>
        <input id="dq" className="input latin" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder="yourbrand.com" autoComplete="off" />
        <button className="btn btn-accent" type="submit">{t('ابحث', 'Search')}</button>
      </form>
      {showResults && name && (
        <ul className="dresults" aria-live="polite">
          {tlds.slice(0, 6).map((tl) => {
            const taken = mockTaken(name, tl.ext);
            return (
              <li key={tl.ext}>
                <span className="dot-wrap"><i className={`dot${taken ? ' bad' : ''}`} /> <Ltr>{name}{tl.ext}</Ltr></span>
                <span className={`tag ${taken ? 'bad' : 'ok'}`}>{taken ? t('محجوز', 'Taken') : t('متاح', 'Available')}</span>
                <span className="dprice">{taken ? '—' : <><Money value={tl.register} /> <Ph /></>}</span>
                <Link className="btn btn-ghost btn-sm" to="/portal/login" aria-disabled={taken} tabIndex={taken ? -1 : 0} style={taken ? { pointerEvents: 'none', opacity: .4 } : undefined}>{t('سجّل', 'Register')}</Link>
              </li>
            );
          })}
          <li className="dnote">{t('نتائج تجريبية لعرض التصميم فقط، مش ربط حقيقي بالـ registrar.', 'Demo results to show the design only, not a live registrar lookup.')}</li>
        </ul>
      )}
    </div>
  );
}
