import { useCallback, useEffect, useState } from 'react';
import { hostingPlans, emailPlans, sitePackages, vpsPlans, bundle, type Plan } from '../data/content';
import { Ltr, useI18n } from '../i18n';
import { api, post } from '../lib/api';
import { useCurrency } from '../site/settings';
import { Page, Table } from '../ui';
import { errText } from './errors';

type P = { id?: string; category: string; nameAr: string; nameEn: string; price: number | ''; per: string; featured: boolean; active: boolean; sort: number | ''; specs: string; features: string };
const CATS: [string, string, string][] = [['hosting', 'استضافة', 'Hosting'], ['email', 'إيميلات', 'Email'], ['vps', 'VPS', 'VPS'], ['site', 'تصميم مواقع', 'Web design'], ['bundle', 'باقة كاملة', 'Bundle']];
const blank: P = { category: 'hosting', nameAr: '', nameEn: '', price: '', per: 'month', featured: false, active: true, sort: '', specs: '', features: '' };

const bi = (b: { ar: string; en: string }) => (b.ar === b.en ? b.ar : `${b.ar} | ${b.en}`);
const starter = (): P[] => {
  const conv = (cat: string, per: string, list: Plan[]): P[] => list.map((p) => ({ category: cat, nameAr: p.name.ar, nameEn: p.name.en, price: p.price, per, featured: !!p.featured, active: false, sort: '',
    specs: p.specs.map((s) => `${bi(s.label)} : ${bi(s.value)}`).join('\n'), features: p.features.map(bi).join('\n') }));
  return [...conv('hosting', 'month', hostingPlans), ...conv('email', 'month', emailPlans), ...conv('vps', 'month', vpsPlans), ...conv('site', 'once', sitePackages),
    { category: 'bundle', nameAr: bundle.title.ar, nameEn: bundle.title.en, price: bundle.price, per: 'year', featured: false, active: false, sort: '', specs: '', features: bundle.items.map(bi).join('\n') }];
};

