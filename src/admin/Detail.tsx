import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DnsEditor } from '../dns';
import { Ltr, useI18n } from '../i18n';
import { api, apiUrl, post, type User } from '../lib/api';
import type { DnsRec } from '../lib/types';
import { useCurrency } from '../site/settings';
import { day, Page, StatusTag, Table } from '../ui';
import { errText } from './errors';

type Item = { id: string; uid: string; [k: string]: unknown };
type DomainFull = {
  domain: Item & { name: string; dns: DnsRec[]; status: string; expires: string; autoRenew: boolean; provider?: string; cost?: number; price?: number; notes?: string; dnsSynced?: boolean };
  owner: User | null; hosting: Item[]; websites: Item[]; mailboxes: Item[]; canPull: boolean; canPush: boolean;
};
const PROVIDERS = ['hostinger', 'namecheap', 'resellerclub'];
const STATUS: [string, string, string][] = [['active', 'نشط', 'Active'], ['pending', 'قيد التفعيل', 'Pending'], ['expiring', 'قرب ينتهي', 'Expiring'], ['stopped', 'متوقف', 'Stopped']];

function Notice({ err, ok }: { err: string; ok: string }) {
  return <>{err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}</>;
}
function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api<{ users: User[] }>('admin/users').then((r) => setUsers(r.users)).catch(() => undefined); }, []);
  return users;
}

