import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { faqs, services, steps } from '../data/content';
import { useCatalog, type CPlan } from './catalog';
import { useSite } from './settings';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { post } from '../lib/api';
import { DomainSearch, Faq, Money, PlanCard, SectionHead } from './parts';

/* ───────── Home ───────── */
export function Home() {
  const { t, L } = useI18n();
  const { tlds, of } = useCatalog();
  const hosting = of('hosting');
  return (
    <>
      <section className="container hero-wrap">
        <div className="hero on-dark">
          <h1>{t('كل اللي شركتك محتاجاه ', 'Everything your business needs ')}<em>{t('أونلاين', 'online')}</em>{t('… في مكان واحد', ', in one place')}</h1>
          <p>{t('دومينات، إيميلات أعمال، تصميم مواقع، استضافة وخدمات كلاود كاملة. ابدأ باسم براندك.', 'Domains, business email, web design, hosting and full cloud services. Start with your brand name.')}</p>
          <DomainSearch dark />
          {tlds.length > 0 && <div className="hero-tlds latin">
            {tlds.slice(0, 4).map((x) => <span key={x.ext}>{x.ext} <b>{x.register}</b></span>)}
          </div>}
        </div>
      </section>

      <section className="section container">
        <SectionHead title={t('خدمات كاملة تحت سقف واحد', 'A full stack under one roof')} text={t('اشتري خدمة واحدة أو كل الخدمات، وإدارتها من لوحة تحكم واحدة.', 'Buy one service or all of them, and manage everything from one panel.')} />
        <div className="grid g3">
          {services.map((s, i) => (
            <Link to={s.path} className="card svc" key={s.key}>
              <span className="nt-index latin">{String(i + 1).padStart(2, '0')}</span>
              <h3>{L(s.title)}</h3>
              <p>{L(s.text)}</p>
              <span className="spec latin">{L(s.spec)}</span>
            </Link>
          ))}
        </div>
      </section>

      {tlds.length > 0 && <section className="section container tld-section">
        <SectionHead title={t('أسعار الدومينات', 'Domain prices')} text={t('تسجيل وتجديد بسعر واضح، وإدارة DNS مجانية.', 'Clear registration and renewal prices, with free DNS management.')} />
        <TldTable />
      </section>}

      {hosting.length > 0 && <section className="section container">
        <SectionHead title={t('خطط الاستضافة', 'Hosting plans')} />
        <div className="grid g3 plans">
          {hosting.map((p) => <PlanCard key={p.id} plan={p} />)}
        </div>
      </section>}


      <section className="section container">
        <SectionHead title={t('إزاي بنشتغل', 'How it works')} />
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.title.en}><span className="nt-index latin">{String(i + 1).padStart(2, '0')}</span><h3>{L(s.title)}</h3><p>{L(s.text)}</p></li>
          ))}
        </ol>
      </section>

      <section className="container"><BundleBanner /></section>

      <section className="section container faq-section">
        <SectionHead title={t('أسئلة شائعة', 'FAQ')} />
        <Faq items={faqs} />
      </section>

      <CtaBand />
    </>
  );
}

export function BundleBanner() {
  const { t, L } = useI18n();
  const { of } = useCatalog();
  const cur = useSite();
  const b = of('bundle')[0];
  void cur;
  if (!b) return null;
  return (
    <div className="bundle on-dark nt-volt-edge">
      <div>
        <span className="tag volt">{t('باقة كاملة', 'Bundle')}</span>
        <h2>{L(b.name)}</h2>
        <ul>{(b.included ?? []).map((i) => <li key={i.en}>{L(i)}</li>)}</ul>
      </div>
      <div className="bundle-buy">
        <div className="plan-price"><Money value={b.price} /> <span className="per">/ {b.per === 'year' ? t('سنة', 'yr') : b.per === 'once' ? t('مرة واحدة', 'one-time') : t('شهر', 'mo')}</span></div>
        <Link to={`/portal/order/${b.id}`} className="btn btn-accent">{t('اطلب الباقة', 'Get the bundle')}</Link>
      </div>
    </div>
  );
}

