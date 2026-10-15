import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, apiUrl, post } from '../lib/api';
import type { Brand, Business, PayMethod, Settings } from '../lib/types';
import { assetUrl, useSite } from '../site/settings';
import { Page } from '../ui';
import type { Coupon } from '../lib/types';
import { errText } from './errors';

const PAY_TYPES: [string, string, string][] = [['instapay', 'إنستا باي (InstaPay)', 'InstaPay'], ['fawateerk', 'فواتيرك', 'Fawateerk'], ['stripe', 'دفع أونلاين بالبطاقة (Stripe)', 'Online card (Stripe)'], ['paymob', 'دفع أونلاين (Paymob)', 'Online (Paymob)'], ['bank', 'تحويل بنكي', 'Bank transfer'], ['wallet', 'محفظة / إنستا باي', 'Wallet / InstaPay'], ['card', 'بطاقة / رابط دفع', 'Card / payment link'], ['cash', 'كاش', 'Cash'], ['other', 'أخرى', 'Other']];
type Full = Settings & { version?: string };
const GOVS = ['Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Sharqia', 'Dakahlia', 'Gharbia', 'Monufia', 'Beheira', 'Kafr El-Sheikh', 'Damietta', 'Port Said', 'Ismailia', 'Suez', 'North Sinai', 'South Sinai', 'Fayoum', 'Beni Suef', 'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea', 'New Valley', 'Matrouh'];

