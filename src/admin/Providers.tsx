import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Ltr, useI18n } from '../i18n';
import { api, post, type User } from '../lib/api';
import { useCurrency } from '../site/settings';
import { day, Page, Table } from '../ui';
import { errText } from './errors';

type Field = { key: string; label: string; secret: boolean; value: string; set: boolean };
type Provider = { id: string; name: string; caps: string[]; help: [string, string]; fields: Field[]; sandbox: boolean; useSandbox: boolean; baseUrl: string; connected: boolean; test: { ok: boolean; message: string; at: string } | null };
type PDomain = { name: string; expires: string; status: string; autoRenew: boolean; imported: boolean };
type PHost = { ref: string; kind: string; plan: string; domain: string; status: string; expires: string; cost: number; billing: 'monthly' | 'yearly'; currency: string; costStore: number; imported: boolean };

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US');

function Notice({ err, ok }: { err: string; ok: string }) {
  return <>{err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}</>;
}

/* ───────── Apps: connect Hostinger / Namecheap / ResellerClub, then pull their domains and hosting ───────── */
export function AdminApps() {
  const { t } = useI18n();
  const [list, setList] = useState<Provider[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const load = useCallback(() => { api<{ providers: Provider[] }>('admin/providers').then((r) => setList(r.providers)).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  return (
    <Page title={t('التطبيقات', 'Apps')}>
      <p className="muted">{t('اربط حساباتك عند مزوّدي الدومينات والاستضافة. المفاتيح بتتحفظ على السيرفر ومش بتظهر تاني.', 'Connect your accounts at the domain and hosting providers. Keys are stored on the server and never shown again.')}</p>
      <Notice err={err} ok={ok} />
      <div className="app-grid">
        {list.map((p) => (
          <div className="card app-card" key={p.id}>
            <div className="app-head"><h3>{p.name}</h3><span className={`tag ${p.connected ? (p.test && !p.test.ok ? 'bad' : 'ok') : ''}`}>{p.connected ? (p.test ? (p.test.ok ? t('متصل', 'Connected') : t('فيه مشكلة', 'Problem')) : t('محفوظ', 'Saved')) : t('غير متصل', 'Not connected')}</span></div>
            <p className="muted">{p.caps.map((c) => ({ domains: t('الدومينات', 'Domains'), tlds: t('أسعار الامتدادات', 'TLD prices'), check: t('البحث', 'Search'), hosting: t('الاستضافة', 'Hosting') } as Record<string, string>)[c]).join(' · ')}</p>
            {p.test && !p.test.ok && <div className="form-error">{p.test.message}</div>}
            <div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? t('إغلاق', 'Close') : p.connected ? t('الإعدادات والمزامنة', 'Settings & sync') : t('ربط', 'Connect')}</button></div>
            {open === p.id && <ProviderPanel p={p} onChange={(msg) => { setOk(msg); load(); }} onError={setErr} />}
          </div>
        ))}
      </div>
    </Page>
  );
}

function ProviderPanel({ p, onChange, onError }: { p: Provider; onChange: (msg: string) => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.map((f) => [f.key, f.value])));
  const [sandbox, setSandbox] = useState(p.useSandbox);
  const [base, setBase] = useState(p.baseUrl);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'domains' | 'hosting' | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    onError(''); setBusy(true);
    try { const m = await fn(); onChange(m || t('تم.', 'Done.')); } catch (e) { onError(errText(e, t)); } finally { setBusy(false); }
  };
  const save = (e: FormEvent) => { e.preventDefault(); void run(async () => { await post('admin/providers', { id: p.id, fields: vals, useSandbox: sandbox, baseUrl: base }); return t('اتحفظ.', 'Saved.'); }); };
  const test = () => void run(async () => { const r = await post<{ ok: boolean; message: string }>('admin/providers/test', { id: p.id }); if (!r.ok) throw new Error(r.message); return r.message; });
  const disconnect = () => { if (window.confirm(t('تفصل الربط وتمسح المفاتيح؟', 'Disconnect and delete the saved keys?'))) void run(async () => { await post('admin/providers', { id: p.id, disconnect: true }); return t('اتفصل.', 'Disconnected.'); }); };
  return (
    <div className="app-panel">
      <p className="muted">{t(p.help[0], p.help[1])}</p>
      <form className="admin-form" onSubmit={save} style={{ marginBlock: 8 }}>
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
      {p.connected && (
        <div className="row-actions" style={{ marginBottom: 8 }}>
          {p.caps.includes('domains') && <button className="btn btn-primary btn-sm" onClick={() => setView(view === 'domains' ? null : 'domains')}>{t('جلب الدومينات', 'Import domains')}</button>}
          {p.caps.includes('hosting') && <button className="btn btn-primary btn-sm" onClick={() => setView(view === 'hosting' ? null : 'hosting')}>{t('جلب الاستضافات', 'Import hosting')}</button>}
        </div>
      )}
      {view && <ImportPanel p={p} kind={view} onDone={(m) => { setView(null); onChange(m); }} onError={onError} />}
    </div>
  );
}

