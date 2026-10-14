import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { api, post, type User } from '../lib/api';
import type { Business, Settings } from '../lib/types';
import { assetUrl, useCurrency } from '../site/settings';
import { day, Modal, Page, Table } from '../ui';
import { errText } from './errors';
import { useAll } from './kit';

type Field = { key: string; label: string; secret: boolean; value: string; set: boolean };
type Provider = { id: string; name: string; caps: string[]; help: [string, string]; fields: Field[]; sandbox: boolean; useSandbox: boolean; baseUrl: string; connected: boolean; test: { ok: boolean; message: string; at: string } | null };
type PDomain = { name: string; expires: string; status: string; autoRenew: boolean; imported: boolean };
type PHost = { ref: string; kind: string; plan: string; domain: string; status: string; expires: string; cost: number; billing: 'monthly' | 'yearly'; currency: string; costStore: number; imported: boolean };

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US');

function Notice({ err, ok }: { err: string; ok: string }) {
  return <>{err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}</>;
}

/* ───────── Apps: connect Hostinger / Namecheap / ResellerClub, then pull their domains, hosting and websites ───────── */
type Tab = 'connect' | 'domains' | 'hosting' | 'websites';

export function AdminApps() {
  const { t } = useI18n();
  const [list, setList] = useState<Provider[]>([]);
  const [open, setOpen] = useState<{ id: string; tab: Tab } | null>(null);
  const [mail, setMail] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => { api<{ providers: Provider[] }>('admin/providers').then((r) => setList(r.providers)).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const capLabel = (c: string) => ({ domains: t('الدومينات', 'Domains'), tlds: t('أسعار الامتدادات', 'TLD prices'), check: t('البحث', 'Search'), hosting: t('الاستضافة', 'Hosting'), dns: 'DNS', dnsread: t('DNS (قراءة)', 'DNS (read)') } as Record<string, string>)[c] ?? c;
  const current = list.find((p) => p.id === open?.id);
  return (
    <Page title={t('التطبيقات', 'Apps')}>
      <p className="muted">{t('اربط حساباتك عند مزوّدي الدومينات والاستضافة. المفاتيح بتتحفظ على السيرفر ومش بتظهر تاني.', 'Connect your accounts at the domain and hosting providers. Keys are stored on the server and never shown again.')}</p>
      <Notice err={err} ok={ok} />
      <div className="app-grid">
        {list.map((p) => (
          <button type="button" className="app-tile-card" key={p.id} onClick={() => setOpen({ id: p.id, tab: 'connect' })} aria-label={`${p.name} — ${t('عرض التفاصيل', 'View details')}`}>
            <span className="app-tile-head">
              <span className={`app-tile ${p.id}`}>{p.name.slice(0, 1)}</span>
              <span className={`tag ${p.connected ? (p.test && !p.test.ok ? 'bad' : 'ok') : ''}`}>{p.connected ? (p.test ? (p.test.ok ? t('متصل', 'Connected') : t('فيه مشكلة', 'Problem')) : t('محفوظ', 'Saved')) : t('غير متصل', 'Not connected')}</span>
            </span>
            <b className="app-tile-name">{p.name}</b>
            <span className="muted">{t('من', 'By')} {p.name}</span>
            <span className="app-tile-desc">{p.caps.map(capLabel).join(' · ')}</span>
            {p.test && !p.test.ok && <span className="form-error">{p.test.message}</span>}
            <span className="app-tile-more">{t('عرض التفاصيل', 'View details')}</span>
          </button>
        ))}
        <button type="button" className="app-tile-card" onClick={() => setMail(true)} aria-label={`Hostinger Email — ${t('عرض التفاصيل', 'View details')}`}>
          <span className="app-tile-head"><span className="app-tile hostinger">✉</span><span className="tag ok">{t('مدمج', 'Built in')}</span></span>
          <b className="app-tile-name">Hostinger Email</b>
          <span className="muted">{t('من نوتش كلاود', 'By Notch Cloud')}</span>
          <span className="app-tile-desc">{t('اربط دومينات العملاء بإيميل Hostinger: بنضيف سجلات MX وSPF تلقائيًا.', 'Connect clients’ domains to Hostinger Email: the MX and SPF records are added for you.')}</span>
          <span className="app-tile-more">{t('عرض التفاصيل', 'View details')}</span>
        </button>
        {[
          { to: '/admin/pricing', ar: 'أسعار الدومينات', en: 'TLD pricing', d: t('اختار الامتدادات اللي هتبيعها وحدد نسبة المكسب.', 'Choose the extensions you sell and set your margin.'), k: 'T' },
          { to: '/admin/plans', ar: 'الباقات والأسعار', en: 'Plans', d: t('أسعار الاستضافة والإيميلات والمواقع اللي بتظهر في الموقع.', 'The hosting, email and website prices shown on the website.'), k: 'P' },
          { to: '/admin/purchases', ar: 'فواتير الشراء', en: 'Purchases', d: t('اللي مستحق للمزوّدين وتكلفتك الشهرية والسنوية.', 'What you owe the providers and your monthly and yearly cost.'), k: 'B' },
          { to: '/admin/updates', ar: 'التحديثات', en: 'Updates', d: t('ارفع ملف تحديث وشوف التغييرات والنسخ الاحتياطية.', 'Upload an update file; see the changes and backups.'), k: 'U' },
        ].map((a) => (
          <Link key={a.to} to={a.to} className="app-tile-card">
            <span className="app-tile-head"><span className="app-tile builtin">{a.k}</span><span className="tag ok">{t('مدمج', 'Built in')}</span></span>
            <b className="app-tile-name">{t(a.ar, a.en)}</b>
            <span className="muted">{t('من نوتش كلاود', 'By Notch Cloud')}</span>
            <span className="app-tile-desc">{a.d}</span>
            <span className="app-tile-more">{t('فتح', 'Open')}</span>
          </Link>
        ))}
      </div>
      {mail && <HostingerEmail onClose={() => setMail(false)} />}
      {open && current && (
        <Modal title={current.name} wide onClose={() => setOpen(null)}>
          <div className="tabs" role="tablist">
            {([['connect', t('الربط', 'Connection')], ...(current.connected ? [['domains', t('الدومينات', 'Domains')], ...(current.caps.includes('hosting') ? [['hosting', t('الاستضافات', 'Hosting')], ['websites', t('المواقع', 'Websites')]] : [])] : [])] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={open.tab === k} className={open.tab === k ? 'on' : ''} onClick={() => setOpen({ id: open.id, tab: k })}>{label}</button>
            ))}
          </div>
          <Notice err={err} ok="" />
          {open.tab === 'connect'
            ? <ConnectForm key={current.id} p={current} onChange={(msg) => { setOk(msg); setErr(''); load(); }} onError={setErr} onGone={() => setOpen(null)} />
            : <ImportPanel key={`${current.id}-${open.tab}`} p={current} kind={open.tab} onDone={(m) => { setOk(m); setOpen(null); }} onError={setErr} />}
        </Modal>
      )}
    </Page>
  );
}

