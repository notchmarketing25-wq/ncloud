import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { api, apiUrl, ApiError, post, type Kyc, type TermsStamp } from '../lib/api';
import { Modal, Page } from '../ui';
import { usePortal } from './PortalData';

export type Terms = { ar: string; en: string; version: string; required: boolean };
export function useTerms() {
  const [terms, setTerms] = useState<Terms | null>(null);
  useEffect(() => { api<Terms>('public/terms').then(setTerms).catch(() => setTerms(null)); }, []);
  return terms;
}
export const termsText = (t: Terms | null, lang: 'ar' | 'en') => (t ? (lang === 'ar' ? t.ar || t.en : t.en || t.ar) : '');
export const termsAccepted = (terms: Terms | null, stamp?: TermsStamp | null) => !terms || !terms.required || (!terms.ar && !terms.en) || stamp?.version === terms.version;

export type Identity = { type: 'individual' | 'company'; company: string; nationalId: string; commercialReg: string; taxId: string };
export const idOf = (u: { company?: string; kyc?: Kyc }): Identity => ({ type: u.kyc?.type ?? 'individual', company: u.company ?? '', nationalId: u.kyc?.nationalId ?? '', commercialReg: u.kyc?.commercialReg ?? '', taxId: u.kyc?.taxId ?? '' });

