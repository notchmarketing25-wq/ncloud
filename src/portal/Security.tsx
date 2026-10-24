import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePortal } from './PortalData';
import qrcode from 'qrcode-generator';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { ApiError, post } from '../lib/api';
import { errText } from '../admin/errors';
import { copyText } from './Extras';

const msgOf = (x: unknown, t: (a: string, e: string) => string) => {
  const m = x instanceof ApiError ? x.message : '';
  if (m === 'wrong two-factor code') return t('الكود غلط أو اتستخدم قبل كده.', 'Wrong or already used code.');
  if (m === 'current password is wrong') return t('كلمة السر الحالية غلط.', 'The current password is wrong.');
  if (m.startsWith('password must')) return t('كلمة السر لازم تكون 8 حروف على الأقل.', 'The password must be at least 8 characters.');
  if (m.startsWith('too many')) return t('محاولات كتير، جرّب بعد 10 دقايق.', 'Too many attempts, try again in 10 minutes.');
  return t('تعذّر تنفيذ الطلب.', 'The request failed.');
};

/** The QR code of an otpauth:// link, drawn in the browser (nothing leaves the page). */
function Qr({ text }: { text: string }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div className="qr-box" aria-label="QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Password change + two-factor authentication, for clients and admins alike. */
export function SecurityCard() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState(''); const [recovery, setRecovery] = useState<string[] | null>(null);
  const [off, setOff] = useState(false); const [offPw, setOffPw] = useState(''); const [offCode, setOffCode] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!user) return null;
  const run = async (fn: () => Promise<void>) => { setErr(''); setBusy(true); try { await fn(); } catch (x) { setErr(msgOf(x, t)); } finally { setBusy(false); } };
  const changePw = async (e: FormEvent) => { e.preventDefault(); setPwErr(''); setPwMsg(''); try { await post('auth/password', { current: cur, new: next }); setPwMsg(t('تم تغيير كلمة السر.', 'Password changed.')); setCur(''); setNext(''); } catch (x) { setPwErr(msgOf(x, t)); } };
  return (
    <>
      <h2 className="sub">{t('الأمان', 'Security')}</h2>
      <div className="sec-grid">
        <form className="card form" onSubmit={changePw}>
          <h3>{t('تغيير كلمة السر', 'Change password')}</h3>
          {pwErr && <div className="form-error" role="alert">{pwErr}</div>}{pwMsg && <div className="form-ok" role="status">{pwMsg}</div>}
          <div className="field"><label htmlFor="sc-c">{t('الحالية', 'Current')}</label><input id="sc-c" className="input latin" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="field"><label htmlFor="sc-n">{t('الجديدة (8 حروف أو أكتر)', 'New (8+ characters)')}</label><input id="sc-n" className="input latin" type="password" minLength={8} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <button className="btn btn-primary" type="submit">{t('حفظ', 'Save')}</button>
        </form>
        <div className="card form">
          <h3>{t('التحقق بخطوتين', 'Two-factor authentication')} {user.twoFactor ? <span className="tag ok">{t('شغّال', 'On')}</span> : <span className="tag">{t('مقفول', 'Off')}</span>}</h3>
          {err && <div className="form-error" role="alert">{err}</div>}
          {recovery ? (
            <>
              <p className="form-ok">{t('اتفعّل. احفظ كودات الاسترجاع دي في مكان آمن: كل كود يشتغل مرة واحدة لو فقدت موبايلك. مش هتظهر تاني.', 'It is on. Keep these recovery codes somewhere safe: each works once if you lose your phone. They are not shown again.')}</p>
              <pre className="rec-codes latin">{recovery.join('\n')}</pre>
              <div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => void copyText(recovery.join('\n'))}>{t('نسخ', 'Copy')}</button><button className="btn btn-accent btn-sm" onClick={() => setRecovery(null)}>{t('حفظتها', 'I saved them')}</button></div>
            </>
          ) : user.twoFactor ? (
            off ? (
              <>
                <p className="muted">{t('اكتب كلمة السر وكود من التطبيق (أو كود استرجاع) عشان تقفله.', 'Enter your password and a code from the app (or a recovery code) to turn it off.')}</p>
                <div className="field"><label htmlFor="of-p">{t('كلمة السر', 'Password')}</label><input id="of-p" className="input latin" type="password" autoComplete="current-password" value={offPw} onChange={(e) => setOffPw(e.target.value)} /></div>
                <div className="field"><label htmlFor="of-c">{t('الكود', 'Code')}</label><input id="of-c" className="input latin" dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={offCode} onChange={(e) => setOffCode(e.target.value)} /></div>
                <div className="row-actions"><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(async () => { await post('auth/2fa-disable', { password: offPw, code: offCode }); setOff(false); setOffPw(''); setOffCode(''); await refresh(); })}>{t('قفل التحقق بخطوتين', 'Turn off')}</button><button className="btn btn-ghost btn-sm" onClick={() => setOff(false)}>{t('إلغاء', 'Cancel')}</button></div>
              </>
            ) : (<><p className="muted">{t('حسابك محمي: بنطلب كود من تطبيق المصادقة مع كل دخول.', 'Your account is protected: a code from your authenticator app is asked at every sign-in.')}</p><button className="btn btn-ghost btn-sm" onClick={() => setOff(true)}>{t('قفل', 'Turn off')}</button></>)
          ) : setup ? (
            <>
              <p className="muted">{t('1) افتح تطبيق المصادقة (Google Authenticator أو Microsoft Authenticator أو Authy) وامسح الكود. 2) اكتب الكود المكوّن من 6 أرقام.', '1) Open your authenticator app (Google Authenticator, Microsoft Authenticator or Authy) and scan the code. 2) Type the 6-digit code it shows.')}</p>
              <Qr text={setup.uri} />
              <p className="muted">{t('أو أدخل المفتاح يدويًا:', 'Or enter the key by hand:')} <b className="latin" style={{ overflowWrap: 'anywhere' }}>{setup.secret}</b></p>
              <div className="field"><label htmlFor="en-c">{t('الكود', 'Code')}</label><input id="en-c" className="input latin" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
              <div className="row-actions"><button className="btn btn-accent btn-sm" disabled={busy || code.length !== 6} onClick={() => void run(async () => { const r = await post<{ recovery: string[] }>('auth/2fa-enable', { code }); setSetup(null); setCode(''); setRecovery(r.recovery); await refresh(); })}>{t('تفعيل', 'Turn on')}</button><button className="btn btn-ghost btn-sm" onClick={() => setSetup(null)}>{t('إلغاء', 'Cancel')}</button></div>
            </>
          ) : (<><p className="muted">{t('طبقة حماية إضافية: كود من موبايلك مع كلمة السر. بنوصي بيها لحسابات الإدارة.', 'An extra layer: a code from your phone on top of the password. Recommended for admin accounts.')}</p><button className="btn btn-accent btn-sm" disabled={busy} onClick={() => void run(async () => setSetup(await post<{ secret: string; uri: string }>('auth/2fa-setup', {})))}>{t('تفعيل', 'Set up')}</button></>)}
        </div>
      </div>
    </>
  );
}