/** Admin → Settings: grouped menu with search on the left, one page of cards per area on the right. */
export function AdminSettings() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { section = 'general' } = useParams();
  const { refresh } = useSite();
  const [saved, setSaved] = useState<Full | null>(null);
  const [s, setS] = useState<Full | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Full>('admin/settings').then((r) => { setSaved(r); setS(r); }).catch((e) => setErr(errText(e, t))); }, [t]);

  const groups = useMemo<{ title: string; items: { id: string; label: string; to?: string }[] }[]>(() => [
    { title: t('الشركة', 'Company'), items: [{ id: 'general', label: t('عام', 'General') }, { id: 'branding', label: t('الهوية البصرية', 'Branding') }, { id: 'accounts', label: t('حسابات العملاء', 'Customer accounts') }, { id: 'store', label: t('المتجر والضريبة', 'Store & tax') }, { id: 'terms', label: t('الشروط والأحكام', 'Terms & conditions') }] },
    { title: t('المبيعات', 'Sales'), items: [{ id: 'plans', label: t('الباقات والأسعار', 'Plans & prices'), to: '/admin/plans' }, { id: 'orders', label: t('الطلبات', 'Orders'), to: '/admin/orders' }, { id: 'payments', label: t('وسائل الدفع', 'Payment methods') }, { id: 'coupons', label: t('كوبونات الخصم', 'Coupons') }, { id: 'renewals', label: t('التجديد والمزوّدين', 'Renewals & providers') }, { id: 'tld', label: t('أسعار الدومينات', 'TLD pricing'), to: '/admin/pricing' }, { id: 'purchases', label: t('فواتير الشراء', 'Purchases'), to: '/admin/purchases' }] },
    { title: t('التطبيقات', 'Apps & tools'), items: [{ id: 'apps', label: t('التطبيقات', 'Apps'), to: '/admin/apps' }, { id: 'email', label: t('الإيميل (SMTP)', 'Email (SMTP)') }, { id: 'system', label: t('فحص النظام', 'System check') }, { id: 'updates', label: t('التحديثات', 'Updates'), to: '/admin/updates' }, { id: 'activity', label: t('سجل النشاط', 'Activity'), to: '/admin/activity' }] },
    { title: t('الحساب', 'Account'), items: [{ id: 'account', label: t('حسابي', 'My account'), to: '/admin/account' }] },
  ], [t]);
  if (!s || !saved) return <Page title={t('الإعدادات', 'Settings')}>{err ? <div className="form-error">{err}</div> : <p className="muted">…</p>}</Page>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = (patch: Partial<Full>) => setS({ ...s, ...patch });
  const biz = s.business ?? {};
  const setBiz = (patch: Partial<Business>) => set({ business: { ...biz, ...patch } });
  const brand = s.brand ?? {};
  const setBrand = (patch: Partial<Brand>) => set({ brand: { ...brand, ...patch } });
  const smtp = s.smtp ?? { host: '', port: 587, secure: 'tls' as const, user: '', from: '', fromName: '' };
  const setSmtp = (patch: Partial<NonNullable<Full['smtp']>>) => set({ smtp: { ...smtp, ...patch } });
  const gw = s.gateways ?? { stripe: { enabled: false }, paymob: { enabled: false } };
  const setGw = <K extends 'stripe' | 'paymob'>(k: K, patch: Partial<NonNullable<Full['gateways']>[K]>) => set({ gateways: { ...gw, [k]: { ...gw[k], ...patch } } as NonNullable<Full['gateways']> });
  const coupons = s.coupons ?? [];
  const setCoupon = (i: number, patch: Partial<Coupon>) => set({ coupons: coupons.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const abs = (route: string) => new URL(apiUrl(route), window.location.href).href;
  const testMail = async () => { setErr(''); setOk(''); try { const r = await post<{ to: string }>('admin/smtp-test', {}); setOk(t(`اتبعت إيميل تجريبي لـ ${r.to}.`, `Test email sent to ${r.to}.`)); } catch (x) { setErr(errText(x, t)); } };
  const runDaily = async () => { setErr(''); setOk(''); try { const r = await post<{ created: number }>('admin/daily-run', {}); setOk(t(`اتشغّلت المهمة اليومية (${r.created} فاتورة تجديد جديدة).`, `Daily job ran (${r.created} new renewal invoices).`)); await reloadSaved(); } catch (x) { setErr(errText(x, t)); } };
  const reloadSaved = async () => { const r = await api<Full>('admin/settings'); setSaved(r); setS(r); };
  const pays = s.payments ?? [];
  const setPay = (i: number, patch: Partial<PayMethod>) => set({ payments: pays.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const save = async (e?: FormEvent) => {
    e?.preventDefault(); setErr(''); setOk(''); setBusy(true);
    try { await post('admin/settings', s); await reloadSaved(); setOk(t('تم الحفظ.', 'Saved.')); await refresh(); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  const upload = async (key: 'logo' | 'logoDark' | 'icon', file?: File) => {
    if (!file) return;
    setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(apiUrl('admin/upload'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
      const j = await res.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setS((cur) => (cur ? { ...cur, brand: { ...(cur.brand ?? {}), [key]: j.url } } : cur));
    } catch (x) { setErr(x instanceof Error ? x.message : 'error'); }
  };
  const uploadQr = async (i: number, file?: File) => {
    if (!file) return;
    setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(apiUrl('admin/upload'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
      const j = await res.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setS((cur) => (cur ? { ...cur, payments: (cur.payments ?? []).map((m, k) => (k === i ? { ...m, qr: j.url } : m)) } : cur));
    } catch (x) { setErr(x instanceof Error ? x.message : 'error'); }
  };
  const visible = (id: string, label: string) => !q.trim() || label.toLowerCase().includes(q.trim().toLowerCase()) || id.includes(q.trim().toLowerCase());
  const label = groups.flatMap((g) => g.items).find((i) => i.id === section)?.label ?? t('عام', 'General');
  const initials = (s.site || 'N').replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const host = typeof window !== 'undefined' ? window.location.host : '';

  const card = (title: string, desc: string | null, children: React.ReactNode) => <div className="set-card"><h3>{title}</h3>{desc && <p className="muted">{desc}</p>}<div className="set-fields">{children}</div></div>;
  const field = (id: string, lab: string, input: React.ReactNode, help?: string, wide = true) => <div className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}><label htmlFor={id}>{lab}</label>{input}{help && <small className="muted">{help}</small>}</div>;
  const image = (key: 'logo' | 'logoDark' | 'icon', lab: string, help: string, dark = false) => (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={`img-${key}`}>{lab}</label>
      <div className={`set-img${dark ? ' dark' : ''}`}>{brand[key] ? <img src={assetUrl(brand[key]!)} alt="" /> : <span className="muted">{t('لسه مفيش صورة', 'No image yet')}</span>}</div>
      <div className="row-actions">
        <input id={`img-${key}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon" onChange={(e) => { void upload(key, e.target.files?.[0]); e.target.value = ''; }} />
        {brand[key] && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBrand({ [key]: '' })}>{t('إزالة', 'Remove')}</button>}
      </div>
      <small className="muted">{help}</small>
    </div>
  );

  return (
    <Page title={t('الإعدادات', 'Settings')}>
      <div className="set-layout">
        <nav className="set-nav" aria-label={t('أقسام الإعدادات', 'Settings sections')}>
          <div className="set-store">{brand.icon ? <img className="set-avatar" src={assetUrl(brand.icon)} alt="" /> : <span className="set-avatar">{initials}</span>}<div><b>{s.site || 'Notch Cloud'}</b><div className="muted latin">{host}</div></div></div>
          <input className="input set-search" placeholder={t('بحث', 'Search')} aria-label={t('بحث في الإعدادات', 'Search settings')} value={q} onChange={(e) => setQ(e.target.value)} />
          {groups.map((g) => {
            const items = g.items.filter((i) => visible(i.id, i.label));
            return items.length ? (
              <div key={g.title}>
                <div className="set-group">{g.title}</div>
                {items.map((i) => i.to
                  ? <Link key={i.id} to={i.to} className="set-item">{i.label} <span className="muted">↗</span></Link>
                  : <button key={i.id} type="button" className={`set-item${section === i.id ? ' on' : ''}`} onClick={() => nav(`/admin/settings/${i.id}`)}>{i.label}</button>)}
              </div>
            ) : null;
          })}
          {s.version && <p className="muted latin" style={{ padding: '10px 12px 0' }}>v{s.version}</p>}
        </nav>
        <form className="set-main" onSubmit={save}>
          <h2 className="set-title">{label}</h2>
          {err && <div className="form-error" role="alert">{err}</div>}
          {ok && <div className="form-ok" role="status">{ok}</div>}

          {section === 'general' && (
            <>
              {card(t('بيانات الشركة', 'Business details'), t('اسم الشركة وعنوانها. بتظهر في الفواتير وتستخدم كعنوان للشركة.', 'Your business name and address. Shown on invoices and used as your company’s location.'), <>
                {field('b-legal', t('الاسم القانوني للشركة', 'Legal business name'), <input id="b-legal" className="input" maxLength={160} value={biz.legalName ?? ''} onChange={(e) => setBiz({ legalName: e.target.value })} />)}
                {field('b-country', t('الدولة', 'Country/region'), <select id="b-country" className="select" disabled value="Egypt"><option>Egypt</option></select>)}
                {field('b-addr', t('العنوان', 'Address'), <input id="b-addr" className="input" maxLength={160} value={biz.address ?? ''} onChange={(e) => setBiz({ address: e.target.value })} />)}
                {field('b-addr2', t('الدور / المبنى', 'Apartment, suite, etc.'), <input id="b-addr2" className="input" maxLength={160} value={biz.address2 ?? ''} onChange={(e) => setBiz({ address2: e.target.value })} />)}
                <div className="set-row3">
                  <div className="field"><label htmlFor="b-city">{t('المدينة', 'City')}</label><input id="b-city" className="input" maxLength={80} value={biz.city ?? ''} onChange={(e) => setBiz({ city: e.target.value })} /></div>
                  <div className="field"><label htmlFor="b-gov">{t('المحافظة', 'Governorate')}</label><select id="b-gov" className="select" value={biz.governorate ?? ''} onChange={(e) => setBiz({ governorate: e.target.value })}><option value="">—</option>{GOVS.map((g) => <option key={g}>{g}</option>)}</select></div>
                  <div className="field"><label htmlFor="b-zip">{t('الكود البريدي', 'Postal code')}</label><input id="b-zip" className="input latin" maxLength={20} value={biz.postalCode ?? ''} onChange={(e) => setBiz({ postalCode: e.target.value })} /></div>
                </div>
                {field('b-tax', t('الرقم الضريبي (اختياري)', 'Tax ID (optional)'), <input id="b-tax" className="input latin" maxLength={40} value={biz.taxId ?? ''} onChange={(e) => setBiz({ taxId: e.target.value })} />)}
              </>)}
              {card(t('بيانات التواصل', 'Contact details'), t('العملاء بيشوفوها في أسفل الموقع وصفحة "تواصل معنا" وأزرار واتساب.', 'Customers see these in the footer, on the contact page and on WhatsApp buttons.'), <>
                {field('s-site', t('اسم الشركة (على الموقع)', 'Company name (on the website)'), <input id="s-site" className="input" maxLength={80} value={s.site} onChange={(e) => set({ site: e.target.value })} />)}
                {field('s-mail', t('إيميل استلام الطلبات', 'Email for new requests'), <input id="s-mail" type="email" className="input latin" value={s.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="hello@company.com" />, t('بيوصله إيميل مع كل طلب تواصل أو تسجيل جديد (لو الاستضافة بتدعم mail).', 'Gets an email for every new lead or sign-up (if the host supports mail).'), false)}
                {field('s-ph', t('تليفون الشركة', 'Company phone'), <input id="s-ph" className="input latin" maxLength={30} value={s.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="+20 100 000 0000" />, undefined, false)}
                {field('s-wa', 'WhatsApp', <input id="s-wa" className="input latin" maxLength={20} value={s.whatsapp ?? ''} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="20100000000" />, t('بيستخدم في زر واتساب وروابط التواصل.', 'Used for the WhatsApp links.'), false)}
                {field('s-ad', t('العنوان (يظهر للعملاء)', 'Address (shown to customers)'), <input id="s-ad" className="input" maxLength={200} value={s.address ?? ''} onChange={(e) => set({ address: e.target.value })} />, undefined, false)}
                {field('s-cur', t('العملة (تظهر في الأسعار)', 'Currency label (shown on prices)'), <input id="s-cur" className="input" maxLength={8} value={s.currency} onChange={(e) => set({ currency: e.target.value })} placeholder="EGP" />, undefined, false)}
              </>)}
            </>
          )}

          {section === 'branding' && (
            <>
              {card(t('الشعار', 'Logo'), t('بيظهر في هيدر الموقع ولوحة العميل ولوحة الأدمن وصفحة الدخول. استخدم PNG أو WebP بخلفية شفافة (حتى 1.5MB).', 'Shown in the website header, the client area, the admin panel and the sign-in page. Use a PNG or WebP with a transparent background (up to 1.5 MB).'), <>
                {image('logo', t('الشعار (للخلفيات الفاتحة)', 'Logo (for light backgrounds)'), t('بيستخدم في هيدر الموقع.', 'Used in the website header.'))}
                {image('logoDark', t('الشعار (للخلفيات الداكنة)', 'Logo (for dark backgrounds)'), t('بيستخدم في القائمة الجانبية والفوتر. لو فاضي بنستخدم الشعار الأول.', 'Used in the sidebar and footer. If empty the first logo is used.'), true)}
              </>)}
              {card(t('الأيقونة واللون', 'Icon & colour'), t('أيقونة تبويب المتصفح واللون المميز للموقع واللوحات.', 'The browser-tab icon and the accent colour of the website and panels.'), <>
                {image('icon', t('الأيقونة (Favicon)', 'Icon (favicon)'), t('صورة مربعة 64×64 أو أكبر.', 'A square image, 64×64 or larger.'))}
                {field('br-acc', t('اللون المميز', 'Accent colour'), <div className="row-actions"><input id="br-acc" type="color" value={brand.accent || '#c8f03c'} onChange={(e) => setBrand({ accent: e.target.value })} style={{ width: 56, height: 40 }} /><input className="input latin" style={{ maxWidth: 140 }} value={brand.accent ?? ''} placeholder="#c8f03c" onChange={(e) => setBrand({ accent: e.target.value })} aria-label="hex" />{brand.accent && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBrand({ accent: '' })}>{t('الافتراضي', 'Default')}</button>}<span className="tag" style={{ background: brand.accent || '#c8f03c', color: '#0a0a0a' }}>{t('معاينة', 'Preview')}</span></div>, t('بتتطبّق بعد الحفظ.', 'Applied after saving.'))}
              </>)}
            </>
          )}

          {section === 'accounts' && (
            <>
              {card(t('تسجيل العملاء', 'Customer sign-up'), t('تحكم في إمكانية إنشاء حساب جديد من الموقع.', 'Control whether new customers can create an account on the website.'), <>
                {field('dl', t('اللغة الأساسية للموقع', 'Default site language'), <select id="dl" className="select" value={s.defaultLang ?? 'ar'} onChange={(e) => set({ defaultLang: e.target.value as 'ar' | 'en' })}><option value="ar">العربية</option><option value="en">English</option></select>, t('اللغة اللي بتفتح بيها الصفحة لأي زائر جديد. اللي بيغيّر اللغة بنفسه بتتفتح له اللغة اللي اختارها.', 'The language a new visitor sees first. Visitors who switch language keep their own choice.'), false)}
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={s.allowRegistration !== false} onChange={(e) => set({ allowRegistration: e.target.checked })} /> {t('اسمح للعملاء الجدد بإنشاء حساب من الموقع', 'Let new customers create an account on the website')}</label>
              </>)}
              {card(t('عرض الموقع', 'Website display'), null, <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={s.placeholder} onChange={(e) => set({ placeholder: e.target.checked })} /> {t('اعرض علامة "تجريبي" على الأسعار والأرقام', 'Show the "placeholder" marks on prices and numbers')}</label>
              </>)}
            </>
          )}

          {section === 'terms' && (
            <>
              {card(t('الشروط والأحكام', 'Terms & conditions'), t('بتظهر في صفحة /terms وعند التسجيل وفي ملف العميل. لو عدّلت النص، النسخة بتزيد والعملاء بيتطلب منهم الموافقة من جديد.', 'Shown on the /terms page, at sign-up and in the client profile. When you change the text the version goes up and clients are asked to accept again.'), <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={!!s.terms?.required} onChange={(e) => set({ terms: { ar: s.terms?.ar ?? '', en: s.terms?.en ?? '', version: s.terms?.version ?? '1', required: e.target.checked } })} /> {t('الموافقة إجبارية (عند التسجيل وقبل أي طلب)', 'Acceptance is required (at sign-up and before any order)')}</label>
                {field('tm-ar', t('النص بالعربي', 'Text (Arabic)'), <textarea id="tm-ar" className="textarea" rows={10} maxLength={30000} value={s.terms?.ar ?? ''} onChange={(e) => set({ terms: { ar: e.target.value, en: s.terms?.en ?? '', version: s.terms?.version ?? '1', required: !!s.terms?.required } })} />)}
                {field('tm-en', t('النص بالإنجليزي', 'Text (English)'), <textarea id="tm-en" className="textarea latin" dir="ltr" rows={10} maxLength={30000} value={s.terms?.en ?? ''} onChange={(e) => set({ terms: { ar: s.terms?.ar ?? '', en: e.target.value, version: s.terms?.version ?? '1', required: !!s.terms?.required } })} />, t(`النسخة الحالية: ${s.terms?.version ?? '1'}`, `Current version: ${s.terms?.version ?? '1'}`))}
              </>)}
            </>
          )}

          {section === 'store' && (
            <>
              {card(t('عنوان الموقع', 'Site address'), t('بيتستخدم في لينكات الإيميلات (استرجاع كلمة السر، الطلبات) ولينكات الدفع الأونلاين. لازم يكون العنوان الحقيقي للموقع.', 'Used in emailed links (password reset, orders) and online-payment return links. It must be the real address of your site.'), <>
                {field('su', t('العنوان', 'Address'), <div className="row-actions"><input id="su" className="input latin" dir="ltr" style={{ flex: 1 }} placeholder="https://example.com" value={s.siteUrl ?? ''} onChange={(e) => set({ siteUrl: e.target.value })} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ siteUrl: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') })}>{t('استخدم العنوان الحالي', 'Use the current address')}</button></div>)}
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={!!s.cleanUrls} onChange={(e) => set({ cleanUrls: e.target.checked })} /> {t('الموقع بيستخدم روابط نظيفة (من غير #). سيبها مقفولة لو معملتش build:clean.', 'The site uses clean URLs (no #). Leave off unless you built with build:clean.')}</label>
              </>)}
              {card(t('الضرائب والفواتير', 'Taxes & invoices'), t('كل ضريبة ليها اسم ونسبة (مثلًا ضريبة القيمة المضافة 14%، وضريبة الوكالة 15%). بتتحسب على البنود اللي معلّم عليها "خاضع للضريبة".', 'Each tax has a name and a rate (e.g. VAT 14%, Agency e-Tax 15%). It applies to the items marked "Taxed".'), <>
                {(s.taxes ?? []).map((tx, i) => (
                  <div key={i} className="row-actions" style={{ gridColumn: '1 / -1' }}>
                    <input className="input" style={{ maxWidth: 240 }} aria-label={t('اسم الضريبة', 'Tax name')} placeholder={t('اسم الضريبة', 'Tax name')} value={tx.name} onChange={(e) => set({ taxes: (s.taxes ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <input className="input latin" style={{ maxWidth: 120 }} type="number" min={0} max={100} step="0.01" aria-label="%" value={tx.rate} onChange={(e) => set({ taxes: (s.taxes ?? []).map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)) })} /> %
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ taxes: (s.taxes ?? []).filter((_, j) => j !== i) })}>{t('حذف', 'Remove')}</button>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ taxes: [...(s.taxes ?? []), { name: 'VAT', rate: 14 }] })}>{t('+ ضريبة', '+ Tax')}</button></div>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={s.taxInclusive !== false} onChange={(e) => set({ taxInclusive: e.target.checked })} /> {t('أسعاري شاملة الضريبة (مقفولة = الضريبة بتتضاف فوق السعر في الفاتورة)', 'My prices include tax (off = tax is added on top of the price on the invoice)')}</label>
                {field('ip', t('بادئة رقم الفاتورة', 'Invoice number prefix'), <input id="ip" className="input latin" dir="ltr" maxLength={12} value={s.invoicePrefix ?? 'INV-'} onChange={(e) => set({ invoicePrefix: e.target.value })} />, t('مثال: NOTCH- بيطلّع NOTCH-1001. الأرقام بتكمّل من آخر رقم.', 'e.g. NOTCH- gives NOTCH-1001. Numbers continue from the last one.'), false)}
              </>)}
              {card(t('الطلبات', 'Orders'), null, <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={!!s.autoActivate} onChange={(e) => set({ autoActivate: e.target.checked })} /> {t('فعّل الطلب تلقائيًا بمجرد وصول الدفع الأونلاين (بيضيف الخدمات في حساب العميل)', 'Activate an order automatically when the online payment arrives (adds the services to the client account)')}</label>
              </>)}
            </>
          )}

          {section === 'email' && (
            <>
              {card(t('إرسال الإيميلات (SMTP)', 'Sending email (SMTP)'), t('من غير SMTP السيرفر بيستخدم mail() وكتير من الاستضافات بتضيّع الرسايل. اكتب بيانات صندوق إيميل حقيقي (مثلًا إيميل Hostinger: smtp.hostinger.com، المنفذ 465 SSL).', 'Without SMTP the server uses PHP mail(), which many hosts drop. Enter the details of a real mailbox (e.g. Hostinger: smtp.hostinger.com, port 465, SSL).'), <>
                {field('sm-h', t('السيرفر', 'Host'), <input id="sm-h" className="input latin" dir="ltr" placeholder="smtp.hostinger.com" value={smtp.host} onChange={(e) => setSmtp({ host: e.target.value })} />, undefined, false)}
                {field('sm-p', t('المنفذ', 'Port'), <input id="sm-p" className="input latin" type="number" value={smtp.port} onChange={(e) => setSmtp({ port: Number(e.target.value) })} />, undefined, false)}
                {field('sm-s', t('التشفير', 'Encryption'), <select id="sm-s" className="select" value={smtp.secure} onChange={(e) => setSmtp({ secure: e.target.value as 'tls' | 'ssl' | 'none' })}><option value="ssl">SSL (465)</option><option value="tls">STARTTLS (587)</option><option value="none">{t('بدون', 'None')}</option></select>, undefined, false)}
                {field('sm-u', t('اسم المستخدم', 'Username'), <input id="sm-u" className="input latin" dir="ltr" autoComplete="off" value={smtp.user} onChange={(e) => setSmtp({ user: e.target.value })} />, undefined, false)}
                {field('sm-w', t('كلمة السر', 'Password'), <input id="sm-w" className="input latin" dir="ltr" type="password" autoComplete="new-password" placeholder={smtp.passSet ? '••••••••' : ''} value={smtp.pass ?? ''} onChange={(e) => setSmtp({ pass: e.target.value })} />, smtp.passSet ? t('محفوظة. سيبها فاضية للإبقاء عليها.', 'Saved. Leave empty to keep it.') : undefined, false)}
                {field('sm-f', t('إيميل المرسِل', 'From address'), <input id="sm-f" className="input latin" dir="ltr" placeholder="no-reply@yourdomain.com" value={smtp.from} onChange={(e) => setSmtp({ from: e.target.value })} />, undefined, false)}
                {field('sm-n', t('اسم المرسِل', 'From name'), <input id="sm-n" className="input" value={smtp.fromName} onChange={(e) => setSmtp({ fromName: e.target.value })} />, undefined, false)}
              </>)}
              <div className="set-card"><div className="row-actions"><button type="button" className="btn btn-accent btn-sm" disabled={dirty} onClick={testMail}>{t('ابعت إيميل تجريبي', 'Send a test email')}</button><span className="muted">{dirty ? t('احفظ الأول وبعدين جرّب.', 'Save first, then test.') : t('بيتبعت لإيميلك كأدمن.', 'Goes to your own admin email.')}</span></div></div>
            </>
          )}

          {section === 'coupons' && (
            <>
              {card(t('كوبونات الخصم', 'Discount coupons'), t('العميل بيكتب الكود في الـ checkout. الخصم نسبة % أو مبلغ ثابت، وممكن تحدد تاريخ انتهاء وعدد استخدامات وحد أدنى للطلب.', 'The customer enters the code at checkout. The discount is a % or a fixed amount, with an optional expiry date, usage limit and minimum order.'), <>
                {coupons.map((c, i) => (
                  <div key={i} className="set-row3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', border: '1px solid var(--nt-fog)', borderRadius: 14, padding: 14, alignItems: 'end' }}>
                    {field(`cp-c${i}`, t('الكود', 'Code'), <input id={`cp-c${i}`} className="input latin" dir="ltr" maxLength={30} value={c.code} onChange={(e) => setCoupon(i, { code: e.target.value.toUpperCase() })} />, undefined, false)}
                    {field(`cp-t${i}`, t('النوع', 'Type'), <select id={`cp-t${i}`} className="select" value={c.type} onChange={(e) => setCoupon(i, { type: e.target.value as Coupon['type'] })}><option value="percent">%</option><option value="fixed">{t('مبلغ ثابت', 'Fixed amount')}</option></select>, undefined, false)}
                    {field(`cp-v${i}`, t('القيمة', 'Value'), <input id={`cp-v${i}`} className="input latin" type="number" min={0} value={c.value} onChange={(e) => setCoupon(i, { value: Number(e.target.value) })} />, undefined, false)}
                    {field(`cp-e${i}`, t('ينتهي', 'Expires'), <input id={`cp-e${i}`} className="input latin" type="date" value={c.expires} onChange={(e) => setCoupon(i, { expires: e.target.value })} />, undefined, false)}
                    {field(`cp-m${i}`, t('أقصى استخدام (0 = بلا حد)', 'Max uses (0 = unlimited)'), <input id={`cp-m${i}`} className="input latin" type="number" min={0} value={c.maxUses} onChange={(e) => setCoupon(i, { maxUses: Number(e.target.value) })} />, undefined, false)}
                    {field(`cp-n${i}`, t('حد أدنى للطلب', 'Minimum order'), <input id={`cp-n${i}`} className="input latin" type="number" min={0} value={c.minTotal} onChange={(e) => setCoupon(i, { minTotal: Number(e.target.value) })} />, undefined, false)}
                    <label className="check"><input type="checkbox" checked={c.active} onChange={(e) => setCoupon(i, { active: e.target.checked })} /> {t('مفعّل', 'Active')}</label>
                    <div className="row-actions"><span className="muted latin">{t('استُخدم', 'Used')}: {c.used ?? 0}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ coupons: coupons.filter((_, j) => j !== i) })}>{t('حذف', 'Remove')}</button></div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ coupons: [...coupons, { code: '', type: 'percent', value: 10, active: true, expires: '', maxUses: 0, minTotal: 0 }] })}>{t('+ كوبون', '+ Coupon')}</button></div>
              </>)}
            </>
          )}

          {section === 'renewals' && (
            <>
              {card(t('التجديد التلقائي', 'Automatic renewals'), t('كل يوم السيرفر بيفحص الدومينات والاستضافات: بيبعت تذكير للعميل قبل الانتهاء بـ 30/14/7/1 يوم، وبينشئ فاتورة تجديد (طلب) قبل الانتهاء بـ 14 يوم لو للخدمة سعر تجديد.', 'Every day the server checks domains and hosting: it emails the client 30/14/7/1 days before expiry and creates a renewal invoice (order) 14 days before, when the service has a renewal price.'), <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={s.autoRenewInvoices !== false} onChange={(e) => set({ autoRenewInvoices: e.target.checked })} /> {t('أنشئ فواتير التجديد تلقائيًا', 'Create renewal invoices automatically')}</label>
                {field('sd', t('أوقف الخدمة تلقائيًا بعد (أيام من استحقاق فاتورة التجديد)', 'Auto-suspend a service after (days past the renewal invoice due date)'), <input id="sd" className="input latin" type="number" min={0} max={365} value={s.suspendAfterDays ?? 0} onChange={(e) => set({ suspendAfterDays: Number(e.target.value) })} />, t('0 = مقفول. الخدمة اللي ليها "ما توقفش لحد" بتتخطّى.', '0 = off. Services with "Do not suspend until" are skipped.'), false)}
                <div style={{ gridColumn: '1 / -1' }}><p className="muted">{t('آخر تشغيل', 'Last run')}: <b className="latin">{s.lastDaily || '—'}</b></p>
                  <p className="muted">{t('بيشتغل لوحده أول مرة تفتح فيها لوحة الأدمن كل يوم. للأمان أضف Cron Job يوميًا في الاستضافة بالأمر ده:', 'It also runs the first time you open the admin each day. To be safe, add a daily cron job on your host with this command:')}</p>
                  <input className="input latin" dir="ltr" readOnly value={`curl -s "${abs('cron/run')}&key=${s.cronKey ?? ''}"`} onFocus={(e) => e.currentTarget.select()} />
                  <div className="row-actions" style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={runDaily}>{t('شغّلها الآن', 'Run it now')}</button></div></div>
              </>)}
              {card(t('تسجيل الدومينات عند المزوّد', 'Registering domains at the provider'), t('لما تفعّل ده، بيظهر زر "سجّل عند المزوّد" في صفحة الدومين. الزر بيشتري الدومين فعليًا من حسابك عند Namecheap أو Hostinger وبيخصم من رصيدك هناك، وبيطلب تأكيدك قبل كل عملية.', 'When on, a "Register at provider" button appears on the domain page. It really buys the domain from your Namecheap or Hostinger account and charges your balance there, and asks you to confirm each time.'), <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={!!s.providerRegister} onChange={(e) => set({ providerRegister: e.target.checked })} /> {t('فعّل تسجيل الدومينات عند المزوّد', 'Enable registering domains at the provider')}</label>
                <p className="muted" style={{ gridColumn: '1 / -1' }}>{t('مجرّب على مزوّد تجريبي بس، مش على حسابات حقيقية. جرّبه الأول بدومين رخيص. ResellerClub غير مدعوم (سجّل من لوحته).', 'Tested against a stand-in provider only, not real accounts. Try it first with a cheap domain. ResellerClub is not supported (register in its panel).')}</p>
              </>)}
            </>
          )}

          {section === 'system' && <SystemCheck />}

          {section === 'payments' && (
            <>
              {card(t('وسائل الدفع', 'Payment methods'), t('الوسائل اللي بتظهر للعميل في الـ checkout. بيانات الحساب (رقم بنك، محفظة، رابط دفع) بتظهر له بعد تأكيد الطلب فقط.', 'Shown to the customer at checkout. The account details (bank number, wallet, payment link) are shown to them only after they place the order.'), <>
                {pays.map((m, i) => (
                  <div key={m.id || i} className="set-row3" style={{ gridTemplateColumns: '1fr', border: '1px solid var(--nt-fog)', borderRadius: 14, padding: 14 }}>
                    <div className="set-fields">
                      {field(`pm-ar${i}`, t('الاسم (عربي)', 'Name (Arabic)'), <input id={`pm-ar${i}`} className="input" maxLength={80} value={m.nameAr} onChange={(e) => setPay(i, { nameAr: e.target.value })} />, undefined, false)}
                      {field(`pm-en${i}`, t('الاسم (إنجليزي)', 'Name (English)'), <input id={`pm-en${i}`} className="input latin" maxLength={80} value={m.nameEn} onChange={(e) => setPay(i, { nameEn: e.target.value })} />, undefined, false)}
                      {field(`pm-t${i}`, t('النوع', 'Type'), <select id={`pm-t${i}`} className="select" value={m.type} onChange={(e) => setPay(i, { type: e.target.value as PayMethod['type'] })}>{PAY_TYPES.map(([k, ar, en]) => <option key={k} value={k}>{t(ar, en)}</option>)}</select>, undefined, false)}
                      <label className="check"><input type="checkbox" checked={!!m.active} onChange={(e) => setPay(i, { active: e.target.checked })} /> {t('مفعّلة', 'Active')}</label>
                      {m.type !== 'stripe' && m.type !== 'paymob' && field(`pm-q${i}`, t('QR Code للدفع (صورة)', 'Payment QR code (image)'), <div className="row-actions">{m.qr ? <img src={assetUrl(m.qr)} alt="QR" style={{ width: 96, height: 96, objectFit: 'contain', background: '#fff', borderRadius: 10, border: '1px solid var(--nt-fog)' }} /> : <span className="muted">{t('مفيش صورة', 'No image')}</span>}<input id={`pm-q${i}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void uploadQr(i, e.target.files?.[0])} />{m.qr && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPay(i, { qr: '' })}>{t('إزالة', 'Remove')}</button>}</div>, t('مثال: QR بتاع إنستا باي من تطبيق البنك. بيظهر للعميل في صفحة الطلب والفاتورة.', 'e.g. your InstaPay QR from the bank app. Shown to the customer on the order and the invoice.'))}
                      {field(`pm-d${i}`, t('تفاصيل الدفع (تظهر للعميل بعد الطلب)', 'Payment details (shown after the order)'), <textarea id={`pm-d${i}`} className="textarea" maxLength={600} value={m.details ?? ''} placeholder={t('مثال: بنك مصر، حساب 1234…، باسم نوتش\nأو رابط الدفع https://…', 'e.g. Bank, account 1234…, in the name of Notch\nor a payment link https://…')} onChange={(e) => setPay(i, { details: e.target.value })} />)}
                    </div>
                    <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ payments: pays.filter((_, j) => j !== i) })}>{t('حذف', 'Remove')}</button></div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}><button type="button" className="btn btn-ghost btn-sm" disabled={pays.length >= 12} onClick={() => set({ payments: [...pays, { id: '', type: 'bank', nameAr: '', nameEn: '', details: '', active: true }] })}>{t('+ وسيلة دفع', '+ Payment method')}</button></div>
              </>)}
              {card('Stripe', t('دفع بالبطاقة أونلاين (Checkout). أضف وسيلة دفع من نوع "دفع أونلاين بالبطاقة" عشان تظهر للعميل.', 'Online card payments (Checkout). Add a payment method of type "Online card payment" so customers can pick it.'), <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={gw.stripe.enabled} onChange={(e) => setGw('stripe', { enabled: e.target.checked })} /> {t('مفعّل', 'Enabled')}</label>
                {field('st-k', t('Secret key', 'Secret key'), <input id="st-k" className="input latin" dir="ltr" type="password" autoComplete="new-password" placeholder={gw.stripe.secretSet ? '••••••••' : 'sk_live_…'} value={gw.stripe.secret ?? ''} onChange={(e) => setGw('stripe', { secret: e.target.value })} />, undefined, false)}
                {field('st-w', t('Webhook signing secret', 'Webhook signing secret'), <input id="st-w" className="input latin" dir="ltr" type="password" autoComplete="new-password" placeholder={gw.stripe.webhookSet ? '••••••••' : 'whsec_…'} value={gw.stripe.webhook ?? ''} onChange={(e) => setGw('stripe', { webhook: e.target.value })} />, undefined, false)}
                {field('st-u', t('رابط الـ Webhook (ضيفه في Stripe، الحدث checkout.session.completed)', 'Webhook URL (add it in Stripe, event checkout.session.completed)'), <input id="st-u" className="input latin" dir="ltr" readOnly value={abs('pay/stripe-webhook')} onFocus={(e) => e.currentTarget.select()} />)}
              </>)}
              {card('Paymob', t('بطاقات ومحافظ مصر. أضف وسيلة دفع من نوع "دفع أونلاين (Paymob)".', 'Egyptian cards and wallets. Add a payment method of type "Online payment (Paymob)".'), <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={gw.paymob.enabled} onChange={(e) => setGw('paymob', { enabled: e.target.checked })} /> {t('مفعّل', 'Enabled')}</label>
                {field('pm-k', 'API key', <input id="pm-k" className="input latin" dir="ltr" type="password" autoComplete="new-password" placeholder={gw.paymob.apiKeySet ? '••••••••' : ''} value={gw.paymob.apiKey ?? ''} onChange={(e) => setGw('paymob', { apiKey: e.target.value })} />, undefined, false)}
                {field('pm-h', 'HMAC secret', <input id="pm-h" className="input latin" dir="ltr" type="password" autoComplete="new-password" placeholder={gw.paymob.hmacSet ? '••••••••' : ''} value={gw.paymob.hmac ?? ''} onChange={(e) => setGw('paymob', { hmac: e.target.value })} />, undefined, false)}
                {field('pm-i', 'Integration ID', <input id="pm-i" className="input latin" dir="ltr" value={gw.paymob.integrationId ?? ''} onChange={(e) => setGw('paymob', { integrationId: e.target.value })} />, undefined, false)}
                {field('pm-f', 'iFrame ID', <input id="pm-f" className="input latin" dir="ltr" value={gw.paymob.iframeId ?? ''} onChange={(e) => setGw('paymob', { iframeId: e.target.value })} />, undefined, false)}
                {field('pm-u', t('رابط الـ Callback (Transaction processed callback في Paymob)', 'Callback URL (Paymob “Transaction processed callback”)'), <input id="pm-u" className="input latin" dir="ltr" readOnly value={abs('pay/paymob-webhook')} onFocus={(e) => e.currentTarget.select()} />)}
              </>)}
              {card(t('Webmail', 'Webmail'), t('الرابط اللي بيفتحه زر "افتح الإيميل" للعميل والأدمن.', 'The link opened by the "Open mailbox" button for clients and admins.'), <>
                {field('wm', t('رابط الويب ميل', 'Webmail URL'), <input id="wm" className="input latin" dir="ltr" value={s.webmailUrl ?? ''} placeholder="https://mail.hostinger.com" onChange={(e) => set({ webmailUrl: e.target.value })} />)}
              </>)}
            </>
          )}

          <div className={`set-save${dirty ? ' is-dirty' : ''}`}>
            <span className="muted">{dirty ? t('فيه تغييرات غير محفوظة', 'Unsaved changes') : ''}</span>
            <div className="row-actions"><button type="button" className="btn btn-ghost" disabled={!dirty || busy} onClick={() => setS(saved)}>{t('تراجع', 'Discard')}</button><button className="btn btn-accent" type="submit" disabled={!dirty || busy}>{busy ? '…' : t('حفظ', 'Save')}</button></div>
          </div>
        </form>
      </div>
    </Page>
  );
}