function ConnectForm({ p, onChange, onError, onGone }: { p: Provider; onChange: (msg: string) => void; onError: (e: string) => void; onGone: () => void }) {
  const { t } = useI18n();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.map((f) => [f.key, f.value])));
  const [sandbox, setSandbox] = useState(p.useSandbox);
  const [base, setBase] = useState(p.baseUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<string | void>, after?: () => void) => {
    onError(''); setMsg(''); setBusy(true);
    try { const m = await fn(); setMsg(m || t('تم.', 'Done.')); onChange(m || ''); after?.(); } catch (e) { onError(errText(e, t)); } finally { setBusy(false); }
  };
  const save = (e: FormEvent) => { e.preventDefault(); void run(async () => { await post('admin/providers', { id: p.id, fields: vals, useSandbox: sandbox, baseUrl: base }); return t('اتحفظ. جرّب اختبار الاتصال.', 'Saved. Now test the connection.'); }); };
  const test = () => void run(async () => { const r = await post<{ ok: boolean; message: string }>('admin/providers/test', { id: p.id }); if (!r.ok) throw new Error(r.message); return r.message; });
  const disconnect = () => { if (window.confirm(t('تفصل الربط وتمسح المفاتيح؟', 'Disconnect and delete the saved keys?'))) void run(async () => { await post('admin/providers', { id: p.id, disconnect: true }); return t('اتفصل.', 'Disconnected.'); }, onGone); };
  return (
    <>
      <p className="muted">{t(p.help[0], p.help[1])}</p>
      {msg && <div className="form-ok" role="status">{msg}</div>}
      <form className="admin-form" onSubmit={save} style={{ marginBlock: 0 }}>
        {p.fields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`${p.id}-${f.key}`}>{f.label}</label>
            <input id={`${p.id}-${f.key}`} className="input latin" type={f.secret ? 'password' : 'text'} autoComplete="off" value={vals[f.key] ?? ''} placeholder={f.secret && f.set ? '••••••••  (saved)' : ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
          </div>
        ))}
        {p.sandbox && <label className="check"><input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} /> {t('وضع التجربة (Sandbox)', 'Sandbox / test mode')}</label>}
        <details style={{ gridColumn: '1 / -1' }}><summary className="muted">{t('متقدم', 'Advanced')}</summary>
          <div className="field"><label htmlFor={`${p.id}-base`}>{t('عنوان الـ API (اختياري)', 'API address (optional)')}</label><input id={`${p.id}-base`} className="input latin" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://…" /></div></details>
        <div className="admin-form-actions row-actions">
          <button className="btn btn-accent btn-sm" type="submit" disabled={busy}>{t('حفظ', 'Save')}</button>
          {p.connected && <button className="btn btn-ghost btn-sm" type="button" onClick={test} disabled={busy}>{t('اختبار الاتصال', 'Test connection')}</button>}
          {p.connected && <button className="btn btn-ghost btn-sm" type="button" onClick={disconnect} disabled={busy}>{t('فصل', 'Disconnect')}</button>}
        </div>
      </form>
    </>
  );
}

