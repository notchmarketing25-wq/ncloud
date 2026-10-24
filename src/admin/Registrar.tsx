import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, post } from '../lib/api';
import type { User } from '../lib/api';
import { Page } from '../ui';
import { errText } from './errors';

type Info = { ns: string[]; locked: boolean | null; defaultDns?: boolean; expires?: string };
type Reg = { provider: string; caps: { ns: boolean; lock: boolean; renew: boolean; epp: boolean; transfer: boolean }; canRenewPaid: boolean; pending: number; renewError: string; info: Info | null; error: string };

const msg = (x: unknown, t: (a: string, e: string) => string) => {
  const m = x instanceof Error ? x.message : '';
  if (m.startsWith('invalid nameserver')) return t('اسم الـ nameserver غير صحيح.', 'Invalid nameserver name.');
  if (m.includes('at least two')) return t('لازم اتنين nameserver على الأقل.', 'At least two nameservers are required.');
  return errText(x, t);
};

/** Nameservers, transfer lock and (for the admin) renewing at the registrar and the EPP code, straight from the provider. */
export function RegistrarCard({ id, admin }: { id: string; admin: boolean }) {
  const { t } = useI18n();
  const route = admin ? 'admin/domain-registrar' : 'svc/domain-registrar';
  const [reg, setReg] = useState<Reg | { managed: false } | null>(null);
  const [client, setClient] = useState<{ managed: boolean; off?: boolean; info: Info | null; error?: string } | null>(null);
  const [ns, setNs] = useState('');
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const [years, setYears] = useState(1); const [epp, setEpp] = useState('');
  const load = useCallback(() => {
    api<Reg & { managed?: boolean; off?: boolean }>(route, undefined, { id }).then((r) => {
      if (admin) { setReg(r); setNs((r as Reg).info?.ns.join('\n') ?? ''); }
      else { setClient(r as never); setNs(((r as never) as { info: Info | null }).info?.ns.join('\n') ?? ''); }
    }).catch((e) => setErr(msg(e, t)));
  }, [route, id, admin, t]);
  useEffect(load, [load]);
  const act = async (body: Record<string, unknown>, done: string) => {
    setErr(''); setOk(''); setBusy(true);
    try { const r = await post<Record<string, unknown>>(admin ? 'admin/domain-registrar' : (body.action === 'setns' ? 'svc/domain-ns' : 'svc/domain-lock'), { id, ...body }); setOk(done); if (typeof r.code === 'string') setEpp(r.code); load(); return r; } catch (e) { setErr(msg(e, t)); return null; } finally { setBusy(false); }
  };
  if (admin ? !reg : !client) return <div className="card"><p className="muted">…</p></div>;
  if (!admin && !client?.managed) return null;
  const info = admin ? (reg as Reg).info : client!.info;
  const off = !admin && client!.off;
  const caps = admin ? (reg as Reg).caps : { ns: true, lock: true, renew: false, epp: false, transfer: false };
  const saveNs = (e: FormEvent) => { e.preventDefault(); void act({ action: 'setns', ns: ns.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean) }, t('اتحفظت الـ nameservers (ممكن تاخد وقت لحد ما تنتشر).', 'Nameservers saved (it can take time to propagate).')); };
  const a = admin ? (reg as Reg) : null;
  return (
    <div className="card form">
      <h3>{t('المسجّل (Nameservers والقفل)', 'Registrar (nameservers & lock)')} {admin && a ? <span className="tag latin">{a.provider}</span> : null}</h3>
      {err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}
      {admin && a?.error && <div className="form-error">{t('تعذّر القراءة من المزوّد:', 'Could not read from the provider:')} {a.error}</div>}
      {!admin && client?.error && <p className="muted">{t('بيانات المسجّل مش متاحة دلوقتي.', 'Registrar details are not available right now.')}</p>}
      {admin && a && a.pending > 0 && <div className="form-error" role="status">{t(`العميل دفع تجديد ${a.pending} سنة ولسه ما اتجددش عند المسجّل.`, `The client paid for ${a.pending} year(s) that are not renewed at the registrar yet.`)} {a.renewError && <span className="latin">({a.renewError})</span>}</div>}
      {info && (
        <>
          <form onSubmit={saveNs} className="form">
            <div className="field"><label htmlFor={`ns-${id}`}>{t('Nameservers (واحد في كل سطر)', 'Nameservers (one per line)')}</label>
              <textarea id={`ns-${id}`} className="textarea latin" dir="ltr" rows={4} value={ns} disabled={!!off} onChange={(e) => setNs(e.target.value)} placeholder={info.defaultDns ? t('بيستخدم الـ DNS الافتراضي للمسجّل', 'Using the registrar default DNS') : 'ns1.example.com\nns2.example.com'} /></div>
            <div className="row-actions"><button className="btn btn-primary btn-sm" type="submit" disabled={busy || !!off}>{t('حفظ الـ nameservers', 'Save nameservers')}</button>
              {admin ? null : <span className="muted">{t('سيبها فاضية للرجوع للـ DNS الافتراضي (لو متاح).', 'Leave empty to go back to the default DNS (where available).')}</span>}</div>
          </form>
          {caps.lock && info.locked !== null && (
            <div className="row-actions"><span>{t('قفل النقل (Transfer lock):', 'Transfer lock:')} <span className={`tag ${info.locked ? 'ok' : ''}`}>{info.locked ? t('مقفول', 'Locked') : t('مفتوح', 'Unlocked')}</span></span>
              <button className="btn btn-ghost btn-sm" disabled={busy || !!off} onClick={() => void act({ action: 'setlock', lock: !info.locked }, info.locked ? t('اتفتح القفل.', 'Unlocked.') : t('اتقفل.', 'Locked.'))}>{info.locked ? t('فتح القفل', 'Unlock') : t('قفل', 'Lock')}</button></div>
          )}
          {off && <p className="muted">{t('التعديل متوقف لهذا الدومين — تواصل مع الدعم.', 'Changes are turned off for this domain — contact support.')}</p>}
        </>
      )}
      {admin && a && (
        <div className="reg-admin">
          <h4>{t('عمليات الأدمن', 'Admin actions')}</h4>
          <div className="row-actions">
            {a.caps.renew ? (<>
              <select className="select" aria-label={t('سنين', 'Years')} value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 5].map((y) => <option key={y} value={y}>{y} {t('سنة', 'yr')}</option>)}</select>
              <button className="btn btn-accent btn-sm" disabled={busy || !a.canRenewPaid} onClick={() => { if (window.confirm(t('ده هيخصم تكلفة التجديد من رصيدك عند المسجّل. تكمل؟', 'This charges the renewal to your balance at the registrar. Continue?'))) void act({ action: 'renew', years, confirm: true }, t('اتجدد عند المسجّل.', 'Renewed at the registrar.')); }}>{t('جدّد عند المسجّل', 'Renew at registrar')}</button>
              {!a.canRenewPaid && <span className="muted">{t('فعّله من الإعدادات أولًا.', 'Turn it on in Settings first.')}</span>}
            </>) : <span className="muted">{t('التجديد عند المسجّل بيتم من لوحته.', 'Renewals at this registrar are done in its own panel.')}</span>}
            {a.caps.epp && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act({ action: 'epp' }, t('ده كود النقل:', 'Transfer code:'))}>{t('كود النقل (EPP)', 'Transfer (EPP) code')}</button>}
          </div>
          {epp && <p>{t('كود النقل:', 'Transfer code:')} <b className="latin" style={{ overflowWrap: 'anywhere' }}>{epp}</b></p>}
        </div>
      )}
    </div>
  );
}