function ImportPanel({ p, kind, onDone, onError }: { p: Provider; kind: 'domains' | 'hosting'; onDone: (m: string) => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const cur = useCurrency();
  const [users, setUsers] = useState<User[]>([]);
  const [uid, setUid] = useState('');
  const [rows, setRows] = useState<(PDomain | PHost)[] | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [bills, setBills] = useState(kind === 'hosting');
  const [busy, setBusy] = useState(false);
  const key = (r: PDomain | PHost) => ('ref' in r ? r.ref : r.name);
  useEffect(() => {
    setRows(null);
    api<{ users: User[] }>('admin/users').then((r) => { setUsers(r.users); setUid((u) => u || r.users.find((x) => x.role === 'client')?.id || r.users[0]?.id || ''); }).catch(() => undefined);
    api<Record<string, (PDomain | PHost)[]>>(`admin/providers/${kind}`, undefined, { id: p.id }).then((r) => setRows(r[kind])).catch((e) => { onError(errText(e, t)); setRows([]); });
  }, [p.id, kind, onError, t]);
  const chosen = useMemo(() => (rows ?? []).filter((r) => pick[key(r)] && !r.imported), [rows, pick]);
  const go = async () => {
    setBusy(true); onError('');
    try { const r = await post<{ imported: number }>('admin/providers/import', { id: p.id, kind, uid, bills, items: chosen }); onDone(t(`اتجلب ${r.imported}.`, `Imported ${r.imported}.`)); }
    catch (e) { onError(errText(e, t)); } finally { setBusy(false); }
  };
  return (
    <div className="app-import">
      {rows === null ? <p className="muted">…</p> : rows.length === 0 ? <p className="muted">{t('مفيش عناصر.', 'Nothing found.')}</p> : (
        <>
          <Table head={['', kind === 'domains' ? t('الدومين', 'Domain') : t('الخطة', 'Plan'), t('ينتهي', 'Expires'), ...(kind === 'hosting' ? [t('التكلفة', 'Cost')] : [])]}>
            {rows.map((r) => (
              <tr key={key(r)}>
                <td><input type="checkbox" disabled={r.imported} checked={r.imported || !!pick[key(r)]} onChange={(e) => setPick({ ...pick, [key(r)]: e.target.checked })} aria-label={key(r)} /></td>
                <td>{'ref' in r ? <>{r.plan} {r.domain && <Ltr>{r.domain}</Ltr>}</> : <Ltr>{r.name}</Ltr>} {r.imported && <span className="tag">{t('موجود', 'Imported')}</span>}</td>
                <td><Ltr>{r.expires || '-'}</Ltr></td>
                {'ref' in r && <td><span className="latin">{money(r.costStore)} {cur}</span> <span className="muted">/ {r.billing === 'yearly' ? t('سنة', 'yr') : t('شهر', 'mo')}</span></td>}
              </tr>
            ))}
          </Table>
          <div className="inline-form" style={{ gridTemplateColumns: '1fr auto auto', marginTop: 12 }}>
            <div className="field"><label htmlFor="imp-uid">{t('اربطها بالعميل', 'Assign to client')}</label>
              <select id="imp-uid" className="select" value={uid} onChange={(e) => setUid(e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
            <label className="check"><input type="checkbox" checked={bills} onChange={(e) => setBills(e.target.checked)} /> {t('إصدار فواتير شراء', 'Create purchase bills')}</label>
            <button className="btn btn-accent" onClick={() => void go()} disabled={busy || chosen.length === 0 || !uid}>{t(`جلب (${chosen.length})`, `Import (${chosen.length})`)}</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── TLD prices, margin and search ───────── */
type Offer = { provider: string; currency: string; register: number; renew: number; costStore: number; renewStore: number };
type Tld = { tld: string; offers: Offer[]; best: string; cost: number; renewCost: number; marginPct: number; custom: boolean; sell: number; renewSell: number; profit: number; currency: string };
type PricingResp = { pricing: { marginPct: number; rounding: number; rates: Record<string, number>; tldMargins: Record<string, number> }; currency: string; fetchedAt: string; errors: Record<string, string>; tlds: Tld[] };
type Hit = { domain: string; tld: string; available: boolean; sell: number; renewSell: number; currency: string; provider: string; cost: number; profit: number; marginPct: number };

export function AdminPricing() {
  const { t } = useI18n();
  const [d, setD] = useState<PricingResp | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [margin, setMargin] = useState('30');
  const [rounding, setRounding] = useState('5');
  const [usd, setUsd] = useState('50');
  const [eur, setEur] = useState('55');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchErr, setSearchErr] = useState<Record<string, string>>({});
  const apply = (r: PricingResp) => { setD(r); setMargin(String(r.pricing.marginPct)); setRounding(String(r.pricing.rounding)); setUsd(String(r.pricing.rates.USD ?? 50)); setEur(String(r.pricing.rates.EUR ?? 55)); };
  const load = useCallback((refresh = false) => {
    setBusy(true); setErr('');
    api<PricingResp>('admin/pricing', undefined, refresh ? { refresh: '1' } : undefined).then(apply).catch((e) => setErr(errText(e, t))).finally(() => setBusy(false));
  }, [t]);
  useEffect(() => load(), [load]);
  const saveSettings = async (extra: Record<string, unknown> = {}) => {
    setErr(''); setOk('');
    try { apply(await post<PricingResp>('admin/pricing', { marginPct: Number(margin), rounding: Number(rounding), rates: { USD: Number(usd), EUR: Number(eur) }, ...extra })); setOk(t('اتحفظ.', 'Saved.')); } catch (e) { setErr(errText(e, t)); }
  };
  const setTldMargin = (tld: string, v: string) => {
    const m = { ...(d?.pricing.tldMargins ?? {}) };
    if (v.trim() === '') delete m[tld]; else m[tld] = Number(v);
    void saveSettings({ tldMargins: m });
  };
  const search = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setHits(null);
    try { const r = await api<{ results: Hit[]; errors: Record<string, string> }>('admin/pricing/search', undefined, { q }); setHits(r.results); setSearchErr(r.errors); } catch (x) { setErr(errText(x, t)); }
  };
  const shown = (d?.tlds ?? []).filter((x) => !filter || x.tld.includes(filter.toLowerCase().replace(/^\./, '')));
  const cur = d?.currency ?? '';
  return (
    <Page title={t('أسعار الدومينات', 'TLD pricing')} action={<button className="btn btn-primary btn-sm" onClick={() => load(true)} disabled={busy}>{busy ? '…' : t('تحديث الأسعار من المزوّدين', 'Refresh provider prices')}</button>}>
      <Notice err={err} ok={ok} />
      {d && Object.entries(d.errors).map(([id, m]) => <div className="form-error" key={id}>{id}: {m}</div>)}
      {d && d.tlds.length === 0 && !busy && <div className="empty-note">{t('مفيش أسعار لسه. اربط Hostinger أو Namecheap أو ResellerClub من صفحة التطبيقات.', 'No prices yet. Connect Hostinger, Namecheap or ResellerClub in Apps.')}</div>}
      <form className="card inline-form" style={{ gridTemplateColumns: 'repeat(5, 1fr) auto', margin: '16px 0' }} onSubmit={(e) => { e.preventDefault(); void saveSettings(); }}>
        <div className="field"><label htmlFor="pm">{t('نسبة المكسب %', 'Profit margin %')}</label><input id="pm" className="input latin" type="number" min={0} step="any" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
        <div className="field"><label htmlFor="pr">{t('تقريب السعر لأقرب', 'Round price up to')}</label><input id="pr" className="input latin" type="number" min={0} step="any" value={rounding} onChange={(e) => setRounding(e.target.value)} /></div>
        <div className="field"><label htmlFor="pu">1 USD = ? {cur}</label><input id="pu" className="input latin" type="number" min={0} step="any" value={usd} onChange={(e) => setUsd(e.target.value)} /></div>
        <div className="field"><label htmlFor="pe">1 EUR = ? {cur}</label><input id="pe" className="input latin" type="number" min={0} step="any" value={eur} onChange={(e) => setEur(e.target.value)} /></div>
        <div className="field"><label htmlFor="pf">{t('فلتر الامتداد', 'Filter extension')}</label><input id="pf" className="input latin" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder=".com" /></div>
        <button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button>
      </form>

      <form className="card inline-form" style={{ gridTemplateColumns: '1fr auto', margin: '16px 0' }} onSubmit={search}>
        <div className="field"><label htmlFor="sq">{t('ابحث عن دومين (زي ما العميل هيشوفه، مع تكلفتك ومكسبك)', 'Search a domain (as clients see it, with your cost and profit)')}</label><input id="sq" className="input latin" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder="mybrand" /></div>
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
          <p className="muted" style={{ marginTop: 16 }}>{t('آخر تحديث', 'Last refreshed')}: <Ltr>{day(d.fetchedAt)}</Ltr> · {t('الأسعار بعملة المتجر', 'Prices in store currency')}: {cur} · {t('بنختار أرخص مزوّد لكل امتداد.', 'The cheapest provider is used for each extension.')}</p>
          <Table head={[t('الامتداد', 'Extension'), t('أرخص مزوّد', 'Cheapest'), t('التكلفة (تسجيل)', 'Cost (register)'), t('المكسب %', 'Margin %'), t('سعر البيع (سنة)', 'Sell (1 yr)'), t('المكسب', 'Profit'), t('تجديد (تكلفة → بيع)', 'Renew (cost → sell)'), t('كل المزوّدين', 'All providers')]}>
            {shown.map((x) => (
              <tr key={x.tld}>
                <td><Ltr>.{x.tld}</Ltr></td><td>{x.best}</td><td className="latin">{money(x.cost)}</td>
                <td><input className="input latin" style={{ width: 80, height: 36 }} type="number" min={0} step="any" defaultValue={x.custom ? x.marginPct : ''} placeholder={String(x.marginPct)} aria-label={`${x.tld} margin`}
                  onBlur={(e) => { if ((e.target.value === '' && x.custom) || (e.target.value !== '' && Number(e.target.value) !== x.marginPct)) setTldMargin(x.tld, e.target.value); }} /></td>
                <td className="latin"><b>{money(x.sell)}</b> {cur}</td><td className="latin">{money(x.profit)} {cur}</td>
                <td className="latin">{money(x.renewCost)} → {money(x.renewSell)}</td>
                <td className="latin muted">{x.offers.map((o) => `${o.provider} ${money(o.costStore)}`).join(' · ')}</td>
              </tr>
            ))}
          </Table>
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
            <td><Ltr>{b.number}</Ltr></td><td>{b.item}</td><td>{b.provider}</td><td className="latin"><b>{money(b.amount)}</b> {cur}</td>
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