function ImportPanel({ p, kind, onDone, onError }: { p: Provider; kind: 'domains' | 'hosting' | 'websites'; onDone: (m: string) => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const cur = useCurrency();
  const [users, setUsers] = useState<User[]>([]);
  const [uid, setUid] = useState('');
  const [rows, setRows] = useState<(PDomain | PHost)[] | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const [bills, setBills] = useState(kind !== 'websites');
  const [busy, setBusy] = useState(false);
  const key = (r: PDomain | PHost) => ('ref' in r ? r.ref : r.name);
  useEffect(() => {
    setRows(null);
    api<{ users: User[] }>('admin/users').then((r) => { setUsers(r.users); setUid((u) => u || r.users.find((x) => x.role === 'client')?.id || r.users[0]?.id || ''); }).catch(() => undefined);
    const src = kind === 'domains' ? 'domains' : 'hosting';
    api<Record<string, (PDomain | PHost)[]>>(`admin/providers/${src}`, undefined, { id: p.id })
      .then((r) => setRows(kind === 'domains' ? r.domains : (r.hosting as PHost[]).filter((h) => (kind === 'websites') === (h.kind === 'website'))))
      .catch((e) => { onError(errText(e, t)); setRows([]); });
  }, [p.id, kind, onError, t]);
  const free = useMemo(() => (rows ?? []).filter((r) => !r.imported), [rows]);
  const chosen = useMemo(() => free.filter((r) => pick[key(r)]), [free, pick]);
  const all = free.length > 0 && chosen.length === free.length;
  const go = async () => {
    setBusy(true); onError('');
    try {
      const items = chosen.map((r) => ({ ...r, uid: own[key(r)] || uid }));
      const r = await post<{ imported: number }>('admin/providers/import', { id: p.id, kind, uid, bills: bills && kind !== 'websites', items });
      onDone(t(`اتجلب ${r.imported}.`, `Imported ${r.imported}.`));
    } catch (e) { onError(errText(e, t)); } finally { setBusy(false); }
  };
  if (rows === null) return <p className="muted">…</p>;
  if (rows.length === 0) return <p className="muted">{t('مفيش عناصر عند المزوّد.', 'Nothing found at the provider.')}</p>;
  return (
    <>
      <div className="inline-form" style={{ gridTemplateColumns: '1fr auto', marginBottom: 0 }}>
        <div className="field"><label htmlFor="imp-uid">{t('العميل الافتراضي', 'Default client')}</label>
          <select id="imp-uid" className="select" value={uid} onChange={(e) => setUid(e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
        {kind !== 'websites' && <label className="check"><input type="checkbox" checked={bills} onChange={(e) => setBills(e.target.checked)} /> {t('إصدار فواتير شراء', 'Create purchase bills')}</label>}
      </div>
      <Table head={[kind === 'domains' ? t('الدومين', 'Domain') : kind === 'websites' ? t('الموقع', 'Website') : t('الخطة', 'Plan'), t('ينتهي', 'Expires'), ...(kind === 'hosting' ? [t('التكلفة', 'Cost')] : []), t('العميل', 'Client')]}>
        {rows.map((r) => (
          <tr key={key(r)}>
            <td>
              <label className="check"><input type="checkbox" disabled={r.imported} checked={r.imported || !!pick[key(r)]} onChange={(e) => setPick({ ...pick, [key(r)]: e.target.checked })} />
                {'ref' in r ? (kind === 'websites' ? <Ltr>{r.domain}</Ltr> : r.plan) : <Ltr>{r.name}</Ltr>} {r.imported && <span className="tag">{t('موجود', 'Imported')}</span>}</label>
            </td>
            <td><Ltr>{r.expires || '-'}</Ltr></td>
            {kind === 'hosting' && 'ref' in r && <td><span className="latin">{money(r.costStore)} {cur}</span> <span className="muted">/ {r.billing === 'yearly' ? t('سنة', 'yr') : t('شهر', 'mo')}</span></td>}
            <td>{r.imported ? '-' : <select className="select" aria-label={t('العميل', 'Client')} value={own[key(r)] ?? ''} onChange={(e) => setOwn({ ...own, [key(r)]: e.target.value })}><option value="">{t('الافتراضي', 'Default')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}</td>
          </tr>
        ))}
      </Table>
      <div className="row-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setPick(all ? {} : Object.fromEntries(free.map((r) => [key(r), true])))}>{all ? t('إلغاء التحديد', 'Clear selection') : t('تحديد الكل', 'Select all')}</button>
        <button className="btn btn-accent" onClick={() => void go()} disabled={busy || chosen.length === 0 || !uid}>{t(`جلب (${chosen.length})`, `Import (${chosen.length})`)}</button>
      </div>
    </>
  );
}

/** Apps → Hostinger Email: one switch per domain. Connecting adds the MX and SPF records Hostinger needs. */
function HostingerEmail({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { all, error, load } = useAll();
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const domains = all?.items.domains ?? [];
  const owner = (uid: string) => all?.users.find((u) => u.id === uid)?.name ?? '-';
  const chosen = domains.filter((d) => pick[d.id]);
  const connect = async (list: typeof domains) => {
    setErr(''); setMsg(''); setBusy(true);
    let added = 0; const warnings: string[] = [];
    try {
      for (const d of list) { const r = await post<{ added: number; warning?: string }>('admin/domain-mail', { id: d.id }); added += r.added; if (r.warning) warnings.push(`${d.name}: ${r.warning}`); }
      setMsg(t(`تم ربط ${list.length} دومين (${added} سجل جديد).`, `Connected ${list.length} domain(s) (${added} new records).`)); setPick({}); load();
      if (warnings.length) setErr(warnings.join(' · '));
    } catch (e) { setErr(errText(e, t)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Hostinger Email" wide onClose={onClose}>
      <p className="muted">{t('لكل دومين: الربط بيضيف سجلات MX (mx1/mx2.hostinger.com) وSPF. لو الدومين متزامن مع المزوّد بيتبعتوا له تلقائيًا. الصناديق نفسها بتتدار من لوحة Hostinger.', 'For each domain: connecting adds the MX records (mx1/mx2.hostinger.com) and SPF. If the domain is synced with its provider they are sent there automatically. The mailboxes themselves are managed in Hostinger.')}</p>
      {(err || error) && <div className="form-error" role="alert">{err || error}</div>}
      {msg && <div className="form-ok" role="status">{msg}</div>}
      <Table head={['', t('الدومين', 'Domain'), t('العميل', 'Client'), t('الإيميل', 'Email'), '']} empty={all && domains.length === 0 ? t('مفيش دومينات.', 'No domains.') : undefined}>
        {domains.map((d) => (
          <tr key={d.id}>
            <td><input type="checkbox" aria-label={String(d.name)} checked={!!pick[d.id]} onChange={(e) => setPick({ ...pick, [d.id]: e.target.checked })} /></td>
            <td><Ltr>{String(d.name)}</Ltr></td><td>{owner(d.uid)}</td>
            <td><span className={`tag ${d.mail === 'hostinger' ? 'ok' : ''}`}>{d.mail === 'hostinger' ? t('متصل', 'Connected') : t('غير متصل', 'Not connected')}</span></td>
            <td><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void connect([d])}>{d.mail === 'hostinger' ? t('إعادة ضبط', 'Re-apply') : t('ربط', 'Connect')}</button></td>
          </tr>
        ))}
      </Table>
      <div className="row-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setPick(Object.fromEntries(domains.filter((d) => d.mail !== 'hostinger').map((d) => [d.id, true])))}>{t('تحديد غير المتصلة', 'Select not connected')}</button>
        <button className="btn btn-accent" disabled={busy || chosen.length === 0} onClick={() => void connect(chosen)}>{busy ? '…' : t(`ربط (${chosen.length})`, `Connect (${chosen.length})`)}</button>
        <a className="btn btn-ghost btn-sm" href="https://mail.hostinger.com" target="_blank" rel="noreferrer">Webmail</a>
      </div>
    </Modal>
  );
}

/* ───────── TLD prices, margin and search ───────── */
type Offer = { provider: string; currency: string; register: number; renew: number; costStore: number; renewStore: number };
type Tld = { tld: string; offers: Offer[]; best: string; cost: number; renewCost: number; marginPct: number; custom: boolean; fixedProfit: number | null; selected: boolean; sell: number; renewSell: number; profit: number; currency: string };
type PricingResp = { pricing: { marginPct: number; rounding: number; rates: Record<string, number>; tldMargins: Record<string, number>; tldProfits: Record<string, number>; selected: string[] }; currency: string; fetchedAt: string; errors: Record<string, string>; tlds: Tld[] };
type Hit = { domain: string; tld: string; available: boolean; sell: number; renewSell: number; currency: string; provider: string; cost: number; profit: number; marginPct: number };

/** Extensions are only offered to clients when you choose them here; the provider catalogs are just a list to pick from. */
export function AdminPricing() {
  const { t } = useI18n();
  const [d, setD] = useState<PricingResp | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [only, setOnly] = useState(false);
  const [limit, setLimit] = useState(60);
  const [margin, setMargin] = useState('30');
  const [rounding, setRounding] = useState('5');
  const [usd, setUsd] = useState('50');
  const [eur, setEur] = useState('55');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState<Record<string, string>>({});
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchErr, setSearchErr] = useState<Record<string, string>>({});
  const apply = (r: PricingResp) => {
    setD(r); setMargin(String(r.pricing.marginPct)); setRounding(String(r.pricing.rounding)); setUsd(String(r.pricing.rates.USD ?? 50)); setEur(String(r.pricing.rates.EUR ?? 55));
    setSel(new Set(r.pricing.selected));
    setPct(Object.fromEntries(Object.entries(r.pricing.tldMargins).map(([k, v]) => [k, String(v)])));
    setFixed(Object.fromEntries(Object.entries(r.pricing.tldProfits).map(([k, v]) => [k, String(v)])));
  };
  const load = useCallback((refresh = false) => {
    setBusy(true); setErr('');
    api<PricingResp>('admin/pricing', undefined, refresh ? { refresh: '1' } : undefined).then(apply).catch((e) => setErr(errText(e, t))).finally(() => setBusy(false));
  }, [t]);
  useEffect(() => load(), [load]);
  const dirty = useMemo(() => {
    if (!d) return false;
    const same = (a: Record<string, number>, b: Record<string, string>) => { const ak = Object.keys(a).sort(), bk = Object.keys(b).filter((k) => b[k] !== '').sort(); return ak.length === bk.length && ak.every((k, i) => k === bk[i] && Number(b[k]) === a[k]); };
    const cur = [...d.pricing.selected].sort().join();
    return cur !== [...sel].sort().join() || !same(d.pricing.tldMargins, pct) || !same(d.pricing.tldProfits, fixed)
      || Number(margin) !== d.pricing.marginPct || Number(rounding) !== d.pricing.rounding || Number(usd) !== (d.pricing.rates.USD ?? 50) || Number(eur) !== (d.pricing.rates.EUR ?? 55);
  }, [d, sel, pct, fixed, margin, rounding, usd, eur]);
  const clean = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([k, v]) => v !== '' && Number.isFinite(Number(v)) && (sel.has(k) || d?.pricing.selected.includes(k))).map(([k, v]) => [k, Number(v)]));
  const save = async () => {
    setErr(''); setOk(''); setBusy(true);
    try { apply(await post<PricingResp>('admin/pricing', { marginPct: Number(margin), rounding: Number(rounding), rates: { USD: Number(usd), EUR: Number(eur) }, selected: [...sel], tldMargins: clean(pct), tldProfits: clean(fixed) })); setOk(t('اتحفظ.', 'Saved.')); }
    catch (e) { setErr(errText(e, t)); } finally { setBusy(false); }
  };
  const search = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setHits(null);
    try { const r = await api<{ results: Hit[]; errors: Record<string, string> }>('admin/pricing/search', undefined, { q }); setHits(r.results); setSearchErr(r.errors); } catch (x) { setErr(errText(x, t)); }
  };
  const f = filter.toLowerCase().replace(/^\./, '');
  const shown = (d?.tlds ?? []).filter((x) => (!f || x.tld.includes(f)) && (!only || sel.has(x.tld)));
  const page = shown.slice(0, limit);
  const cur = d?.currency ?? '';
  const toggle = (tld: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(tld); else n.delete(tld); return n; });
  // A live preview of the price for a row, using what is typed now (before saving).
  const preview = (x: Tld) => {
    const r = Number(rounding) || 0;
    const fx = fixed[x.tld] !== undefined && fixed[x.tld] !== '' ? Number(fixed[x.tld]) : null;
    const m = pct[x.tld] !== undefined && pct[x.tld] !== '' ? Number(pct[x.tld]) : Number(margin);
    const raw = fx !== null ? x.cost + fx : x.cost * (1 + m / 100);
    const sell = r > 0 ? Math.ceil(raw / r) * r : Math.round(raw * 100) / 100;
    return { sell, profit: sell - x.cost };
  };
  return (
    <Page title={t('أسعار الدومينات', 'TLD pricing')} action={<button className="btn btn-primary btn-sm" onClick={() => load(true)} disabled={busy}>{busy ? '…' : t('تحديث الأسعار من المزوّدين', 'Refresh provider prices')}</button>}>
      <Notice err={err} ok={ok} />
      {d && Object.entries(d.errors).map(([id, m]) => <div className="form-error" key={id}>{id}: {m}</div>)}
      {d && d.tlds.length === 0 && !busy && <div className="empty-note">{t('مفيش أسعار لسه. اربط Hostinger أو Namecheap أو ResellerClub من صفحة التطبيقات.', 'No prices yet. Connect Hostinger, Namecheap or ResellerClub in Apps.')}</div>}
      <div className="card inline-form" style={{ gridTemplateColumns: 'repeat(4, 1fr)', margin: '16px 0' }}>
        <div className="field"><label htmlFor="pm">{t('نسبة المكسب الافتراضية %', 'Default margin %')}</label><input id="pm" className="input latin" type="number" min={0} step="any" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
        <div className="field"><label htmlFor="pr">{t('تقريب السعر لأقرب', 'Round price up to')}</label><input id="pr" className="input latin" type="number" min={0} step="any" value={rounding} onChange={(e) => setRounding(e.target.value)} /></div>
        <div className="field"><label htmlFor="pu">1 USD = ? {cur}</label><input id="pu" className="input latin" type="number" min={0} step="any" value={usd} onChange={(e) => setUsd(e.target.value)} /></div>
        <div className="field"><label htmlFor="pe">1 EUR = ? {cur}</label><input id="pe" className="input latin" type="number" min={0} step="any" value={eur} onChange={(e) => setEur(e.target.value)} /></div>
      </div>

      <form className="card inline-form" style={{ gridTemplateColumns: '1fr auto', margin: '16px 0' }} onSubmit={search}>
        <div className="field"><label htmlFor="sq">{t('جرّب البحث (بيدوّر في الامتدادات اللي اخترتها بس، وبتشوف التكلفة والمكسب)', 'Try a search (only the extensions you chose, with your cost and profit)')}</label><input id="sq" className="input latin" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder="mybrand" /></div>
        <button className="btn btn-primary" type="submit">{t('ابحث', 'Search')}</button>
      </form>
      {hits && (
        <Table head={[t('الدومين', 'Domain'), t('الحالة', 'Status'), t('المزوّد', 'Provider'), t('التكلفة', 'Cost'), t('سعر البيع', 'Sell'), t('المكسب', 'Profit')]} empty={hits.length === 0 ? t('مفيش نتائج.', 'No results.') : undefined}>
          {hits.map((h) => (
            <tr key={h.domain}>
              <td><Ltr>{h.domain}</Ltr></td><td><span className={`tag ${h.available ? 'ok' : 'bad'}`}>{h.available ? t('متاح', 'Available') : t('محجوز', 'Taken')}</span></td>
              <td>{h.provider}</td><td className="latin">{money(h.cost)} {cur}</td><td className="latin"><b>{money(h.sell)}</b> {cur}</td><td className="latin">{money(h.profit)} {cur} · {h.marginPct}%</td>
            </tr>
          ))}
        </Table>
      )}
      {Object.entries(searchErr).map(([id, m]) => <div className="form-error" key={id}>{id}: {m}</div>)}

      {d && d.tlds.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h3>{t('اختار الامتدادات اللي هتبيعها', 'Choose the extensions you sell')} <span className="tag">{t(`${sel.size} مختار`, `${sel.size} selected`)}</span></h3>
            {sel.size === 0 && <div className="form-error" style={{ marginBottom: 8 }}>{t('لسه ما اخترتش امتدادات: البحث في الموقع شغّال حاليًا على الامتدادات الشائعة (com, net, org...) لحد ما تختار وتحفظ.', 'No extensions chosen yet: the website search uses the popular ones (com, net, org…) until you choose and save.')}</div>}
            <p className="muted">{t('الامتدادات اللي مش متعلّم عليها مش بتظهر للعملاء ومش بتتبحث. لكل امتداد تقدر تحط نسبة مكسب % أو مكسب ثابت بالجنيه (الثابت بيغلب النسبة).', 'Extensions you do not tick are never shown to clients or searched. For each one you can set a margin % or a fixed profit amount (the fixed amount wins).')}</p>
            <div className="row-actions" style={{ alignItems: 'center' }}>
              <input className="input latin" style={{ maxWidth: 200, height: 40 }} value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(60); }} placeholder={t('ابحث: .com', 'Filter: .com')} aria-label={t('فلتر الامتداد', 'Filter extension')} />
              <label className="check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> {t('المختارة بس', 'Selected only')}</label>
              <button className="btn btn-ghost btn-sm" onClick={() => setSel((s) => new Set([...s, ...shown.map((x) => x.tld)]))}>{t(`تحديد الظاهر (${shown.length})`, `Select shown (${shown.length})`)}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSel((s) => { const n = new Set(s); shown.forEach((x) => n.delete(x.tld)); return n; })}>{t('إلغاء تحديد الظاهر', 'Clear shown')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set(d.tlds.map((x) => x.tld)))}>{t(`تحديد الكل (${d.tlds.length})`, `Select all (${d.tlds.length})`)}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSel(new Set()); setPct({}); setFixed({}); }}>{t('مسح الكل وإعادة الاختيار', 'Clear all and start over')}</button>
              <button className="btn btn-accent" disabled={!dirty || busy} onClick={() => void save()}>{t('حفظ', 'Save')}</button>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>{t('آخر تحديث', 'Last refreshed')}: <Ltr>{day(d.fetchedAt)}</Ltr> · {t('الأسعار بعملة المتجر', 'Prices in store currency')}: {cur} · {t('بنختار أرخص مزوّد لكل امتداد.', 'The cheapest provider is used for each extension.')}</p>
          <Table head={[t('بيع', 'Sell'), t('الامتداد', 'Extension'), t('أرخص مزوّد', 'Cheapest'), t('التكلفة', 'Cost'), t('مكسب %', 'Margin %'), t('مكسب ثابت', 'Fixed profit'), t('سعر البيع (سنة)', 'Sell (1 yr)'), t('المكسب', 'Profit'), t('كل المزوّدين', 'All providers')]}>
            {page.map((x) => {
              const on = sel.has(x.tld);
              const pv = preview(x);
              return (
                <tr key={x.tld} style={on ? undefined : { opacity: .7 }}>
                  <td><input type="checkbox" checked={on} onChange={(e) => toggle(x.tld, e.target.checked)} aria-label={`.${x.tld}`} /></td>
                  <td><Ltr>.{x.tld}</Ltr></td><td>{x.best}</td><td className="latin">{money(x.cost)}</td>
                  <td><input className="input latin" style={{ width: 76, height: 36 }} type="number" min={0} step="any" disabled={!on || !!fixed[x.tld]} value={pct[x.tld] ?? ''} placeholder={margin} aria-label={`${x.tld} margin`} onChange={(e) => setPct({ ...pct, [x.tld]: e.target.value })} /></td>
                  <td><input className="input latin" style={{ width: 90, height: 36 }} type="number" min={0} step="any" disabled={!on} value={fixed[x.tld] ?? ''} placeholder="—" aria-label={`${x.tld} fixed profit`} onChange={(e) => setFixed({ ...fixed, [x.tld]: e.target.value })} /></td>
                  <td className="latin"><b>{money(pv.sell)}</b> {cur}</td><td className="latin">{money(pv.profit)} {cur}</td>
                  <td className="latin muted">{x.offers.map((o) => `${o.provider} ${money(o.costStore)}`).join(' · ')}</td>
                </tr>
              );
            })}
          </Table>
          {shown.length > page.length && <div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + 100)}>{t(`عرض المزيد (${shown.length - page.length})`, `Show more (${shown.length - page.length})`)}</button></div>}
        </>
      )}
    </Page>
  );
}