/** Admin: bring a domain in from another registrar. */
export function AdminTransferIn() {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [provs, setProvs] = useState<{ id: string; name: string; connected: boolean }[]>([]);
  const [f, setF] = useState({ name: '', provider: '', epp: '', uid: '', years: 1, confirm: false });
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ users: User[] }>('admin/users').then((r) => { setUsers(r.users.filter((u) => u.role === 'client')); setF((x) => ({ ...x, uid: x.uid || r.users.find((u) => u.role === 'client')?.id || '' })); }).catch(() => undefined);
    api<{ providers: { id: string; name: string; connected: boolean }[] }>('admin/providers').then((r) => { const p = r.providers.filter((x) => x.connected && x.id !== 'hostinger'); setProvs(p); setF((x) => ({ ...x, provider: x.provider || p[0]?.id || '' })); }).catch(() => undefined);
  }, []);
  const go = async (e: FormEvent) => { e.preventDefault(); setErr(''); setOk(''); setBusy(true); try { const r = await post<{ domain: { id: string } }>('admin/domain-transfer', f); setOk(t('اتبعت طلب النقل. الدومين ظهر بحالة "قيد التفعيل" لحد ما المسجّل يكمّل النقل.', 'The transfer was requested. The domain is listed as pending until the registrar completes it.') + ' ' + r.domain.id); setF({ ...f, name: '', epp: '', confirm: false }); } catch (x) { setErr(msg(x, t)); } finally { setBusy(false); } };
  return (
    <Page title={t('نقل دومين لحسابك', 'Transfer a domain in')} action={<Link to="/admin/domains" className="btn btn-ghost btn-sm">{t('← الدومينات', '← Domains')}</Link>}>
      <form className="card form" onSubmit={go} style={{ maxWidth: 560 }}>
        <p className="muted">{t('خد كود النقل (EPP) من المسجّل القديم وافتح القفل هناك، وبعدين اكتبه هنا. النقل بيخصم من رصيدك عند المزوّد وممكن ياخد لحد 7 أيام. فعّل "التسجيل / التجديد عند المزوّد" من الإعدادات الأول.', 'Get the transfer (EPP) code from the old registrar and unlock the domain there, then enter it here. A transfer is charged to your balance at the provider and can take up to 7 days. Turn on "register / renew at the provider" in Settings first.')}</p>
        {err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}
        <div className="field"><label htmlFor="tr-n">{t('الدومين', 'Domain')}</label><input id="tr-n" className="input latin" dir="ltr" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="example.com" /></div>
        <div className="field"><label htmlFor="tr-e">{t('كود النقل (EPP)', 'Transfer (EPP) code')}</label><input id="tr-e" className="input latin" dir="ltr" required value={f.epp} onChange={(e) => setF({ ...f, epp: e.target.value })} autoComplete="off" /></div>
        <div className="field"><label htmlFor="tr-p">{t('المزوّد', 'Provider')}</label><select id="tr-p" className="select" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{provs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="field"><label htmlFor="tr-u">{t('العميل', 'Client')}</label><select id="tr-u" className="select" value={f.uid} onChange={(e) => setF({ ...f, uid: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
        <label className="check"><input type="checkbox" checked={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.checked })} /> {t('فاهم إن ده بيخصم فلوس من حسابي عند المزوّد', 'I understand this spends money from my provider account')}</label>
        <button className="btn btn-accent" type="submit" disabled={busy || !f.confirm || !f.provider || !f.uid}>{busy ? '…' : t('ابدأ النقل', 'Start the transfer')}</button>
        {provs.length === 0 && <p className="muted">{t('اربط Namecheap أو ResellerClub من صفحة التطبيقات الأول.', 'Connect Namecheap or ResellerClub in Apps first.')}</p>}
      </form>
    </Page>
  );
}