/** "Pay my renewals automatically": a card saved at Stripe (we keep only its brand, last 4 digits and expiry). */
export function CardSection() {
  const { t } = useI18n();
  const { data, reload } = usePortal();
  const [qs, setQs] = useSearchParams();
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const session = qs.get('card');
  useEffect(() => {
    if (!session) return;
    void post('cards/confirm', { session }).then(async () => { setOk(t('اتحفظ الكارت. التجديدات هتتدفع أوتوماتيك.', 'Card saved. Renewals will be paid automatically.')); await reload(); }).catch((e) => setErr(errText(e, t))).finally(() => { const n = new URLSearchParams(qs); n.delete('card'); setQs(n, { replace: true }); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  if (!data || !data.cardsAvailable) return null;
  const c = data.card;
  const run = async (fn: () => Promise<void>) => { setErr(''); setOk(''); setBusy(true); try { await fn(); await reload(); } catch (e) { setErr(errText(e, t)); } finally { setBusy(false); } };
  return (
    <div className="card form card-soft" style={{ marginBottom: 16 }}>
      <h3>{t('الدفع التلقائي للتجديدات', 'Automatic payment of renewals')}</h3>
      {err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}
      {c ? (
        <>
          <p>{t('الكارت المحفوظ:', 'Saved card:')} <b className="latin">{c.brand.toUpperCase()} •••• {c.last4}</b> <span className="muted latin">({c.exp})</span></p>
          <label className="check"><input type="checkbox" checked={c.autopay} disabled={busy} onChange={(e) => void run(async () => { await post('cards/autopay', { on: e.target.checked }); })} /> {t('ادفع فواتير التجديد من الكارت ده أوتوماتيك قبل ما تنتهي الخدمة', 'Pay renewal invoices with this card automatically before the service expires')}</label>
          <div className="row-actions"><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run(async () => { const r = await post<{ url: string }>('cards/setup', {}); window.location.href = r.url; })}>{t('تغيير الكارت', 'Change card')}</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm(t('تمسح الكارت المحفوظ؟', 'Remove the saved card?'))) void run(async () => { await post('cards/remove', {}); }); }}>{t('حذف الكارت', 'Remove card')}</button></div>
        </>
      ) : (
        <>
          <p className="muted">{t('احفظ كارتك مرة واحدة، وهنسحب تلقائيًا قيمة تجديد الدومينات والاستضافة قبل انتهائها. بيانات الكارت بتتحفظ عند Stripe مش عندنا، وتقدر تمسحه في أي وقت.', 'Save your card once and we charge domain and hosting renewals automatically before they expire. The card is kept by Stripe, not by us, and you can remove it any time.')}</p>
          <div><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run(async () => { const r = await post<{ url: string }>('cards/setup', {}); window.location.href = r.url; })}>{t('حفظ كارت', 'Save a card')}</button></div>
        </>
      )}
    </div>
  );
}
