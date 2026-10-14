import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, apiUrl, post } from '../lib/api';
import type { Brand, Business, Settings } from '../lib/types';
import { assetUrl, useSite } from '../site/settings';
import { Page } from '../ui';
import { errText } from './errors';

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
    { title: t('الشركة', 'Company'), items: [{ id: 'general', label: t('عام', 'General') }, { id: 'branding', label: t('الهوية البصرية', 'Branding') }, { id: 'accounts', label: t('حسابات العملاء', 'Customer accounts') }] },
    { title: t('المبيعات', 'Sales'), items: [{ id: 'plans', label: t('الباقات والأسعار', 'Plans & prices'), to: '/admin/plans' }, { id: 'tld', label: t('أسعار الدومينات', 'TLD pricing'), to: '/admin/pricing' }, { id: 'purchases', label: t('فواتير الشراء', 'Purchases'), to: '/admin/purchases' }] },
    { title: t('التطبيقات', 'Apps & tools'), items: [{ id: 'apps', label: t('التطبيقات', 'Apps'), to: '/admin/apps' }, { id: 'updates', label: t('التحديثات', 'Updates'), to: '/admin/updates' }, { id: 'activity', label: t('سجل النشاط', 'Activity'), to: '/admin/activity' }] },
    { title: t('الحساب', 'Account'), items: [{ id: 'account', label: t('حسابي', 'My account'), to: '/admin/account' }] },
  ], [t]);
  if (!s || !saved) return <Page title={t('الإعدادات', 'Settings')}>{err ? <div className="form-error">{err}</div> : <p className="muted">…</p>}</Page>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = (patch: Partial<Full>) => setS({ ...s, ...patch });
  const biz = s.business ?? {};
  const setBiz = (patch: Partial<Business>) => set({ business: { ...biz, ...patch } });
  const brand = s.brand ?? {};
  const setBrand = (patch: Partial<Brand>) => set({ brand: { ...brand, ...patch } });
  const save = async (e?: FormEvent) => {
    e?.preventDefault(); setErr(''); setOk(''); setBusy(true);
    try { await post('admin/settings', s); setSaved(s); setOk(t('تم الحفظ.', 'Saved.')); await refresh(); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
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
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={s.allowRegistration !== false} onChange={(e) => set({ allowRegistration: e.target.checked })} /> {t('اسمح للعملاء الجدد بإنشاء حساب من الموقع', 'Let new customers create an account on the website')}</label>
              </>)}
              {card(t('عرض الموقع', 'Website display'), null, <>
                <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={s.placeholder} onChange={(e) => set({ placeholder: e.target.checked })} /> {t('اعرض علامة "تجريبي" على الأسعار والأرقام', 'Show the "placeholder" marks on prices and numbers')}</label>
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
