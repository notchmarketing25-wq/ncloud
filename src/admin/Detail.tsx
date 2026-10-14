import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DnsEditor } from '../dns';
import { Ltr, useI18n } from '../i18n';
import { api, apiUrl, post, type User } from '../lib/api';
import type { DnsRec } from '../lib/types';
import { useCurrency } from '../site/settings';
import { day, Meter, Page, StatusTag, Table } from '../ui';
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
              <td><Link className="link" to={`/admin/websites/${w.id}`}><Ltr>{String(w.name)}</Ltr></Link></td><td><StatusTag s={w.status as 'active'} /></td>
              <td>{dom ? <Link className="link" to={`/admin/domains/${dom.id}`}><Ltr>{String(dom.name)}</Ltr></Link> : '-'}</td>
              <td>{host ? <Link className="link" to={`/admin/hosting/${host.id}`}>{String(host.plan)}</Link> : '-'}</td>
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
  const verOf = (name: string) => /(\d+)\.(\d+)\.(\d+)/.exec(name)?.slice(1).map(Number) ?? [0, 0, 0];
  const send = async (file: File) => {
    const fd = new FormData(); fd.append('pkg', file);
    const res = await fetch(apiUrl('admin/update'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
    const j = await res.json().catch(() => null) as { error?: string; from?: string; version?: string; files?: number } | null;
    return { res, j };
  };
  /** One or several update files: applied oldest first, so you can drop all the versions you skipped at once. */
  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setErr(''); setOk(''); setBusy(true);
    const files = [...list].sort((a, b) => { const x = verOf(a.name), y = verOf(b.name); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    const done: string[] = [];
    try {
      for (const f of files) {
        const { res, j } = await send(f);
        if (res.status === 409 && /not newer/.test(j?.error ?? '') && files.length > 1) { done.push(t(`${f.name}: مثبّت قبل كده`, `${f.name}: already installed`)); continue; }
        if (!res.ok || !j) throw new Error(`${f.name}: ${j?.error ?? `HTTP ${res.status}`}`);
        done.push(`${j.from} → ${j.version} (${j.files})`);
      }
      const applied = done.some((x) => x.includes('→'));
      setOk((applied ? t('اتحدّث: ', 'Updated: ') : t('النظام محدّث بالفعل: ', 'Already up to date: ')) + done.join(' · ') + (applied ? t('. حدّث الصفحة (Ctrl+F5) عشان تشوف الواجهة الجديدة.', '. Reload the page (Ctrl+F5) to see the new interface.') : ''));
    } catch (e) {
      setErr((done.length ? t('اتطبّق: ', 'Applied: ') + done.join(' · ') + ' — ' : '') + (e instanceof Error ? e.message : 'error'));
    } finally { setBusy(false); load(); }
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
        <input type="file" multiple accept=".json,application/json" disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        <p className="muted">{t('تقدر تختار أكتر من ملف مرة واحدة (لو فاتك إصدارات): بيتطبقوا من الأقدم للأحدث.', 'You can pick several files at once (if you skipped versions): they are applied oldest first.')}</p>
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

/* ───────── everything the system holds, for the detail pages ───────── */
type AllData = { users: User[]; items: Record<string, Item[]>; tickets: { id: string; uid: string; subject: string; status: string; updated: string }[] };
function useAll() {
  const { t } = useI18n();
  const [all, setAll] = useState<AllData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api<AllData>('admin/all').then(setAll).catch((e) => setError(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  return { all, error, load };
}
const under = (host: unknown, name: unknown) => { const h = String(host ?? '').toLowerCase(), n = String(name ?? '').toLowerCase(); return n !== '' && (h === n || h.endsWith('.' + n)); };
const gb = (n: unknown) => `${Number(n ?? 0)} GB`;
const usage = (it: Item) => (Number(it.diskGb) > 0 ? (Number(it.usedGb) / Number(it.diskGb)) * 100 : 0);

function ClientLine({ users, uid }: { users: User[]; uid: string }) {
  const { t } = useI18n();
  const u = users.find((x) => x.id === uid);
  return u ? <Link className="link" to={`/admin/users/${u.id}`}>{u.name} · <Ltr>{u.email}</Ltr></Link> : <span className="muted">{t('بدون عميل', 'No client')}</span>;
}

/* ───────── One website: its client, domain, hosting and mailboxes ───────── */
export function AdminWebsiteDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const site = all?.items.websites.find((w) => w.id === id);
  useEffect(() => { if (site) setForm({ ...site }); }, [site]);
  if (!all || !site || !form) return <Page title={t('الموقع', 'Website')}><Notice err={error} ok="" /><Link to="/admin/websites" className="btn btn-ghost btn-sm">{t('← المواقع', '← Websites')}</Link></Page>;
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  const uid = String(form.uid);
  const domains = all.items.domains.filter((x) => x.uid === uid);
  const hostings = all.items.hosting.filter((x) => x.uid === uid);
  const dom = all.items.domains.find((x) => x.id === site.domainId) ?? all.items.domains.find((x) => under(site.url || site.name, x.name));
  const host = all.items.hosting.find((x) => x.id === site.hostingId);
  const mails = dom ? all.items.mailboxes.filter((m) => String(m.address).toLowerCase().endsWith('@' + String(dom.name).toLowerCase())) : [];
  const save = async (e: FormEvent) => { e.preventDefault(); setErr(''); setOk(''); try { await post('admin/item-save', { item: form }, { res: 'websites' }); setOk(t('اتحفظ.', 'Saved.')); load(); } catch (x) { setErr(errText(x, t)); } };
  return (
    <Page title={String(site.name)} action={<Link to="/admin/websites" className="btn btn-ghost btn-sm">{t('← المواقع', '← Websites')}</Link>}>
      <Notice err={err} ok={ok} />
      <div className="card"><dl className="kv">
        <div><dt>{t('العميل', 'Client')}</dt><dd><ClientLine users={all.users} uid={site.uid} /></dd></div>
        <div><dt>{t('الحالة', 'Status')}</dt><dd><StatusTag s={site.status as 'active'} /></dd></div>
        <div><dt>{t('الرابط', 'URL')}</dt><dd><Ltr>{String(site.url || site.name)}</Ltr></dd></div>
        <div><dt>{t('الدومين', 'Domain')}</dt><dd>{dom ? <Link className="link" to={`/admin/domains/${dom.id}`}><Ltr>{String(dom.name)}</Ltr></Link> : '-'}</dd></div>
        <div><dt>{t('الاستضافة', 'Hosting')}</dt><dd>{host ? <Link className="link" to={`/admin/hosting/${host.id}`}>{String(host.plan)}</Link> : '-'}</dd></div>
        <div><dt>{t('إيميلات الدومين', 'Domain mailboxes')}</dt><dd className="latin">{mails.length}</dd></div>
      </dl></div>

      {host && <div className="card" style={{ marginTop: 16 }}><h3>{t('الاستضافة', 'Hosting')}: {String(host.plan)}</h3>
        <p className="muted latin">{gb(host.usedGb)} / {gb(host.diskGb)}</p><Meter value={usage(host)} tone={usage(host) > 85 ? 'warn' : undefined} /></div>}
      {dom && <div className="card" style={{ marginTop: 16 }}><h3>{t('الدومين', 'Domain')}: <Ltr>{String(dom.name)}</Ltr></h3>
        <p className="muted">{t('ينتهي', 'Expires')}: <Ltr>{String(dom.expires || '-')}</Ltr> · {t('سجلات DNS', 'DNS records')}: <span className="latin">{((dom.dns as unknown[]) ?? []).length}</span> · <Link className="link" to={`/admin/domains/${dom.id}`}>{t('فتح الدومين و DNS', 'Open the domain & DNS')}</Link></p></div>}
      {mails.length > 0 && (<><h2 className="sub">{t('الإيميلات', 'Mailboxes')}</h2><div className="linked">{mails.map((m) => <div key={m.id}><Ltr>{String(m.address)}</Ltr><span className="latin muted">{Number(m.usedGb)} / {Number(m.quotaGb)} GB</span></div>)}</div></>)}

      <h2 className="sub">{t('تعديل وربط', 'Edit & link')}</h2>
      <form className="card admin-form" onSubmit={save}>
        <div className="field"><label htmlFor="sd-uid">{t('العميل', 'Client')}</label><select id="sd-uid" className="select" value={uid} onChange={(e) => setForm({ ...form, uid: e.target.value, domainId: '', hostingId: '' })}>{all.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
        <div className="field"><label htmlFor="sd-name">{t('اسم الموقع', 'Site name')}</label><input id="sd-name" className="input latin" required value={String(form.name ?? '')} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label htmlFor="sd-url">{t('الرابط', 'URL')}</label><input id="sd-url" className="input latin" value={String(form.url ?? '')} onChange={(e) => set('url', e.target.value)} /></div>
        <div className="field"><label htmlFor="sd-st">{t('الحالة', 'Status')}</label><select id="sd-st" className="select" value={String(form.status)} onChange={(e) => set('status', e.target.value)}>{STATUS.filter((s) => s[0] !== 'expiring').map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></div>
        <div className="field"><label htmlFor="sd-dom">{t('الدومين المرتبط', 'Linked domain')}</label><select id="sd-dom" className="select" value={String(form.domainId ?? '')} onChange={(e) => set('domainId', e.target.value)}><option value="">{t('بدون', 'None')}</option>{domains.map((x) => <option key={x.id} value={x.id}>{String(x.name)}</option>)}</select></div>
        <div className="field"><label htmlFor="sd-host">{t('الاستضافة المرتبطة', 'Linked hosting')}</label><select id="sd-host" className="select" value={String(form.hostingId ?? '')} onChange={(e) => set('hostingId', e.target.value)}><option value="">{t('بدون', 'None')}</option>{hostings.map((x) => <option key={x.id} value={x.id}>{String(x.plan)}{x.domain ? ` · ${x.domain}` : ''}</option>)}</select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="sd-nt">{t('ملاحظات', 'Notes')}</label><input id="sd-nt" className="input" value={String(form.notes ?? '')} onChange={(e) => set('notes', e.target.value)} /></div>
        <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
      </form>
    </Page>
  );
}

/* ───────── One hosting plan: size, details and the websites on it ───────── */
export function AdminHostingDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [link, setLink] = useState('');
  const h = all?.items.hosting.find((x) => x.id === id);
  useEffect(() => { if (h) setForm({ ...h }); }, [h]);
  if (!all || !h || !form) return <Page title={t('الاستضافة', 'Hosting')}><Notice err={error} ok="" /><Link to="/admin/hosting" className="btn btn-ghost btn-sm">{t('← الاستضافة', '← Hosting')}</Link></Page>;
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  const sites = all.items.websites.filter((w) => w.hostingId === h.id);
  const free = all.items.websites.filter((w) => w.uid === h.uid && w.hostingId !== h.id);
  const doms = all.items.domains.filter((d) => sites.some((w) => w.domainId === d.id) || under(h.domain, d.name));
  const used = usage(h);
  const cost = Number(form.cost), price = Number(form.price);
  const margin = cost > 0 && price > 0 ? Math.round(((price - cost) / cost) * 100) : null;
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); } catch (x) { setErr(errText(x, t)); } };
  return (
    <Page title={String(h.plan)} action={<Link to="/admin/hosting" className="btn btn-ghost btn-sm">{t('← الاستضافة', '← Hosting')}</Link>}>
      <Notice err={err} ok={ok} />
      <div className="card"><dl className="kv">
        <div><dt>{t('العميل', 'Client')}</dt><dd><ClientLine users={all.users} uid={h.uid} /></dd></div>
        <div><dt>{t('الحالة', 'Status')}</dt><dd><StatusTag s={h.status as 'active'} /></dd></div>
        <div><dt>{t('الدومين', 'Domain')}</dt><dd><Ltr>{String(h.domain || '-')}</Ltr></dd></div>
        <div><dt>{t('المزوّد', 'Provider')}</dt><dd>{String(h.provider || '-')}</dd></div>
        <div><dt>{t('التكلفة / البيع', 'Cost / price')}</dt><dd className="latin">{Number(h.cost) || 0} → {Number(h.price) || 0} {cur}{h.billing ? ` / ${h.billing === 'yearly' ? 'yr' : 'mo'}` : ''}</dd></div>
        <div><dt>{t('التجديد', 'Renews')}</dt><dd><Ltr>{String(h.expires || '-')}</Ltr></dd></div>
      </dl>
        <h3 style={{ marginTop: 18 }}>{t('الحجم', 'Disk usage')}</h3>
        <p className="muted latin">{gb(h.usedGb)} / {gb(h.diskGb)} · {Math.round(used)}%</p>
        <Meter value={used} tone={used > 85 ? 'warn' : undefined} />
      </div>

      <h2 className="sub">{t('المواقع على الاستضافة دي', 'Websites on this hosting')}</h2>
      <div className="linked">
        {sites.map((w) => <div key={w.id}><Link className="link" to={`/admin/websites/${w.id}`}><Ltr>{String(w.name)}</Ltr></Link><span><StatusTag s={w.status as 'active'} /> <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/item-save', { item: { ...w, hostingId: '' } }, { res: 'websites' }), t('اتفكّ الربط.', 'Unlinked.'))}>{t('فك الربط', 'Unlink')}</button></span></div>)}
        {sites.length === 0 && <p className="muted">{t('مفيش مواقع مربوطة.', 'No websites linked.')}</p>}
      </div>
      {free.length > 0 && (
        <div className="inline-form" style={{ gridTemplateColumns: '1fr auto', marginTop: 12 }}>
          <div className="field"><label htmlFor="hl">{t('اربط موقع للعميل ده بالاستضافة', 'Link one of this client’s websites')}</label><select id="hl" className="select" value={link} onChange={(e) => setLink(e.target.value)}><option value="">…</option>{free.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</select></div>
          <button className="btn btn-primary" disabled={!link} onClick={() => { const w = free.find((x) => x.id === link)!; void run(() => post('admin/item-save', { item: { ...w, hostingId: h.id } }, { res: 'websites' }), t('اتربط.', 'Linked.')).then(() => setLink('')); }}>{t('ربط', 'Link')}</button>
        </div>
      )}
      {doms.length > 0 && (<><h2 className="sub">{t('الدومينات', 'Domains')}</h2><div className="linked">{doms.map((d) => <div key={d.id}><Link className="link" to={`/admin/domains/${d.id}`}><Ltr>{String(d.name)}</Ltr></Link><StatusTag s={d.status as 'active'} /></div>)}</div></>)}

      <h2 className="sub">{t('تعديل', 'Edit')}</h2>
      <form className="card admin-form" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/item-save', { item: form }, { res: 'hosting' }), t('اتحفظ.', 'Saved.')); }}>
        <div className="field"><label htmlFor="hd-uid">{t('العميل', 'Client')}</label><select id="hd-uid" className="select" value={String(form.uid)} onChange={(e) => set('uid', e.target.value)}>{all.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
        <div className="field"><label htmlFor="hd-plan">{t('الخطة', 'Plan')}</label><input id="hd-plan" className="input" required value={String(form.plan ?? '')} onChange={(e) => set('plan', e.target.value)} /></div>
        <div className="field"><label htmlFor="hd-dom">{t('الدومين', 'Domain')}</label><input id="hd-dom" className="input latin" value={String(form.domain ?? '')} onChange={(e) => set('domain', e.target.value)} /></div>
        <div className="field"><label htmlFor="hd-st">{t('الحالة', 'Status')}</label><select id="hd-st" className="select" value={String(form.status)} onChange={(e) => set('status', e.target.value)}>{STATUS.filter((s) => s[0] !== 'expiring').map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></div>
        <div className="field"><label htmlFor="hd-disk">{t('المساحة (GB)', 'Disk (GB)')}</label><input id="hd-disk" className="input latin" type="number" min={0} step="any" value={String(form.diskGb ?? '')} onChange={(e) => set('diskGb', e.target.value === '' ? '' : Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="hd-used">{t('المستخدم (GB)', 'Used (GB)')}</label><input id="hd-used" className="input latin" type="number" min={0} step="any" value={String(form.usedGb ?? '')} onChange={(e) => set('usedGb', e.target.value === '' ? '' : Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="hd-pv">{t('المزوّد', 'Provider')}</label><select id="hd-pv" className="select" value={String(form.provider ?? '')} onChange={(e) => set('provider', e.target.value)}><option value="">{t('بدون', 'None')}</option>{PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="field"><label htmlFor="hd-bl">{t('دورة الدفع للمزوّد', 'Provider billing')}</label><select id="hd-bl" className="select" value={String(form.billing || 'monthly')} onChange={(e) => set('billing', e.target.value)}><option value="monthly">{t('شهري', 'Monthly')}</option><option value="yearly">{t('سنوي', 'Yearly')}</option></select></div>
        <div className="field"><label htmlFor="hd-co">{t('تكلفتك', 'Your cost')} · {cur}</label><input id="hd-co" className="input latin" type="number" min={0} step="any" value={String(form.cost ?? '')} onChange={(e) => set('cost', e.target.value === '' ? '' : Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="hd-pr">{t('سعر العميل', 'Client price')} · {cur}{margin !== null ? ` · ${margin}%` : ''}</label><input id="hd-pr" className="input latin" type="number" min={0} step="any" value={String(form.price ?? '')} onChange={(e) => set('price', e.target.value === '' ? '' : Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="hd-ex">{t('التجديد القادم', 'Next renewal')}</label><input id="hd-ex" className="input" type="date" value={String(form.expires ?? '')} onChange={(e) => set('expires', e.target.value)} /></div>
        <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
      </form>
    </Page>
  );
}

/* ───────── One client: the whole account, and anything can be linked to them ───────── */
const SECTIONS: { res: string; ar: string; en: string; to: string; label: (it: Item) => string }[] = [
  { res: 'domains', ar: 'الدومينات', en: 'Domains', to: '/admin/domains', label: (it) => String(it.name) },
  { res: 'hosting', ar: 'الاستضافة', en: 'Hosting', to: '/admin/hosting', label: (it) => `${it.plan}${it.domain ? ` · ${it.domain}` : ''}` },
  { res: 'websites', ar: 'المواقع', en: 'Websites', to: '/admin/websites', label: (it) => String(it.name) },
  { res: 'mailboxes', ar: 'الإيميلات', en: 'Mailboxes', to: '/admin/email', label: (it) => String(it.address) },
  { res: 'servers', ar: 'السيرفرات', en: 'Servers', to: '/admin/servers', label: (it) => `${it.name}${it.ip ? ` · ${it.ip}` : ''}` },
  { res: 'invoices', ar: 'الفواتير', en: 'Invoices', to: '/admin/invoices', label: (it) => `${it.number ?? ''} ${it.item}` },
];
const itemPath = (res: string, it: Item) => (res === 'domains' ? `/admin/domains/${it.id}` : res === 'hosting' ? `/admin/hosting/${it.id}` : res === 'websites' ? `/admin/websites/${it.id}` : null);

export function AdminUserDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const u = all?.users.find((x) => x.id === id);
  if (!all || !u) return <Page title={t('العميل', 'Client')}><Notice err={error} ok="" /><Link to="/admin/users" className="btn btn-ghost btn-sm">{t('← المستخدمين', '← Users')}</Link></Page>;
  const owner = (uid: string) => all.users.find((x) => x.id === uid)?.name ?? '-';
  const mine = (res: string) => all.items[res].filter((x) => x.uid === u.id);
  const move = async (res: string, itemId: string) => {
    const it = all.items[res].find((x) => x.id === itemId);
    if (!it) return;
    setErr(''); setOk('');
    try { await post('admin/item-save', { item: { ...it, uid: u.id } }, { res }); setOk(t('اتربط بالعميل.', 'Linked to the client.')); setPick({ ...pick, [res]: '' }); load(); } catch (x) { setErr(errText(x, t)); }
  };
  const tickets = all.tickets.filter((x) => x.uid === u.id);
  const dueTotal = mine('invoices').filter((i) => i.status === 'due').reduce((s, i) => s + Number(i.amount), 0);
  return (
    <Page title={u.name} action={<Link to="/admin/users" className="btn btn-ghost btn-sm">{t('← المستخدمين', '← Users')}</Link>}>
      <Notice err={err || error} ok={ok} />
      <div className="card"><dl className="kv">
        <div><dt>{t('الاسم', 'Name')}</dt><dd>{u.name}</dd></div>
        <div><dt>{t('الإيميل', 'Email')}</dt><dd><Ltr>{u.email}</Ltr></dd></div>
        <div><dt>{t('النوع', 'Role')}</dt><dd><span className={`tag ${u.role === 'admin' ? 'dark' : ''}`}>{u.role === 'admin' ? t('أدمن', 'Admin') : t('عميل', 'Client')}</span></dd></div>
        <div><dt>{t('تاريخ الإنشاء', 'Created')}</dt><dd><Ltr>{day(String(u.created ?? ''))}</Ltr></dd></div>
        <div><dt>{t('فواتير مستحقة', 'Invoices due')}</dt><dd className="latin">{dueTotal} {cur}</dd></div>
        <div><dt>{t('تذاكر', 'Tickets')}</dt><dd className="latin">{tickets.length}</dd></div>
      </dl></div>

      {SECTIONS.map((sec) => {
        const own = mine(sec.res);
        const others = all.items[sec.res].filter((x) => x.uid !== u.id);
        return (
          <section key={sec.res}>
            <h2 className="sub">{t(sec.ar, sec.en)} <span className="tag latin">{own.length}</span></h2>
            <div className="linked">
              {own.map((it) => {
                const path = itemPath(sec.res, it);
                return <div key={it.id}>{path ? <Link className="link" to={path}>{sec.label(it)}</Link> : <span>{sec.label(it)}</span>}{it.status ? <StatusTag s={it.status as 'active'} /> : null}</div>;
              })}
              {own.length === 0 && <p className="muted">{t('مفيش.', 'None.')}</p>}
            </div>
            <div className="inline-form" style={{ gridTemplateColumns: '1fr auto auto', marginTop: 8, marginBottom: 8 }}>
              <div className="field"><label htmlFor={`lk-${sec.res}`}>{t('ربط عنصر موجود بالعميل', 'Link an existing item to this client')}</label>
                <select id={`lk-${sec.res}`} className="select" value={pick[sec.res] ?? ''} onChange={(e) => setPick({ ...pick, [sec.res]: e.target.value })}><option value="">…</option>{others.map((x) => <option key={x.id} value={x.id}>{sec.label(x)} — {owner(x.uid)}</option>)}</select></div>
              <button className="btn btn-primary btn-sm" disabled={!pick[sec.res]} onClick={() => void move(sec.res, pick[sec.res])}>{t('ربط', 'Link')}</button>
              <Link className="btn btn-ghost btn-sm" to={sec.to}>{t('+ جديد', '+ New')}</Link>
            </div>
          </section>
        );
      })}

      <h2 className="sub">{t('تذاكر الدعم', 'Support tickets')} <span className="tag latin">{tickets.length}</span></h2>
      <div className="linked">
        {tickets.map((x) => <div key={x.id}><Link className="link" to="/admin/tickets">{x.subject}</Link><span className="tag">{x.status}</span></div>)}
        {tickets.length === 0 && <p className="muted">{t('مفيش.', 'None.')}</p>}
      </div>
    </Page>
  );
}