/* ───────── One domain: details, client, provider, DNS and everything linked to it ───────── */
export function AdminDomainDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const users = useUsers();
  const [d, setD] = useState<DomainFull | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [dnsErr, setDnsErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<DomainFull>('admin/domain', undefined, { id: id ?? '' }).then((r) => { setD(r); setForm({ ...r.domain }); }).catch((e) => setErr(errText(e, t)));
  }, [id, t]);
  useEffect(load, [load]);
  if (!d) return <Page title={t('الدومين', 'Domain')}><Notice err={err} ok="" /><Link to="/admin/domains" className="btn btn-ghost btn-sm">{t('← الدومينات', '← Domains')}</Link></Page>;
  const dom = d.domain;
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); setBusy(true); try { await fn(); setOk(done); load(); } catch (e) { setErr(errText(e, t)); } finally { setBusy(false); } };
  const save = (e: FormEvent) => { e.preventDefault(); void run(() => post('admin/item-save', { item: { ...dom, ...form } }, { res: 'domains' }), t('اتحفظ.', 'Saved.')); };
  const dnsCall = async (action: 'pull' | 'push') => {
    if (action === 'push' && !window.confirm(t('هنبعت السجلات دي للمزوّد وتستبدل سجلاته الحالية. تكمل؟', 'This sends these records to the provider and replaces its current ones. Continue?'))) return;
    void run(async () => { const r = await post<{ records: number }>('admin/domain-dns', { id: dom.id, action }); setOk(t(`تمام (${r.records} سجل).`, `Done (${r.records} records).`)); }, '');
  };
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  const margin = Number(form.cost) > 0 && Number(form.price) > 0 ? Math.round(((Number(form.price) - Number(form.cost)) / Number(form.cost)) * 100) : null;
  return (
    <Page title={dom.name} action={<Link to="/admin/domains" className="btn btn-ghost btn-sm">{t('← الدومينات', '← Domains')}</Link>}>
      <Notice err={err} ok={ok} />
      <div className="card">
        <h3>{t('العميل', 'Client')}</h3>
        {d.owner ? <p><b>{d.owner.name}</b> · <Ltr>{d.owner.email}</Ltr> <Link className="link" to="/admin/users">{t('المستخدمين', 'Users')}</Link></p> : <p className="muted">{t('مش مربوط بعميل.', 'Not linked to a client.')}</p>}
      </div>
      <form className="card admin-form" onSubmit={save}>
        <div className="field"><label htmlFor="dd-uid">{t('اربطه بعميل', 'Linked client')}</label>
          <select id="dd-uid" className="select" value={String(form.uid ?? '')} onChange={(e) => set('uid', e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
        <div className="field"><label htmlFor="dd-st">{t('الحالة', 'Status')}</label>
          <select id="dd-st" className="select" value={String(form.status ?? 'active')} onChange={(e) => set('status', e.target.value)}>{STATUS.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></div>
        <div className="field"><label htmlFor="dd-ex">{t('ينتهي في', 'Expires')}</label><input id="dd-ex" className="input" type="date" value={String(form.expires ?? '')} onChange={(e) => set('expires', e.target.value)} /></div>
        <div className="field"><label htmlFor="dd-pv">{t('المزوّد', 'Provider')}</label>
          <select id="dd-pv" className="select" value={String(form.provider ?? '')} onChange={(e) => set('provider', e.target.value)}><option value="">{t('بدون', 'None')}</option>{PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="field"><label htmlFor="dd-co">{t('تكلفتك (سنة)', 'Your cost (per year)')} · {cur}</label><input id="dd-co" className="input latin" type="number" min={0} step="any" value={String(form.cost ?? '')} onChange={(e) => set('cost', e.target.value === '' ? '' : Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="dd-pr">{t('سعر العميل (سنة)', 'Client price (per year)')} · {cur}{margin !== null ? ` · ${margin}%` : ''}</label><input id="dd-pr" className="input latin" type="number" min={0} step="any" value={String(form.price ?? '')} onChange={(e) => set('price', e.target.value === '' ? '' : Number(e.target.value))} /></div>
        <label className="check"><input type="checkbox" checked={Boolean(form.autoRenew)} onChange={(e) => set('autoRenew', e.target.checked)} /> {t('تجديد تلقائي', 'Auto-renew')}</label>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="dd-nt">{t('ملاحظات', 'Notes')}</label><input id="dd-nt" className="input" value={String(form.notes ?? '')} onChange={(e) => set('notes', e.target.value)} /></div>
        <div className="admin-form-actions"><button className="btn btn-accent" type="submit" disabled={busy}>{t('حفظ', 'Save')}</button></div>
      </form>

      <h2 className="sub">{t('المرتبط بالدومين', 'Linked to this domain')}</h2>
      <div className="linked">
        {d.websites.map((w) => <div key={w.id}><span>{t('موقع', 'Website')}: <Ltr>{String(w.name)}</Ltr></span><Link className="link" to="/admin/websites">{t('المواقع', 'Websites')}</Link></div>)}
        {d.hosting.map((h) => <div key={h.id}><span>{t('استضافة', 'Hosting')}: {String(h.plan)}</span><Link className="link" to="/admin/hosting">{t('الاستضافة', 'Hosting')}</Link></div>)}
        {d.mailboxes.map((m) => <div key={m.id}><span>{t('إيميل', 'Mailbox')}: <Ltr>{String(m.address)}</Ltr></span><Link className="link" to="/admin/email">{t('الإيميلات', 'Email')}</Link></div>)}
        {d.websites.length + d.hosting.length + d.mailboxes.length === 0 && <p className="muted">{t('مفيش حاجة مرتبطة. اربط موقع من صفحة المواقع.', 'Nothing linked yet. Link a website on the Websites page.')}</p>}
      </div>

      <h2 className="sub">{t('سجلات DNS', 'DNS records')}</h2>
      <div className="row-actions" style={{ marginBottom: 10 }}>
        <button className="btn btn-primary btn-sm" disabled={!d.canPull || busy} onClick={() => void dnsCall('pull')} title={d.canPull ? '' : t('اختار مزوّد يدعم DNS', 'Choose a provider with DNS support')}>{t('جلب من المزوّد', 'Pull from provider')}</button>
        <button className="btn btn-ghost btn-sm" disabled={!d.canPush || busy} onClick={() => void dnsCall('push')}>{t('إرسال للمزوّد', 'Push to provider')}</button>
        {dom.dnsSynced && <span className="tag ok">{t('متزامن مع المزوّد', 'Synced with provider')}</span>}
      </div>
      <p className="muted">{dom.dnsSynced ? t('أي تعديل (منك أو من العميل) بيتبعت للمزوّد تلقائيًا.', 'Every change (yours or the client’s) is sent to the provider automatically.') : t('اجلب السجلات من المزوّد الأول عشان التعديلات تتزامن معاه. لحد وقتها التعديلات محلية.', 'Pull the records first so changes sync with the provider. Until then changes stay local.')}</p>
      <DnsEditor records={dom.dns ?? []} err={dnsErr}
        onAdd={async (r) => { setDnsErr(''); try { const x = await post<{ warning?: string }>('svc/dns-save', { id: dom.id, ...r }); if (x.warning) setDnsErr(x.warning); load(); } catch (e) { setDnsErr(errText(e, t)); } }}
        onDelete={async (rid) => { setDnsErr(''); try { const x = await post<{ warning?: string }>('svc/dns-delete', { id: dom.id, rid }); if (x.warning) setDnsErr(x.warning); load(); } catch (e) { setDnsErr(errText(e, t)); } }} />
    </Page>
  );
}

/* ───────── Websites: each one linked to a client, a hosting plan and a domain ───────── */
export function AdminWebsites() {
  const { t } = useI18n();
  const users = useUsers();
  const [sites, setSites] = useState<Item[]>([]);
  const [domains, setDomains] = useState<Item[]>([]);
  const [hosting, setHosting] = useState<Item[]>([]);
  const [mails, setMails] = useState<Item[]>([]);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => {
    const get = (res: string, set: (i: Item[]) => void) => api<{ items: Item[] }>('admin/items', undefined, { res }).then((r) => set(r.items)).catch((e) => setErr(errText(e, t)));
    void get('websites', setSites); void get('domains', setDomains); void get('hosting', setHosting); void get('mailboxes', setMails);
  }, [t]);
  useEffect(load, [load]);
  const owner = (uid: string) => users.find((u) => u.id === uid);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };
  const set = (k: string, v: unknown) => setForm({ ...(form ?? {}), [k]: v });
  const blank = { uid: users.find((u) => u.role === 'client')?.id ?? users[0]?.id ?? '', name: '', url: '', status: 'active', domainId: '', hostingId: '', notes: '' };
  const mine = (uid: unknown) => (list: Item[]) => list.filter((x) => x.uid === uid);
  return (
    <Page title={t('المواقع', 'Websites')} action={<button className="btn btn-primary btn-sm" onClick={() => setForm(form ? null : blank)}>{form ? t('إلغاء', 'Cancel') : t('+ موقع', '+ Website')}</button>}>
      <Notice err={err} ok={ok} />
      {form && (
        <form className="card admin-form" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/item-save', { item: form }, { res: 'websites' }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setForm(null); }); }}>
          <div className="field"><label htmlFor="w-uid">{t('العميل', 'Client')}</label><select id="w-uid" className="select" required value={String(form.uid ?? '')} onChange={(e) => setForm({ ...form, uid: e.target.value, domainId: '', hostingId: '' })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
          <div className="field"><label htmlFor="w-name">{t('اسم الموقع', 'Site name')}</label><input id="w-name" className="input latin" required value={String(form.name ?? '')} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="w-url">{t('الرابط / الدومين', 'URL / domain')}</label><input id="w-url" className="input latin" value={String(form.url ?? '')} onChange={(e) => set('url', e.target.value)} /></div>
          <div className="field"><label htmlFor="w-st">{t('الحالة', 'Status')}</label><select id="w-st" className="select" value={String(form.status)} onChange={(e) => set('status', e.target.value)}>{STATUS.filter((s) => s[0] !== 'expiring').map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></div>
          <div className="field"><label htmlFor="w-dom">{t('الدومين المرتبط', 'Linked domain')}</label><select id="w-dom" className="select" value={String(form.domainId ?? '')} onChange={(e) => set('domainId', e.target.value)}><option value="">{t('بدون', 'None')}</option>{mine(form.uid)(domains).map((x) => <option key={x.id} value={x.id}>{String(x.name)}</option>)}</select></div>
          <div className="field"><label htmlFor="w-host">{t('الاستضافة المرتبطة', 'Linked hosting')}</label><select id="w-host" className="select" value={String(form.hostingId ?? '')} onChange={(e) => set('hostingId', e.target.value)}><option value="">{t('بدون', 'None')}</option>{mine(form.uid)(hosting).map((x) => <option key={x.id} value={x.id}>{String(x.plan)}{x.domain ? ` · ${x.domain}` : ''}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="w-nt">{t('ملاحظات', 'Notes')}</label><input id="w-nt" className="input" value={String(form.notes ?? '')} onChange={(e) => set('notes', e.target.value)} /></div>
          <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
        </form>
      )}
      <Table head={[t('الموقع', 'Website'), t('الحالة', 'Status'), t('الدومين', 'Domain'), t('الاستضافة', 'Hosting'), t('الإيميلات', 'Mailboxes'), t('العميل', 'Client'), '']} empty={sites.length === 0 ? t('مفيش مواقع لسه. اجلبها من Apps أو أضفها يدويًا.', 'No websites yet. Import them from Apps or add one.') : undefined}>
        {sites.map((w) => {
          const dom = domains.find((x) => x.id === w.domainId);
          const host = hosting.find((x) => x.id === w.hostingId);
          return (
            <tr key={w.id}>
              <td><Ltr>{String(w.name)}</Ltr></td><td><StatusTag s={w.status as 'active'} /></td>
              <td>{dom ? <Link className="link" to={`/admin/domains/${dom.id}`}><Ltr>{String(dom.name)}</Ltr></Link> : '-'}</td>
              <td>{host ? String(host.plan) : '-'}</td>
              <td className="latin">{dom ? mails.filter((m) => String(m.address).toLowerCase().endsWith('@' + String(dom.name).toLowerCase())).length : '-'}</td>
              <td>{owner(w.uid)?.name ?? '-'}</td>
              <td><div className="row-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ ...w }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('تعديل', 'Edit')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف الموقع؟', 'Delete this website?'))) void run(() => post('admin/item-delete', { id: w.id }, { res: 'websites' }), t('اتحذف.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>
              </div></td>
            </tr>
          );
        })}
      </Table>
    </Page>
  );
}

/* ───────── Updates: upload a version package instead of reinstalling ───────── */
type UpdInfo = { version: string; php: string; storage: string; maxUpload: string; history: { from: string; to: string; at: string; by: string; files: number }[] };
export function AdminUpdates() {
  const { t } = useI18n();
  const [info, setInfo] = useState<UpdInfo | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<UpdInfo>('admin/update').then(setInfo).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setErr(''); setOk(''); setBusy(true);
    try {
      const fd = new FormData(); fd.append('pkg', file);
      const res = await fetch(apiUrl('admin/update'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
      const j = await res.json().catch(() => null) as { error?: string; from?: string; version?: string; files?: number } | null;
      if (!res.ok || !j) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setOk(t(`اتحدّث من ${j.from} إلى ${j.version} (${j.files} ملف). حدّث الصفحة (Ctrl+F5) عشان تشوف الواجهة الجديدة.`, `Updated ${j.from} → ${j.version} (${j.files} files). Reload the page (Ctrl+F5) to see the new interface.`));
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'error'); } finally { setBusy(false); }
  };
  return (
    <Page title={t('التحديثات', 'Updates')}>
      <Notice err={err} ok={ok} />
      {info && (
        <div className="card">
          <dl className="kv">
            <div><dt>{t('النسخة الحالية', 'Installed version')}</dt><dd className="latin">{info.version}</dd></div>
            <div><dt>PHP</dt><dd className="latin">{info.php}</dd></div>
            <div><dt>{t('التخزين', 'Storage')}</dt><dd className="latin">{info.storage}</dd></div>
            <div><dt>{t('أقصى رفع', 'Max upload')}</dt><dd className="latin">{info.maxUpload}</dd></div>
          </dl>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>{t('ارفع ملف تحديث', 'Upload an update file')}</h3>
        <p className="muted">{t('الملف اسمه ncloud-update-X.Y.Z.json وفيه الملفات اللي اتغيّرت بس. بياخد نسخة احتياطية من الملفات القديمة، ومبيلمسش بياناتك ولا الحسابات.', 'The file is named ncloud-update-X.Y.Z.json and holds only the files that changed. The old files are backed up and your data and accounts are never touched.')}</p>
        <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {info && info.history.length > 0 && (
        <>
          <h2 className="sub">{t('آخر التحديثات', 'Recent updates')}</h2>
          <Table head={[t('من', 'From'), t('إلى', 'To'), t('الملفات', 'Files'), t('بواسطة', 'By'), t('التاريخ', 'Date')]}>
            {info.history.map((h, i) => <tr key={i}><td className="latin">{h.from}</td><td className="latin">{h.to}</td><td className="latin">{h.files}</td><td>{h.by}</td><td><Ltr>{day(h.at)}</Ltr></td></tr>)}
          </Table>
        </>
      )}
    </Page>
  );
}