/** Settings → System check: what the host can and cannot do. */
type Row = { id: string; ok: boolean; level: 'ok' | 'warn' | 'bad'; detail: string };
function SystemCheck() {
  const { t } = useI18n();
  const [d, setD] = useState<{ rows: Row[]; php: string; storage: string; time: string } | null>(null);
  const [err, setErr] = useState('');
  const load = () => { setD(null); api<{ rows: Row[]; php: string; storage: string; time: string }>('admin/system-check').then(setD).catch((e) => setErr(errText(e, t))); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const names: Record<string, [string, string]> = {
    php: ['إصدار PHP', 'PHP version'], upload: ['حد الرفع', 'Upload limits'], mail: ['إرسال الإيميل', 'Sending email'], siteurl: ['عنوان الموقع', 'Site address'], https: ['HTTPS', 'HTTPS'], cron: ['المهمة اليومية', 'Daily job'], opcache: ['OPcache (تأخّر التحديثات)', 'OPcache (update delay)'],
    'write:api/data': ['كتابة في api/data', 'Write to api/data'], 'write:uploads': ['كتابة في uploads', 'Write to uploads'], 'write:api (updates)': ['كتابة في api (للتحديثات)', 'Write to api (updates)'], 'write:assets (updates)': ['كتابة في assets (للتحديثات)', 'Write to assets (updates)'],
  };
  return (
    <div className="set-card">
      <div className="row-actions" style={{ justifyContent: 'space-between' }}><h3>{t('فحص النظام', 'System check')}</h3><button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('أعد الفحص', 'Check again')}</button></div>
      <p className="muted">{t('بيفحص الاستضافة اللي شغّال عليها الموقع: الإضافات المطلوبة، صلاحيات الكتابة، حدود الرفع، الكاش والإيميل. ✓ تمام، ! محتاج انتباه.', 'Checks the host this site runs on: required extensions, write permissions, upload limits, cache and email. ✓ fine, ! needs attention.')}</p>
      {err && <div className="form-error">{err}</div>}
      {!d ? <p className="muted">…</p> : <>
        <p className="muted latin">PHP {d.php} · {d.storage}</p>
        <ul className="sys-list">{d.rows.map((r) => {
          const nm = r.id.startsWith('ext:') ? [`PHP ${r.id.slice(4)}`, `PHP ${r.id.slice(4)}`] : names[r.id] ?? [r.id, r.id];
          return <li key={r.id} className={r.level}><b aria-hidden>{r.ok ? '✓' : '!'}</b><div><span>{t(nm[0], nm[1])}</span><small className="muted latin">{r.detail}</small></div></li>;
        })}</ul></>}
    </div>
  );
}