export function CtaBand() {
  const { t } = useI18n();
  return (
    <section className="container cta-wrap">
      <div className="cta on-dark">
        <h2>{t('جاهز تبدأ؟', 'Ready to start?')}</h2>
        <p>{t('كلمنا ونجهز لك الخدمة المناسبة لشركتك.', 'Talk to us and we will set up the right services for your business.')}</p>
        <div className="cta-btns"><Link to="/contact" className="btn btn-accent">{t('ابدأ الآن', 'Get started')}</Link><Link to="/pricing" className="btn btn-ghost">{t('شوف الأسعار', 'See pricing')}</Link></div>
      </div>
    </section>
  );
}

function TldTable() {
  const { t } = useI18n();
  const { tlds } = useCatalog();
  const [q, setQ] = useState('');
  if (tlds.length === 0) return null;
  const rows = tlds.filter((x) => !q.trim() || x.ext.includes(q.trim().toLowerCase().replace(/^\.?/, '.')));
  return (
    <>
      <input className="input latin" dir="ltr" style={{ maxWidth: 320, marginBottom: 12 }} placeholder={t('ابحث عن امتداد (.com)', 'Find an extension (.com)')} aria-label={t('بحث عن امتداد', 'Find an extension')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('الامتداد', 'Extension')}</th><th>{t('تسجيل / سنة', 'Register / yr')}</th><th>{t('تجديد / سنة', 'Renew / yr')}</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.ext}>
                <td><b className="tld-ext latin" dir="ltr">{x.ext}</b> {x.popular && <span className="tag dark">{t('الأشهر', 'Popular')}</span>}</td>
                <td><Money value={x.register} /> </td>
                <td><Money value={x.renew} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="muted">{t('مفيش امتداد بالاسم ده.', 'No extension matches.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ───────── Generic service page ───────── */
type Feature = { title: string; text: string };
function ServicePage({ eyebrow, title, intro, hero, features, plansTitle, plans, planCta }: {
  eyebrow: string; title: ReactNode; intro: string; hero?: ReactNode; features: Feature[];
  plansTitle?: string; plans?: CPlan[]; planCta?: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <section className="container hero-wrap">
        <div className="hero hero-sm on-dark">
          <span className="eyebrow latin">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
          {hero}
        </div>
      </section>
      <section className="section container">
        <SectionHead title={t('إيه اللي هتاخده', 'What you get')} />
        <div className="grid g3">
          {features.map((f, i) => (
            <div className="card" key={f.title}><span className="nt-index latin">{String(i + 1).padStart(2, '0')}</span><h3>{f.title}</h3><p>{f.text}</p></div>
          ))}
        </div>
      </section>
      {plans && plans.length > 0 && (
        <section className="section container">
          <SectionHead title={plansTitle ?? t('الخطط', 'Plans')} />
          <div className="grid g3 plans">
            {plans.map((p) => <PlanCard key={p.id} plan={p} ctaLabel={planCta} />)}
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}

export function Domains() {
  const { t } = useI18n();
  return (
    <>
      <ServicePage
        eyebrow="DOMAINS"
        title={<>{t('اسم براندك يستاهل ', 'Your brand deserves the right ')}<em>{t('دومين مناسب', 'domain')}</em></>}
        intro={t('ابحث وسجّل دومينك في ثواني، وأدره بالكامل من لوحة واحدة.', 'Search and register your domain in seconds, then manage it all from one panel.')}
        hero={<DomainSearch dark />}
        features={[
          { title: t('إدارة DNS كاملة', 'Full DNS control'), text: t('A و CNAME و MX و TXT وغيرهم من لوحة سهلة.', 'A, CNAME, MX, TXT and more from an easy panel.') },
          { title: t('حماية الخصوصية', 'WHOIS privacy'), text: t('بياناتك مخفية من سجلات WHOIS العامة.', 'Your details are hidden from public WHOIS records.') },
          { title: t('تجديد تلقائي', 'Auto-renew'), text: t('متخسرش دومينك بسبب ميعاد تجديد فات.', 'Never lose a domain over a missed renewal.') },
        ]}
      />
      <section className="section container tld-section" style={{ paddingTop: 0 }}><SectionHead title={t('أسعار الامتدادات', 'Extension prices')} /><TldTable /></section>
    </>
  );
}

export function EmailPage() {
  const { t } = useI18n();
  const { of } = useCatalog();
  return (
    <ServicePage
      eyebrow="BUSINESS EMAIL"
      title={<>{t('إيميلات باسم ', 'Email on your ')}<em>{t('شركتك', 'own brand')}</em></>}
      intro={t('name@yourcompany.com بدل إيميلات مجانية. حماية، تقويم وتطبيقات موبايل.', 'name@yourcompany.com instead of free mailboxes. Security, calendar and mobile apps.')}
      features={[
        { title: t('سبام وفيروسات', 'Spam & malware filtering'), text: t('فلترة قوية قبل ما توصل لصندوقك.', 'Strong filtering before mail reaches your inbox.') },
        { title: 'SPF · DKIM · DMARC', text: t('بنظبطهم لك عشان رسايلك توصل Inbox مش Spam.', 'We set them up so your mail lands in the inbox, not spam.') },
        { title: t('على كل أجهزتك', 'On every device'), text: t('Webmail وIMAP وتطبيقات موبايل.', 'Webmail, IMAP and mobile apps.') },
      ]}
      plans={of('email')}
    />
  );
}

export function Websites() {
  const { t } = useI18n();
  const { of } = useCatalog();
  return (
    <ServicePage
      eyebrow="WEB DESIGN"
      title={<>{t('موقع بيشبه ', 'A website that looks like ')}<em>{t('شركتك', 'your company')}</em></>}
      intro={t('تصميم سريع ومتجاوب بالعربي والإنجليزي، من الفكرة لحد الإطلاق.', 'Fast, responsive design in Arabic and English, from idea to launch.')}
      features={[
        { title: t('تصميم مخصص', 'Custom design'), text: t('هوية مرتبة، مش قوالب جاهزة متكررة.', 'A clean identity, not a recycled template.') },
        { title: t('سريع ومتوافق مع SEO', 'Fast and SEO-ready'), text: t('أداء عالي وبنية تساعد على الظهور في جوجل.', 'High performance and a structure that helps you rank.') },
        { title: t('بتديره بنفسك', 'Edit it yourself'), text: t('لوحة محتوى بسيطة بدون ما تحتاج مبرمج.', 'A simple content panel, no developer needed.') },
      ]}
      plansTitle={t('باقات المواقع', 'Website packages')}
      plans={of('site')}
      planCta={t('اطلب عرض', 'Request a quote')}
    />
  );
}

export function Hosting() {
  const { t } = useI18n();
  const { of } = useCatalog();
  return (
    <ServicePage
      eyebrow="HOSTING"
      title={<>{t('استضافة ', 'Hosting that stays ')}<em>{t('ما بتقع', 'up')}</em></>}
      intro={t('SSD / NVMe سريع، SSL مجاني، نسخ احتياطي ومراقبة 24/7.', 'Fast SSD / NVMe, free SSL, backups and 24/7 monitoring.')}
      features={[
        { title: t('سرعة', 'Speed'), text: t('تخزين NVMe وكاش مدمج لمواقع أسرع.', 'NVMe storage and built-in cache for faster sites.') },
        { title: t('أمان', 'Security'), text: t('SSL مجاني وجدار حماية ومسح للبرمجيات الخبيثة.', 'Free SSL, a firewall and malware scanning.') },
        { title: t('نسخ احتياطي', 'Backups'), text: t('نسخ يومي واسترجاع بضغطة.', 'Daily backups and one-click restore.') },
      ]}
      plans={of('hosting')}
    />
  );
}

export function Cloud() {
  const { t } = useI18n();
  const { of } = useCatalog();
  return (
    <ServicePage
      eyebrow="CLOUD & VPS"
      title={<>{t('سيرفرات سحابية ', 'Cloud servers, ')}<em>{t('جاهزة في دقايق', 'ready in minutes')}</em></>}
      intro={t('VPS بصلاحيات root كاملة، تخزين سحابي، Snapshots ومراقبة لبنيتك.', 'VPS with full root access, cloud storage, snapshots and monitoring for your stack.')}
      features={[
        { title: t('VPS مرن', 'Flexible VPS'), text: t('كبّر المواصفات وقت ما تحتاج.', 'Scale specs up whenever you need.') },
        { title: t('تخزين وباك أب', 'Storage & backup'), text: t('Object storage ونسخ احتياطي تلقائي.', 'Object storage and automatic backups.') },
        { title: t('مراقبة وتنبيهات', 'Monitoring & alerts'), text: t('تنبيه فوري لو فيه مشكلة في أي خدمة.', 'Instant alerts if any service has a problem.') },
      ]}
      plansTitle={t('خطط VPS', 'VPS plans')}
      plans={of('vps')}
    />
  );
}

/* ───────── Pricing ───────── */
export function Pricing() {
  const { t } = useI18n();
  const { of, tlds, ready } = useCatalog();
  const groups: { title: string; plans: CPlan[] }[] = [
    { title: t('الاستضافة', 'Hosting'), plans: of('hosting') },
    { title: t('الإيميلات', 'Email'), plans: of('email') },
    { title: 'VPS', plans: of('vps') },
    { title: t('تصميم المواقع', 'Web design'), plans: of('site') },
  ].filter((g) => g.plans.length > 0);
  return (
    <>
      <section className="container hero-wrap"><div className="hero hero-sm on-dark"><span className="eyebrow latin">PRICING</span><h1>{t('أسعار واضحة', 'Clear pricing')}</h1><p>{t('اختار الباقة المناسبة واطلبها من حسابك.', 'Pick the plan that fits and order it from your account.')}</p></div></section>
      {groups.map((g) => (
        <section className="section container" key={g.title} style={{ paddingBlock: 40 }}>
          <SectionHead title={g.title} />
          <div className="grid g3 plans">{g.plans.map((p) => <PlanCard key={p.id} plan={p} />)}</div>
        </section>
      ))}
      {ready && groups.length === 0 && tlds.length === 0 && <section className="section container"><div className="card"><h3>{t('اتواصل معنا للأسعار', 'Contact us for pricing')}</h3><p>{t('هنجهّز لك عرض يناسب احتياجك.', 'We will prepare a quote that fits your needs.')}</p><Link to="/contact" className="btn btn-accent">{t('تواصل معنا', 'Contact us')}</Link></div></section>}
      <section className="container"><BundleBanner /></section>
      {tlds.length > 0 && <section className="section container tld-section"><SectionHead title={t('الدومينات', 'Domains')} /><TldTable /></section>}
      <CtaBand />
    </>
  );
}

/* ───────── Status ───────── */
export function Status() {
  const { t } = useI18n();
  const { mode } = useAuth();
  const up = mode === 'server';
  return (
    <>
      <section className="container hero-wrap"><div className="hero hero-sm on-dark">{mode !== 'checking' && <span className="status-pill"><span className={`dot${up ? ' pulse' : ''}`} /> <span className="latin">{up ? 'ALL SYSTEMS OPERATIONAL' : 'DEGRADED'}</span></span>}<h1>{t('حالة الخدمات', 'Service status')}</h1><p>{t('الفحص بيتم مباشرة وقت فتح الصفحة.', 'Checked live, when you open this page.')}</p></div></section>
      <section className="section container">
        <div className="status-list">
          <div className="status-row"><span className={`dot${up ? ' pulse' : ''}`} /><b>{t('الموقع ولوحة التحكم', 'Website & control panel')}</b><span className={`tag ${up ? 'ok' : 'bad'}`}>{up ? t('شغال', 'Operational') : t('مشكلة', 'Problem')}</span><span className="latin up">{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span></div>
        </div>
        <p className="muted" style={{ marginTop: 16 }}>{t('لو عندك مشكلة في خدمة معيّنة، افتح تذكرة دعم من لوحتك.', 'If a specific service is not working for you, open a support ticket from your panel.')}</p>
      </section>
    </>
  );
}

/* ───────── Contact ───────── */
export function Contact() {
  const { t, lang } = useI18n();
  const { mode } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    if (mode === 'offline') { setError(t('الموقع مش متصل بالباك إند حاليًا، فالرسالة ما اتبعتتش.', 'The site is not connected to its backend, so the message was not sent.')); return; }
    if (mode !== 'server') return;
    setBusy(true);
    try {
      await post('public/lead', { name: f.get('name'), email: f.get('email'), phone: f.get('phone'), service: f.get('service'), message: f.get('message'), website: f.get('website') });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('too many') ? t('رسائل كتير، جرّب بعد شوية.', 'Too many messages, try again later.') : t('تعذّر الإرسال، حاول تاني.', 'Could not send, please try again.'));
    } finally { setBusy(false); }
  };
  return (
    <>
      <section className="container hero-wrap"><div className="hero hero-sm on-dark"><span className="eyebrow latin">CONTACT</span><h1>{t('كلمنا', 'Talk to us')}</h1><p>{t('احكيلنا محتاج إيه ونرجعلك بأسرع وقت.', 'Tell us what you need and we will get back to you quickly.')}</p></div></section>
      <section className="section container contact">
        <ContactDetails />
        {sent ? (
          <div className="card"><h3>{t('وصلتنا رسالتك', 'Message received')}</h3><p>{t('هنرد عليك في أقرب وقت.', 'We will get back to you shortly.')}</p></div>
        ) : (
          <form className="card form" onSubmit={submit}>
            <div className="field"><label htmlFor="n">{t('الاسم', 'Name')}</label><input id="n" name="name" className="input" required maxLength={80} /></div>
            <div className="field"><label htmlFor="e">{t('الإيميل', 'Email')}</label><input id="e" name="email" className="input latin" type="email" required /></div>
            <div className="field"><label htmlFor="ph">{t('الموبايل (اختياري)', 'Phone (optional)')}</label><input id="ph" name="phone" className="input latin" maxLength={30} /></div>
            <div className="field"><label htmlFor="s">{t('الخدمة', 'Service')}</label>
              <select id="s" name="service" className="select">{services.map((x) => <option key={x.key} value={x.title.en}>{x.title[lang]}</option>)}</select></div>
            <div className="field"><label htmlFor="m">{t('رسالتك', 'Message')}</label><textarea id="m" name="message" className="textarea" required minLength={5} maxLength={3000} /></div>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', clipPath: 'inset(50%)' }} />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('إرسال', 'Send')}</button>
          </form>
        )}
      </section>
    </>
  );
}

/* ───────── 404 ───────── */
export function NotFound() {
  const { t } = useI18n();
  return (
    <section className="container hero-wrap">
      <div className="hero hero-sm on-dark">
        <span className="eyebrow latin">404</span>
        <h1>{t('الصفحة دي مش موجودة', 'Page not found')}</h1>
        <p>{t('اللينك غلط أو الصفحة اتنقلت.', 'The link is wrong or the page has moved.')}</p>
        <Link to="/" className="btn btn-accent">{t('رجوع للرئيسية', 'Back home')}</Link>
      </div>
    </section>
  );
}

function ContactDetails() {
  const { t } = useI18n();
  const { settings } = useSite();
  const rows: [string, string, string | null][] = [
    [t('الإيميل', 'Email'), settings.contactEmail ?? '', settings.contactEmail ? `mailto:${settings.contactEmail}` : null],
    [t('الموبايل', 'Phone'), settings.phone ?? '', settings.phone ? `tel:${settings.phone}` : null],
    ['WhatsApp', settings.whatsapp ?? '', settings.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/[^0-9]/g, '')}` : null],
    [t('العنوان', 'Address'), settings.address ?? '', null],
  ];
  const shown = rows.filter((r) => r[1]);
  if (shown.length === 0) return null;
  return <div className="card" style={{ marginBottom: 16 }}><dl className="kv">{shown.map(([k, v, href]) => <div key={k}><dt>{k}</dt><dd>{href ? <a className="link" href={href} dir="ltr">{v}</a> : v}</dd></div>)}</dl></div>;
}