/* ───────── Purchases: what we owe the providers ───────── */
type Bill = { id: string; number: string; provider: string; ref: string; item: string; service: string; amount: number; period: 'monthly' | 'yearly' | 'once'; date: string; status: 'due' | 'paid' | 'void' };

export function AdminPurchases() {
  const { t } = useI18n();
  const cur = useCurrency();
  const [items, setItems] = useState<Bill[]>([]);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => { api<{ items: Bill[] }>('admin/items', undefined, { res: 'purchases' }).then((r) => setItems([...r.items].reverse())).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };
  const live = items.filter((b) => b.status !== 'void');
  const monthly = live.reduce((s, b) => s + (b.period === 'monthly' ? b.amount : b.period === 'yearly' ? b.amount / 12 : 0), 0);
  const due = items.filter((b) => b.status === 'due').reduce((s, b) => s + b.amount, 0);
  const providers = ['hostinger', 'namecheap', 'resellerclub'];
  return (
    <Page title={t('فواتير الشراء', 'Purchases')} action={<button className="btn btn-primary btn-sm" onClick={() => setForm(form ? null : { item: '', provider: 'hostinger', amount: 0, period: 'yearly', date: '', status: 'due' })}>{form ? t('إلغاء', 'Cancel') : t('+ فاتورة شراء', '+ Purchase bill')}</button>}>
      <Notice err={err} ok={ok} />
      <div className="app-grid" style={{ marginBottom: 16 }}>
        <div className="card"><span className="muted">{t('تكلفة شهرية (متوسط)', 'Monthly cost (average)')}</span><h3 className="latin">{money(monthly)} {cur}</h3></div>
        <div className="card"><span className="muted">{t('تكلفة سنوية', 'Yearly cost')}</span><h3 className="latin">{money(monthly * 12)} {cur}</h3></div>
        <div className="card"><span className="muted">{t('مستحق الدفع للمزوّدين', 'Due to providers')}</span><h3 className="latin">{money(due)} {cur}</h3></div>
      </div>
      {form && (
        <form className="card admin-form" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/item-save', { item: form }, { res: 'purchases' }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setForm(null); }); }}>
          <div className="field"><label htmlFor="b-item">{t('البند', 'Item')}</label><input id="b-item" className="input" required value={String(form.item ?? '')} onChange={(e) => setForm({ ...form, item: e.target.value })} /></div>
          <div className="field"><label htmlFor="b-prov">{t('المزوّد', 'Provider')}</label><select id="b-prov" className="select" value={String(form.provider)} onChange={(e) => setForm({ ...form, provider: e.target.value })}>{providers.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div className="field"><label htmlFor="b-amt">{t('المبلغ', 'Amount')} ({cur})</label><input id="b-amt" className="input latin" type="number" min={0} step="any" required value={String(form.amount ?? '')} onChange={(e) => setForm({ ...form, amount: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="b-per">{t('الدورة', 'Billing')}</label><select id="b-per" className="select" value={String(form.period)} onChange={(e) => setForm({ ...form, period: e.target.value })}><option value="yearly">{t('سنوي', 'Yearly')}</option><option value="monthly">{t('شهري', 'Monthly')}</option><option value="once">{t('مرة واحدة', 'One-off')}</option></select></div>
          <div className="field"><label htmlFor="b-date">{t('التاريخ', 'Date')}</label><input id="b-date" className="input" type="date" value={String(form.date ?? '')} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
        </form>
      )}
      <Table head={[t('الرقم', 'No.'), t('البند', 'Item'), t('المزوّد', 'Provider'), t('المبلغ', 'Amount'), t('الدورة', 'Billing'), t('التاريخ', 'Date'), t('الحالة', 'Status'), '']} empty={items.length === 0 ? t('مفيش فواتير شراء لسه. بتتعمل تلقائي لما تجلب استضافة أو دومين من التطبيقات.', 'No purchase bills yet. They are created when you import hosting or domains from Apps.') : undefined}>
        {items.map((b) => (
          <tr key={b.id}>
            <td><Link className="link" to={`/admin/purchases/${b.id}`}><Ltr>{b.number}</Ltr></Link></td><td>{b.item}</td><td>{b.provider}</td><td className="latin"><b>{money(b.amount)}</b> {cur}</td>
            <td>{b.period === 'monthly' ? t('شهري', 'Monthly') : b.period === 'yearly' ? t('سنوي', 'Yearly') : t('مرة', 'One-off')}</td><td><Ltr>{day(b.date)}</Ltr></td>
            <td><span className={`tag ${b.status === 'paid' ? 'ok' : b.status === 'void' ? '' : 'warn'}`}>{b.status === 'paid' ? t('مدفوعة', 'Paid') : b.status === 'void' ? t('ملغاة', 'Void') : t('مستحقة', 'Due')}</span></td>
            <td><div className="row-actions">
              {b.status === 'due' && <button className="btn btn-accent btn-sm" onClick={() => void run(() => post('admin/item-save', { item: { ...b, status: 'paid' } }, { res: 'purchases' }), t('تم الدفع.', 'Marked as paid.'))}>{t('تم الدفع', 'Mark paid')}</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف الفاتورة دي؟', 'Delete this bill?'))) void run(() => post('admin/item-delete', { id: b.id }, { res: 'purchases' }), t('اتحذفت.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>
            </div></td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}

/** A purchase bill as a printable sheet: Print → Save as PDF in the browser (Arabic prints correctly). */
export function AdminPurchaseDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const nav = useNavigate();
  const [bill, setBill] = useState<Bill | null>(null);
  const [set, setSet] = useState<(Settings & { business?: Business }) | null>(null);
  const [client, setClient] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => {
    api<{ items: Bill[] }>('admin/items', undefined, { res: 'purchases' }).then((r) => setBill(r.items.find((b) => b.id === id) ?? null)).catch((e) => setErr(errText(e, t)));
  }, [id, t]);
  useEffect(load, [load]);
  useEffect(() => { api<Settings & { business?: Business }>('admin/settings').then(setSet).catch(() => undefined); }, []);
  useEffect(() => {
    const uid = (bill as (Bill & { client?: string }) | null)?.client;
    if (!uid) { setClient(''); return; }
    api<{ users: User[] }>('admin/users').then((r) => { const u = r.users.find((x) => x.id === uid); setClient(u ? `${u.name} · ${u.email}` : ''); }).catch(() => undefined);
  }, [bill]);
  if (!bill) return <Page title={t('فاتورة شراء', 'Purchase bill')}>{err ? <div className="form-error">{err}</div> : <p className="muted">…</p>}<Link to="/admin/purchases" className="btn btn-ghost btn-sm">{t('← فواتير الشراء', '← Purchases')}</Link></Page>;
  const biz = set?.business ?? {};
  const logo = set?.brand?.logo;
  const per = bill.period === 'monthly' ? t('شهري', 'Monthly') : bill.period === 'yearly' ? t('سنوي', 'Yearly') : t('مرة واحدة', 'One-off');
  const status = bill.status === 'paid' ? t('مدفوعة', 'Paid') : bill.status === 'void' ? t('ملغاة', 'Void') : t('مستحقة', 'Due');
  const patch = async (status: Bill['status']) => { setErr(''); try { await post('admin/item-save', { item: { ...bill, status } }, { res: 'purchases' }); setOk(t('اتحدّثت.', 'Updated.')); load(); } catch (e) { setErr(errText(e, t)); } };
  return (
    <>
      <div className="no-print">
        <Page title={bill.number} action={<div className="row-actions">
          <button className="btn btn-accent btn-sm" onClick={() => window.print()}>{t('طباعة / حفظ PDF', 'Print / Save as PDF')}</button>
          {bill.status === 'due' && <button className="btn btn-ghost btn-sm" onClick={() => void patch('paid')}>{t('تم الدفع', 'Mark paid')}</button>}
          {bill.status !== 'void' && <button className="btn btn-ghost btn-sm" onClick={() => void patch('void')}>{t('إلغاء الفاتورة', 'Void')}</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/admin/purchases')}>{t('← فواتير الشراء', '← Purchases')}</button></div>}>
          {err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}
          <p className="muted">{t('اضغط "طباعة / حفظ PDF" واختار "Save as PDF" من نافذة الطباعة.', 'Press “Print / Save as PDF” and choose “Save as PDF” in the print window.')}</p>
        </Page>
      </div>
      <div className="print-sheet">
        <div className="ps-head">
          <div>{logo ? <img className="ps-logo" src={assetUrl(logo)} alt="" /> : <b className="ps-brand">{set?.site || 'Notch Cloud'}</b>}
            <div className="ps-co">{biz.legalName || set?.site}</div>
            <div className="muted">{[biz.address, biz.address2, biz.city, biz.governorate, biz.postalCode].filter(Boolean).join('، ')}</div>
            {biz.taxId && <div className="muted">{t('الرقم الضريبي', 'Tax ID')}: <Ltr>{biz.taxId}</Ltr></div>}</div>
          <div className="ps-title"><h1>{t('فاتورة شراء', 'Purchase bill')}</h1><div className="latin"><b>{bill.number}</b></div><span className={`tag ${bill.status === 'paid' ? 'ok' : bill.status === 'void' ? '' : 'warn'}`}>{status}</span></div>
        </div>
        <dl className="kv ps-kv">
          <div><dt>{t('التاريخ', 'Date')}</dt><dd><Ltr>{day(bill.date)}</Ltr></dd></div>
          <div><dt>{t('المزوّد', 'Provider')}</dt><dd>{bill.provider || '-'}</dd></div>
          <div><dt>{t('المرجع', 'Reference')}</dt><dd><Ltr>{bill.ref || '-'}</Ltr></dd></div>
          <div><dt>{t('الدورة', 'Billing')}</dt><dd>{per}</dd></div>
          {client && <div><dt>{t('العميل', 'Client')}</dt><dd>{client}</dd></div>}
        </dl>
        <table className="tbl ps-table"><thead><tr><th>{t('البند', 'Item')}</th><th>{t('الدورة', 'Billing')}</th><th>{t('المبلغ', 'Amount')}</th></tr></thead>
          <tbody><tr><td>{bill.item}</td><td>{per}</td><td className="latin">{money(bill.amount)} {cur}</td></tr></tbody>
          <tfoot><tr><td colSpan={2}><b>{t('الإجمالي', 'Total')}</b></td><td className="latin"><b>{money(bill.amount)} {cur}</b></td></tr></tfoot></table>
        <p className="muted ps-foot">{set?.site} · {set?.contactEmail}</p>
      </div>
    </>
  );
}