/** Admin → Plans: the price list shown on the website. Only "active" plans are public. */
export function AdminPlans() {
  const { t } = useI18n();
  const cur = useCurrency();
  const [items, setItems] = useState<(P & { id: string })[]>([]);
  const [form, setForm] = useState<P | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => { api<{ items: (P & { id: string })[] }>('admin/items', undefined, { res: 'plans' }).then((r) => setItems(r.items)).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };
  const save = (p: P) => post('admin/item-save', { item: p }, { res: 'plans' });
  const catLabel = (c: string) => { const x = CATS.find((k) => k[0] === c); return x ? t(x[1], x[2]) : c; };
  const set = (k: keyof P, v: unknown) => setForm({ ...(form as P), [k]: v });
  const sorted = [...items].sort((a, b) => CATS.findIndex((c) => c[0] === a.category) - CATS.findIndex((c) => c[0] === b.category) || Number(a.sort) - Number(b.sort));
  return (
    <Page title={t('الباقات والأسعار', 'Plans')} action={<div className="row-actions">
      {items.length === 0 && <button className="btn btn-ghost btn-sm" onClick={() => void run(async () => { for (const p of starter()) await save(p); }, t('اتضافت باقات مبدئية (غير مفعّلة). عدّل الأسعار وفعّلها.', 'Starter plans added (inactive). Edit the prices and activate them.'))}>{t('أضف باقات مبدئية', 'Add starter plans')}</button>}
      <button className="btn btn-primary btn-sm" onClick={() => setForm(form ? null : { ...blank })}>{form ? t('إلغاء', 'Cancel') : t('+ باقة', '+ Plan')}</button></div>}>
      {err && <div className="form-error" role="alert">{err}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <p className="muted">{t('دي الباقات اللي بتظهر في الموقع (الصفحة الرئيسية، الأسعار، الاستضافة...). اللي مش "مفعّلة" مبتظهرش. العميل بيطلب الباقة من حسابه وبيوصلك الطلب كتذكرة.', 'These are the plans shown on the website. Plans that are not active stay hidden. A client orders a plan from their account and the request reaches you as a ticket.')}</p>
      {form && (
        <form className="card admin-form" onSubmit={(e) => { e.preventDefault(); void run(() => save(form), t('اتحفظت.', 'Saved.')).then((r) => { if (r) setForm(null); }); }}>
          <div className="field"><label htmlFor="pl-c">{t('القسم', 'Category')}</label><select id="pl-c" className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>{CATS.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></div>
          <div className="field"><label htmlFor="pl-n">{t('الاسم (عربي)', 'Name (Arabic)')}</label><input id="pl-n" className="input" required maxLength={80} value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></div>
          <div className="field"><label htmlFor="pl-e">{t('الاسم (English)', 'Name (English)')}</label><input id="pl-e" className="input latin" maxLength={80} value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></div>
          <div className="field"><label htmlFor="pl-p">{t('السعر', 'Price')} ({cur})</label><input id="pl-p" className="input latin" type="number" min={0} step="any" required value={String(form.price)} onChange={(e) => set('price', e.target.value === '' ? '' : Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="pl-per">{t('الدورة', 'Billing')}</label><select id="pl-per" className="select" value={form.per} onChange={(e) => set('per', e.target.value)}><option value="month">{t('شهري', 'Monthly')}</option><option value="year">{t('سنوي', 'Yearly')}</option><option value="once">{t('مرة واحدة', 'One-time')}</option></select></div>
          <div className="field"><label htmlFor="pl-s">{t('الترتيب', 'Order')}</label><input id="pl-s" className="input latin" type="number" step="any" value={String(form.sort)} onChange={(e) => set('sort', e.target.value === '' ? '' : Number(e.target.value))} /></div>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> {t('مفعّلة (تظهر في الموقع)', 'Active (shown on the website)')}</label>
          <label className="check"><input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} /> {t('الأكثر طلبًا', 'Most popular')}</label>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="pl-sp">{t('المواصفات (سطر لكل واحدة: العنوان : القيمة — وممكن "عربي | English")', 'Specs (one per line: Label : Value — optionally "Arabic | English")')}</label>
            <textarea id="pl-sp" className="textarea" rows={4} maxLength={700} value={form.specs} onChange={(e) => set('specs', e.target.value)} placeholder={'مساحة | Storage : 50 GB NVMe\nمواقع | Websites : 10'} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="pl-f">{t('المميزات (سطر لكل ميزة — "عربي | English")', 'Features (one per line — "Arabic | English")')}</label>
            <textarea id="pl-f" className="textarea" rows={4} maxLength={900} value={form.features} onChange={(e) => set('features', e.target.value)} placeholder={'شهادة SSL مجانية | Free SSL'} /></div>
          <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
        </form>
      )}
      <Table head={[t('القسم', 'Category'), t('الباقة', 'Plan'), t('السعر', 'Price'), t('الحالة', 'Status'), '']} empty={items.length === 0 ? t('مفيش باقات لسه. أضف باقات مبدئية أو واحدة جديدة.', 'No plans yet. Add the starter plans or a new one.') : undefined}>
        {sorted.map((p) => (
          <tr key={p.id}>
            <td>{catLabel(p.category)}</td>
            <td><b>{p.nameAr}</b>{p.nameEn && <> <Ltr>{p.nameEn}</Ltr></>} {p.featured && <span className="tag volt">{t('الأكثر طلبًا', 'Popular')}</span>}</td>
            <td className="latin">{Number(p.price)} {cur} / {p.per === 'year' ? 'yr' : p.per === 'once' ? 'once' : 'mo'}</td>
            <td><span className={`tag ${p.active ? 'ok' : ''}`}>{p.active ? t('مفعّلة', 'Active') : t('مخفية', 'Hidden')}</span></td>
            <td><div className="row-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => void run(() => save({ ...p, active: !p.active }), p.active ? t('اتخفّت.', 'Hidden.') : t('اتفعّلت.', 'Activated.'))}>{p.active ? t('إخفاء', 'Hide') : t('تفعيل', 'Activate')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ ...p }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('تعديل', 'Edit')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف الباقة؟', 'Delete this plan?'))) void run(() => post('admin/item-delete', { id: p.id }, { res: 'plans' }), t('اتحذفت.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>
            </div></td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}