/** Individual or company, and the legal details each one needs. */
export function IdentityFields({ v, set, idp }: { v: Identity; set: (patch: Partial<Identity>) => void; idp: string }) {
  const { t } = useI18n();
  return (
    <>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>{t('نوع العميل', 'Client type')}</label>
        <div className="seg" role="radiogroup">
          <button type="button" role="radio" aria-checked={v.type === 'individual'} className={v.type === 'individual' ? 'on' : ''} onClick={() => set({ type: 'individual' })}>{t('شخص', 'Individual')}</button>
          <button type="button" role="radio" aria-checked={v.type === 'company'} className={v.type === 'company' ? 'on' : ''} onClick={() => set({ type: 'company' })}>{t('شركة', 'Company')}</button>
        </div>
      </div>
      {v.type === 'company' ? (
        <>
          <div className="field"><label htmlFor={`${idp}-co`}>{t('اسم الشركة', 'Company name')}</label><input id={`${idp}-co`} className="input" required maxLength={80} value={v.company} onChange={(e) => set({ company: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${idp}-cr`}>{t('رقم السجل التجاري', 'Commercial register no.')}</label><input id={`${idp}-cr`} className="input latin" maxLength={40} value={v.commercialReg} onChange={(e) => set({ commercialReg: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${idp}-tx`}>{t('الرقم الضريبي', 'Tax number')}</label><input id={`${idp}-tx`} className="input latin" maxLength={40} value={v.taxId} onChange={(e) => set({ taxId: e.target.value })} /></div>
        </>
      ) : (
        <>
          <div className="field"><label htmlFor={`${idp}-ni`}>{t('الرقم القومي', 'National ID number')}</label><input id={`${idp}-ni`} className="input latin" inputMode="numeric" maxLength={24} value={v.nationalId} onChange={(e) => set({ nationalId: e.target.value })} /></div>
          <div className="field"><label htmlFor={`${idp}-tx2`}>{t('الرقم الضريبي (لو موجود)', 'Tax number (if any)')}</label><input id={`${idp}-tx2`} className="input latin" maxLength={40} value={v.taxId} onChange={(e) => set({ taxId: e.target.value })} /></div>
        </>
      )}
    </>
  );
}

/** ID card (front / back) and tax card or commercial register copy: stored privately, shown only to the client and to admins. */
export function KycDocs({ kyc, admin = false, uid, onChange }: { kyc?: Kyc; admin?: boolean; uid?: string; onChange: () => void }) {
  const { t } = useI18n();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [stamp, setStamp] = useState(0);
  const sides: [('front' | 'back' | 'tax'), string, string][] = [['front', 'البطاقة (الوجه)', 'ID card (front)'], ['back', 'البطاقة (الظهر)', 'ID card (back)'], ['tax', 'البطاقة الضريبية / السجل التجاري', 'Tax card / commercial register']];
  const upload = async (side: string, file?: File) => {
    if (!file) return;
    setErr(''); setBusy(side);
    try {
      const fd = new FormData(); fd.append('side', side); fd.append('file', file); if (admin && uid) fd.append('uid', uid);
      const res = await fetch(apiUrl(admin ? 'admin/kyc-upload' : 'kyc/upload'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
      const j = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setStamp(Date.now()); onChange();
    } catch (x) { setErr(x instanceof Error ? x.message : 'error'); } finally { setBusy(''); }
  };
  const remove = async (side: string) => { setErr(''); try { await post(admin ? 'admin/kyc-remove' : 'kyc/remove', admin ? { uid, side } : { side }); setStamp(Date.now()); onChange(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'error'); } };
  return (
    <div className="kyc-docs">
      {err && <div className="form-error" role="alert">{err}</div>}
      {sides.map(([side, ar, en]) => (
        <div key={side} className="kyc-doc">
          <b>{t(ar, en)}</b>
          {kyc?.[side] ? <DocPreview side={side} uid={admin ? uid : undefined} stamp={stamp} /> : <span className="muted">{t('لم يُرفع', 'Not uploaded')}</span>}
          <div className="row-actions">
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>{busy === side ? '…' : kyc?.[side] ? t('استبدال', 'Replace') : t('رفع', 'Upload')}<input type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => { void upload(side, e.target.files?.[0]); e.target.value = ''; }} /></label>
            {kyc?.[side] && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(side)}>{t('حذف', 'Remove')}</button>}
          </div>
        </div>
      ))}
      <p className="muted">{t('JPG أو PNG أو PDF حتى 3 ميجا. الملفات محفوظة بشكل خاص وبتظهر لصاحب الحساب وللإدارة بس.', 'JPG, PNG or PDF up to 3 MB. Files are stored privately and shown only to the account owner and to admins.')}</p>
    </div>
  );
}

/** Loads the private file with the session cookie and shows it. */
function DocPreview({ side, uid, stamp }: { side: string; uid?: string; stamp: number }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [pdf, setPdf] = useState(false);
  useEffect(() => {
    let alive = true; let obj = '';
    fetch(apiUrl(uid ? 'admin/kyc-image' : 'kyc/image', uid ? { uid, side } : { side }), { credentials: 'same-origin' })
      .then(async (r) => { if (!r.ok) throw new Error(); const b = await r.blob(); if (!alive) return; obj = URL.createObjectURL(b); setPdf(b.type === 'application/pdf'); setUrl(obj); })
      .catch(() => { if (alive) setUrl(''); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [side, uid, stamp]);
  if (!url) return <span className="muted">…</span>;
  return pdf ? <a className="link" href={url} target="_blank" rel="noreferrer">{t('فتح PDF', 'Open PDF')}</a> : <a href={url} target="_blank" rel="noreferrer"><img className="kyc-img" src={url} alt={side} /></a>;
}

/** The company's terms and conditions in a scrollable box. */
export function TermsBox({ terms }: { terms: Terms | null }) {
  const { lang } = useI18n();
  const txt = termsText(terms, lang);
  if (!txt) return null;
  return <div className="terms-box" tabIndex={0}>{txt}</div>;
}

/** Signed-in clients who have not accepted the current terms must do it before they can order. */
export function TermsGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, mode, refresh, impersonating } = useAuth();
  const terms = useTerms();
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const need = mode === 'server' && user?.role === 'client' && !impersonating && terms && !termsAccepted(terms, user.terms);
  return (
    <>
      {children}
      {need && (
        <Modal title={t('الشروط والأحكام', 'Terms & conditions')} onClose={() => undefined}>
          <p className="muted">{t('اتحدّثت الشروط والأحكام. لازم توافق عليها عشان تكمل الطلبات.', 'The terms and conditions were updated. Please accept them to keep ordering.')}</p>
          <TermsBox terms={terms} />
          <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {t('قرأت الشروط والأحكام وأوافق عليها', 'I have read and accept the terms and conditions')}</label>
          <button className="btn btn-accent" disabled={!agree || busy} onClick={() => { setBusy(true); void post('me/accept-terms').then(() => refresh()).finally(() => setBusy(false)); }}>{t('أوافق', 'Accept')}</button>
        </Modal>
      )}
    </>
  );
}

/** Portal → My profile */
export function PortalProfile() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const { reload } = usePortal();
  const terms = useTerms();
  const [f, setF] = useState(() => ({ name: user?.name ?? '', phone: user?.phone ?? '', ...idOf({ company: user?.company, kyc: user?.kyc }), addr: { address1: '', address2: '', city: '', state: '', zip: '', country: '', ...(user?.addr ?? {}) } as Record<string, string> }));
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const ok = termsAccepted(terms, user.terms);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try { await post('me/profile', { name: f.name, phone: f.phone, company: f.company, type: f.type, nationalId: f.nationalId, commercialReg: f.commercialReg, taxId: f.taxId, addr: f.addr, acceptTerms: agree }); await refresh(); await reload(); setMsg(t('اتحفظت بياناتك.', 'Your details were saved.')); }
    catch (x) { setErr(x instanceof ApiError && x.message ? x.message : t('تعذّر الحفظ.', 'Could not save.')); } finally { setBusy(false); }
  };
  const a = (k: string, v: string) => setF({ ...f, addr: { ...f.addr, [k]: v } });
  return (
    <Page title={t('بياناتي', 'My profile')}>
      <form className="card form" onSubmit={save}>
        <div className="admin-form">
          <IdentityFields v={f} set={(p) => setF({ ...f, ...p })} idp="pp" />
          <div className="field"><label htmlFor="pp-n">{t('الاسم', 'Full name')}</label><input id="pp-n" className="input" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="pp-e">{t('الإيميل', 'Email')}</label><input id="pp-e" className="input latin" readOnly value={user.email} /></div>
          <div className="field"><label htmlFor="pp-p">{t('الموبايل', 'Phone')}</label><input id="pp-p" className="input latin" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label htmlFor="pp-a1">{t('العنوان', 'Address')}</label><input id="pp-a1" className="input" value={f.addr.address1} onChange={(e) => a('address1', e.target.value)} /></div>
          <div className="field"><label htmlFor="pp-ci">{t('المدينة', 'City')}</label><input id="pp-ci" className="input" value={f.addr.city} onChange={(e) => a('city', e.target.value)} /></div>
          <div className="field"><label htmlFor="pp-st">{t('المحافظة', 'State / region')}</label><input id="pp-st" className="input" value={f.addr.state} onChange={(e) => a('state', e.target.value)} /></div>
          <div className="field"><label htmlFor="pp-co">{t('البلد', 'Country')}</label><input id="pp-co" className="input" value={f.addr.country} onChange={(e) => a('country', e.target.value)} /></div>
        </div>
        {msg && <div className="form-ok" role="status">{msg}</div>}
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('حفظ', 'Save')}</button>
      </form>
      <h2 className="sub">{t('مستندات الهوية', 'Identity documents')}</h2>
      <div className="card"><KycDocs kyc={user.kyc} onChange={() => void refresh()} /></div>
      {terms && (terms.ar || terms.en) && (
        <>
          <h2 className="sub">{t('الشروط والأحكام', 'Terms & conditions')}</h2>
          <div className="card form">
            <TermsBox terms={terms} />
            {user.terms ? <p className={ok ? 'form-ok' : 'form-error'}>{ok ? t('وافقت على النسخة الحالية في', 'You accepted the current version on') : t('وافقت على نسخة قديمة في', 'You accepted an older version on')} <Ltr>{user.terms.at.slice(0, 10)}</Ltr></p> : <p className="form-error">{t('لسه ما وافقتش على الشروط.', 'You have not accepted the terms yet.')}</p>}
            {!ok && <><label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {t('قرأت الشروط والأحكام وأوافق عليها', 'I have read and accept the terms and conditions')}</label><button className="btn btn-primary btn-sm" disabled={!agree || busy} onClick={(e) => void save(e as unknown as FormEvent)}>{t('أوافق وأحفظ', 'Accept and save')}</button></>}
          </div>
        </>
      )}
    </Page>
  );
}

/** Public /terms page. */
export function TermsPage() {
  const { t } = useI18n();
  const terms = useTerms();
  return (
    <>
      <section className="container hero-wrap"><div className="hero hero-sm on-dark"><span className="eyebrow latin">TERMS</span><h1>{t('الشروط والأحكام', 'Terms & conditions')}</h1></div></section>
      <section className="section container">{termsText(terms, 'ar') ? <TermsBox terms={terms} /> : <p className="muted">{t('لم تُنشر الشروط بعد.', 'The terms have not been published yet.')}</p>}<p><Link className="link" to="/">{t('← الرئيسية', '← Home')}</Link></p></section>
    </>
  );
}
