import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DnsEditor } from '../dns';
import { Ltr, useI18n } from '../i18n';
import { post } from '../lib/api';
import type { DnsRec } from '../lib/types';
import { useCurrency } from '../site/settings';
import { day, Meter, Modal, Page, StatusTag, Table } from '../ui';
import { errText } from './errors';
import { ClientLine, DNS_PULL, DNS_PUSH, gb, Kv, Notice, num, PROVIDERS, pctUsed, SideCard, STATUS, Strip, Tabs, under, useAll, type Item } from './kit';

export { AdminUpdates } from './Updates';

const margin = (cost: unknown, price: unknown) => (num(cost) > 0 && num(price) > 0 ? Math.round(((num(price) - num(cost)) / num(cost)) * 100) : null);
type Mail = { id: string; address: string; quotaGb: number; usedGb: number; status: string };

/** Shared bits of every detail page: where messages go, and the "Edit" window. */
function useActions(load: () => void) {
  const { t } = useI18n();
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); if (done) setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };
  return { err, ok, setErr, setOk, run };
}
const Field = ({ id, label, children, wide }: { id: string; label: string; children: React.ReactNode; wide?: boolean }) => <div className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}><label htmlFor={id}>{label}</label>{children}</div>;

/* ───────── One domain ───────── */
export function AdminDomainDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const { err, ok, setErr, setOk, run } = useActions(load);
  const [tab, setTab] = useState<'overview' | 'dns' | 'subs' | 'hosting' | 'email'>('overview');
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [mailForm, setMailForm] = useState<{ local: string; quota: number } | null>(null);
  const [dnsErr, setDnsErr] = useState('');
  const d = all?.items.domains.find((x) => x.id === id);
  if (!all || !d) return <Page title={t('الدومين', 'Domain')}><Notice err={error} ok="" /><Link to="/admin/domains" className="btn btn-ghost btn-sm">{t('← الدومينات', '← Domains')}</Link></Page>;
  const name = String(d.name);
  const dns = (d.dns as DnsRec[]) ?? [];
  const provider = String(d.provider ?? '');
  const websites = all.items.websites.filter((w) => w.domainId === d.id || under(w.url || w.name, name));
  const hostings = all.items.hosting.filter((h) => under(h.domain, name) || websites.some((w) => w.hostingId === h.id));
  const mails = all.items.mailboxes.filter((m) => String(m.address).toLowerCase().endsWith('@' + name.toLowerCase())) as unknown as Mail[];
  const subs = [
    ...dns.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type) && r.host !== '@' && r.host !== '').map((r) => ({ host: r.host, name: `${r.host}.${name}`, type: r.type, value: r.value })),
    ...websites.filter((w) => String(w.url || w.name).toLowerCase() !== name.toLowerCase() && !dns.some((r) => `${r.host}.${name}` === String(w.url || w.name).toLowerCase())).map((w) => ({ host: '', name: String(w.url || w.name), type: 'site', value: '' })),
  ];
  const m = margin(d.cost, d.price);
  const dnsCall = (action: 'pull' | 'push') => {
    if (action === 'push' && !window.confirm(t('هنبعت السجلات دي للمزوّد وتستبدل سجلاته الحالية. تكمل؟', 'This sends these records to the provider and replaces its current ones. Continue?'))) return;
    void run(async () => { const r = await post<{ records: number }>('admin/domain-dns', { id: d.id, action }); setOk(t(`تمام (${r.records} سجل).`, `Done (${r.records} records).`)); }, '');
  };
  const connectMail = () => void run(async () => { const r = await post<{ added: number; warning?: string }>('admin/domain-mail', { id: d.id }); if (r.warning) setErr(r.warning); setOk(t(`اتضافت ${r.added} سجل إيميل (MX/SPF) لـ Hostinger.`, `Added ${r.added} email records (MX/SPF) for Hostinger.`)); }, '');
  return (
    <Page title={name} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...d })}>{t('تعديل', 'Edit')}</button><Link to="/admin/domains" className="btn btn-ghost btn-sm">{t('← الدومينات', '← Domains')}</Link></div>}>
      <Notice err={err || error} ok={ok} />
      <Strip items={[[t('الحالة', 'Status'), <StatusTag s={d.status as 'active'} />], [t('ينتهي', 'Expires'), <Ltr>{String(d.expires || '-')}</Ltr>], [t('المزوّد', 'Provider'), provider || '-'],
        [t('تكلفة → بيع (سنة)', 'Cost → price (yr)'), <span className="latin">{num(d.cost)} → {num(d.price)} {cur}{m !== null ? ` · ${m}%` : ''}</span>], [t('سجلات DNS', 'DNS records'), <span className="latin">{dns.length}</span>]]} />
      <div className="cust-layout">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[['overview', t('نظرة عامة', 'Overview')], ['dns', 'DNS', dns.length], ['subs', t('الدومينات الفرعية', 'Subdomains'), subs.length], ['hosting', t('الاستضافة والمواقع', 'Hosting & sites'), hostings.length + websites.length], ['email', t('الإيميلات', 'Email'), mails.length]]} />
          {tab === 'overview' && (
            <div className="card"><Kv rows={[[t('العميل', 'Client'), <ClientLine users={all.users} uid={d.uid} />], [t('تجديد تلقائي', 'Auto-renew'), d.autoRenew ? t('مفعّل', 'On') : t('مقفول', 'Off')], [t('الإيميل', 'Email'), d.mail === 'hostinger' ? 'Hostinger Email' : '-'],
              [t('المواقع', 'Websites'), <span className="latin">{websites.length}</span>], [t('الاستضافة', 'Hosting'), <span className="latin">{hostings.length}</span>], [t('ملاحظات', 'Notes'), String(d.notes || '-')]]} /></div>
          )}
          {tab === 'dns' && (
            <>
              <div className="row-actions" style={{ margin: '12px 0' }}>
                <button className="btn btn-primary btn-sm" disabled={!DNS_PULL.includes(provider)} onClick={() => dnsCall('pull')} title={DNS_PULL.includes(provider) ? '' : t('اختار مزوّد من التعديل', 'Choose a provider in Edit')}>{t('جلب من المزوّد', 'Pull from provider')}</button>
                <button className="btn btn-ghost btn-sm" disabled={!DNS_PUSH.includes(provider)} onClick={() => dnsCall('push')}>{t('إرسال للمزوّد', 'Push to provider')}</button>
                {d.dnsSynced ? <span className="tag ok">{t('متزامن مع المزوّد', 'Synced with provider')}</span> : null}
              </div>
              <p className="muted">{d.dnsSynced ? t('أي تعديل (منك أو من العميل) بيتبعت للمزوّد تلقائيًا.', 'Every change (yours or the client’s) is sent to the provider automatically.') : t('اجلب السجلات من المزوّد الأول عشان التعديلات تتزامن معاه. لحد وقتها التعديلات محلية.', 'Pull the records first so changes sync with the provider. Until then changes stay local.')}</p>
              <DnsEditor records={dns} err={dnsErr}
                onAdd={async (r) => { setDnsErr(''); try { const x = await post<{ warning?: string }>('svc/dns-save', { id: d.id, ...r }); if (x.warning) setDnsErr(x.warning); load(); } catch (e) { setDnsErr(errText(e, t)); } }}
                onDelete={async (rid) => { setDnsErr(''); try { const x = await post<{ warning?: string }>('svc/dns-delete', { id: d.id, rid }); if (x.warning) setDnsErr(x.warning); load(); } catch (e) { setDnsErr(errText(e, t)); } }} />
            </>
          )}
          {tab === 'subs' && (
            <Table head={[t('الدومين الفرعي', 'Subdomain'), t('النوع', 'Type'), t('يشير إلى', 'Points to'), t('الموقع', 'Website')]} empty={subs.length === 0 ? t('مفيش دومينات فرعية. أضف سجل A أو CNAME في DNS (زي www أو blog).', 'No subdomains. Add an A or CNAME record in DNS (like www or blog).') : undefined}>
              {subs.map((s) => { const w = websites.find((x) => String(x.url || x.name).toLowerCase() === s.name.toLowerCase()); return <tr key={s.name + s.type}><td><Ltr>{s.name}</Ltr></td><td><span className="tag">{s.type}</span></td><td className="latin">{s.value || '-'}</td><td>{w ? <Link className="link" to={`/admin/websites/${w.id}`}>{String(w.name)}</Link> : '-'}</td></tr>; })}
            </Table>
          )}
          {tab === 'hosting' && (
            <div className="linked">
              {websites.map((w) => <div key={w.id}><Link className="link" to={`/admin/websites/${w.id}`}>{t('موقع', 'Website')}: <Ltr>{String(w.name)}</Ltr></Link><span className="latin muted">{gb(w.usedGb)} / {gb(w.diskGb)}</span></div>)}
              {hostings.map((h) => <div key={h.id}><Link className="link" to={`/admin/hosting/${h.id}`}>{t('استضافة', 'Hosting')}: {String(h.plan)}</Link><StatusTag s={h.status as 'active'} /></div>)}
              {websites.length + hostings.length === 0 && <p className="muted">{t('مفيش مواقع أو استضافة مرتبطة.', 'No websites or hosting linked.')}</p>}
            </div>
          )}
          {tab === 'email' && (
            <>
              <div className="card" style={{ margin: '12px 0' }}>
                <h3>Hostinger Email</h3>
                <p className="muted">{d.mail === 'hostinger' ? t('الدومين متظبط على Hostinger Email (سجلات MX وSPF موجودة). بتدير الصناديق نفسها من لوحة Hostinger.', 'This domain is set up for Hostinger Email (MX and SPF records are in place). You manage the mailboxes themselves in Hostinger.') : t('اربط الدومين بـ Hostinger Email: بنضيف سجلات MX وSPF المطلوبة في DNS.', 'Connect the domain to Hostinger Email: we add the required MX and SPF records to DNS.')}</p>
                <div className="row-actions">
                  <button className="btn btn-accent btn-sm" onClick={connectMail}>{d.mail === 'hostinger' ? t('أعد ضبط سجلات الإيميل', 'Re-apply the email records') : t('اربط بـ Hostinger Email', 'Connect Hostinger Email')}</button>
                  <a className="btn btn-ghost btn-sm" href="https://mail.hostinger.com" target="_blank" rel="noreferrer">Webmail</a>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMailForm({ local: '', quota: 5 })}>{t('+ إيميل', '+ Mailbox')}</button>
                </div>
              </div>
              <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage'), t('الحالة', 'Status')]} empty={mails.length === 0 ? t('مفيش إيميلات لسه على الدومين ده.', 'No mailboxes on this domain yet.') : undefined}>
                {mails.map((x) => <tr key={x.id}><td><Ltr>{x.address}</Ltr></td><td className="latin">{num(x.usedGb)} / {num(x.quotaGb)} GB</td><td><StatusTag s={x.status as 'active'} /></td></tr>)}
              </Table>
            </>
          )}
        </div>
        <aside>
          <SideCard title={t('العميل', 'Client')}><ClientLine users={all.users} uid={d.uid} />{(() => { const u = all.users.find((x) => x.id === d.uid); return u ? <><a className="link latin" dir="ltr" href={`mailto:${u.email}`}>{u.email}</a>{u.phone && <a className="link latin" dir="ltr" href={`tel:${u.phone}`}>{u.phone}</a>}</> : null; })()}</SideCard>
          <SideCard title={t('المزوّد', 'Provider')}><p><b>{provider || '-'}</b></p><p className="muted latin">{num(d.cost)} → {num(d.price)} {cur}{m !== null ? ` · ${m}%` : ''}</p><p className="muted">{String(d.notes || '')}</p></SideCard>
        </aside>
      </div>

      {edit && (
        <Modal title={t('تعديل الدومين', 'Edit domain')} wide onClose={() => setEdit(null)}>
          <form className="admin-form" style={{ marginBlock: 0 }} onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => post('admin/item-save', { item: edit }, { res: 'domains' }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setEdit(null); }); }}>
            <Field id="ed-uid" label={t('العميل', 'Client')}><select id="ed-uid" className="select" value={String(edit.uid)} onChange={(e) => setEdit({ ...edit, uid: e.target.value })}>{all.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></Field>
            <Field id="ed-st" label={t('الحالة', 'Status')}><select id="ed-st" className="select" value={String(edit.status)} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{STATUS.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></Field>
            <Field id="ed-ex" label={t('ينتهي في', 'Expires')}><input id="ed-ex" className="input" type="date" value={String(edit.expires ?? '')} onChange={(e) => setEdit({ ...edit, expires: e.target.value })} /></Field>
            <Field id="ed-pv" label={t('المزوّد', 'Provider')}><select id="ed-pv" className="select" value={String(edit.provider ?? '')} onChange={(e) => setEdit({ ...edit, provider: e.target.value })}><option value="">{t('بدون', 'None')}</option>{PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Field id="ed-co" label={`${t('تكلفتك (سنة)', 'Your cost (per year)')} · ${cur}`}><input id="ed-co" className="input latin" type="number" min={0} step="any" value={String(edit.cost ?? '')} onChange={(e) => setEdit({ ...edit, cost: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field id="ed-pr" label={`${t('سعر العميل (سنة)', 'Client price (per year)')} · ${cur}`}><input id="ed-pr" className="input latin" type="number" min={0} step="any" value={String(edit.price ?? '')} onChange={(e) => setEdit({ ...edit, price: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <label className="check"><input type="checkbox" checked={Boolean(edit.autoRenew)} onChange={(e) => setEdit({ ...edit, autoRenew: e.target.checked })} /> {t('تجديد تلقائي', 'Auto-renew')}</label>
            <Field id="ed-nt" label={t('ملاحظات', 'Notes')} wide><input id="ed-nt" className="input" value={String(edit.notes ?? '')} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
          </form>
        </Modal>
      )}
      {mailForm && (
        <Modal title={t('إضافة إيميل', 'Add a mailbox')} onClose={() => setMailForm(null)}>
          <form className="form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => post('admin/item-save', { item: { uid: d.uid, address: `${mailForm.local.trim().toLowerCase()}@${name}`, quotaGb: mailForm.quota, usedGb: 0, status: 'active' } }, { res: 'mailboxes' }), t('اتضاف الإيميل.', 'Mailbox added.')).then((r) => { if (r) setMailForm(null); }); }}>
            <Field id="mf-l" label={t('الاسم قبل @', 'Name before @')}><input id="mf-l" className="input latin" required pattern="[A-Za-z0-9._\-]+" value={mailForm.local} onChange={(e) => setMailForm({ ...mailForm, local: e.target.value })} placeholder="info" /></Field>
            <Field id="mf-q" label={t('المساحة (GB)', 'Quota (GB)')}><input id="mf-q" className="input latin" type="number" min={1} value={mailForm.quota} onChange={(e) => setMailForm({ ...mailForm, quota: Number(e.target.value) })} /></Field>
            <p className="muted latin">{mailForm.local || 'name'}@{name}</p>
            <button className="btn btn-accent" type="submit">{t('إضافة', 'Add')}</button>
          </form>
        </Modal>
      )}
    </Page>
  );
}

/* ───────── Websites: list ───────── */
export function AdminWebsites() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { all, error, load } = useAll();
  const { err, ok, run } = useActions(load);
  const [tab, setTab] = useState<'all' | 'active' | 'pending' | 'stopped'>('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const sites = all?.items.websites ?? [];
  const shown = sites.filter((w) => (tab === 'all' || w.status === tab) && (!q.trim() || `${w.name} ${w.url}`.toLowerCase().includes(q.trim().toLowerCase())));
  const owner = (uid: string) => all?.users.find((u) => u.id === uid)?.name ?? '-';
  const totalUsed = sites.reduce((n, w) => n + num(w.usedGb), 0);
  const count = (s: string) => sites.filter((w) => s === 'all' || w.status === s).length;
  const blank = { uid: all?.users.find((u) => u.role === 'client')?.id ?? '', name: '', url: '', status: 'active', domainId: '', hostingId: '', diskGb: 0, usedGb: 0, notes: '' };
  const mine = (res: string, uid: unknown) => (all?.items[res] ?? []).filter((x) => x.uid === uid);
  return (
    <Page title={t('المواقع', 'Websites')} action={<button className="btn btn-accent btn-sm" onClick={() => setForm({ ...blank })}>{t('+ موقع', '+ Website')}</button>}>
      <Notice err={err || error} ok={ok} />
      <Strip items={[[t('المواقع', 'Websites'), <span className="latin">{sites.length}</span>], [t('شغّالة', 'Active'), <span className="latin">{count('active')}</span>], [t('المساحة المستخدمة', 'Disk in use'), <span className="latin">{gb(totalUsed)}</span>], [t('من غير استضافة', 'Without hosting'), <span className="latin">{sites.filter((w) => !w.hostingId).length}</span>]]} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cust-bar">
          <Tabs value={tab} onChange={setTab} tabs={[['all', t('الكل', 'All'), count('all')], ['active', t('نشط', 'Active'), count('active')], ['pending', t('قيد التفعيل', 'Pending'), count('pending')], ['stopped', t('متوقف', 'Stopped'), count('stopped')]]} />
          <input className="input" style={{ height: 40, width: 220 }} placeholder={t('ابحث', 'Search')} aria-label={t('بحث', 'Search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="tbl">
            <thead><tr><th>{t('الموقع', 'Website')}</th><th>{t('الحالة', 'Status')}</th><th>{t('الدومين', 'Domain')}</th><th>{t('الاستضافة', 'Hosting')}</th><th>{t('المساحة', 'Disk')}</th><th>{t('العميل', 'Client')}</th></tr></thead>
            <tbody>
              {shown.map((w) => {
                const dom = all?.items.domains.find((x) => x.id === w.domainId); const host = all?.items.hosting.find((x) => x.id === w.hostingId);
                return (
                  <tr key={w.id} className="row-link" onClick={() => nav(`/admin/websites/${w.id}`)}>
                    <td><Link className="link" to={`/admin/websites/${w.id}`} onClick={(e) => e.stopPropagation()}><Ltr>{String(w.name)}</Ltr></Link></td><td><StatusTag s={w.status as 'active'} /></td>
                    <td>{dom ? <Ltr>{String(dom.name)}</Ltr> : '-'}</td><td>{host ? String(host.plan) : '-'}</td>
                    <td style={{ minWidth: 130 }}><span className="latin">{gb(w.usedGb)} / {gb(w.diskGb)}</span>{num(w.diskGb) > 0 && <Meter value={pctUsed(w)} tone={pctUsed(w) > 85 ? 'warn' : undefined} />}</td><td>{owner(w.uid)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={6}><div className="empty-note">{all ? t('مفيش مواقع. اجلبها من Apps أو أضف واحد.', 'No websites. Import them from Apps or add one.') : '…'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {form && all && (
        <Modal title={t('إضافة موقع', 'Add a website')} wide onClose={() => setForm(null)}>
          <WebsiteForm all={all} form={form} setForm={setForm} mine={mine} onSave={() => run(() => post('admin/item-save', { item: form }, { res: 'websites' }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setForm(null); })} />
        </Modal>
      )}
    </Page>
  );
}

function WebsiteForm({ all, form, setForm, mine, onSave }: { all: NonNullable<ReturnType<typeof useAll>['all']>; form: Record<string, unknown>; setForm: (f: Record<string, unknown>) => void; mine: (res: string, uid: unknown) => Item[]; onSave: () => void }) {
  const { t } = useI18n();
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  const numIn = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? '' : Number(e.target.value));
  return (
    <form className="admin-form" style={{ marginBlock: 0 }} onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(); }}>
      <Field id="w-uid" label={t('العميل', 'Client')}><select id="w-uid" className="select" required value={String(form.uid ?? '')} onChange={(e) => setForm({ ...form, uid: e.target.value, domainId: '', hostingId: '' })}>{all.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></Field>
      <Field id="w-name" label={t('اسم الموقع', 'Site name')}><input id="w-name" className="input latin" required value={String(form.name ?? '')} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field id="w-url" label={t('الرابط / الدومين', 'URL / domain')}><input id="w-url" className="input latin" value={String(form.url ?? '')} onChange={(e) => set('url', e.target.value)} /></Field>
      <Field id="w-st" label={t('الحالة', 'Status')}><select id="w-st" className="select" value={String(form.status)} onChange={(e) => set('status', e.target.value)}>{STATUS.filter((s) => s[0] !== 'expiring').map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></Field>
      <Field id="w-dom" label={t('الدومين المرتبط', 'Linked domain')}><select id="w-dom" className="select" value={String(form.domainId ?? '')} onChange={(e) => set('domainId', e.target.value)}><option value="">{t('بدون', 'None')}</option>{mine('domains', form.uid).map((x) => <option key={x.id} value={x.id}>{String(x.name)}</option>)}</select></Field>
      <Field id="w-host" label={t('الاستضافة المرتبطة', 'Linked hosting')}><select id="w-host" className="select" value={String(form.hostingId ?? '')} onChange={(e) => set('hostingId', e.target.value)}><option value="">{t('بدون', 'None')}</option>{mine('hosting', form.uid).map((x) => <option key={x.id} value={x.id}>{String(x.plan)}{x.domain ? ` · ${x.domain}` : ''}</option>)}</select></Field>
      <Field id="w-disk" label={t('المساحة المخصصة (GB)', 'Allotted space (GB)')}><input id="w-disk" className="input latin" type="number" min={0} step="any" value={String(form.diskGb ?? '')} onChange={numIn('diskGb')} /></Field>
      <Field id="w-used" label={t('المستخدم (GB)', 'Used (GB)')}><input id="w-used" className="input latin" type="number" min={0} step="any" value={String(form.usedGb ?? '')} onChange={numIn('usedGb')} /></Field>
      <Field id="w-nt" label={t('ملاحظات', 'Notes')} wide><input id="w-nt" className="input" value={String(form.notes ?? '')} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
    </form>
  );
}

/* ───────── One website ───────── */
export function AdminWebsiteDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const { err, ok, run } = useActions(load);
  const [tab, setTab] = useState<'overview' | 'domain' | 'hosting' | 'email'>('overview');
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const w = all?.items.websites.find((x) => x.id === id);
  if (!all || !w) return <Page title={t('الموقع', 'Website')}><Notice err={error} ok="" /><Link to="/admin/websites" className="btn btn-ghost btn-sm">{t('← المواقع', '← Websites')}</Link></Page>;
  const host = all.items.hosting.find((x) => x.id === w.hostingId);
  const dom = all.items.domains.find((x) => x.id === w.domainId) ?? all.items.domains.find((x) => under(w.url || w.name, x.name));
  const mails = dom ? all.items.mailboxes.filter((m) => String(m.address).toLowerCase().endsWith('@' + String(dom.name).toLowerCase())) : [];
  const dns = ((dom?.dns as DnsRec[]) ?? []).filter((r) => r.host !== '@');
  const used = pctUsed(w);
  const mine = (res: string, uid: unknown) => all.items[res].filter((x) => x.uid === uid);
  return (
    <Page title={String(w.name)} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...w })}>{t('تعديل', 'Edit')}</button><Link to="/admin/websites" className="btn btn-ghost btn-sm">{t('← المواقع', '← Websites')}</Link></div>}>
      <Notice err={err || error} ok={ok} />
      <Strip items={[[t('الحالة', 'Status'), <StatusTag s={w.status as 'active'} />], [t('الدومين', 'Domain'), dom ? <Link className="link" to={`/admin/domains/${dom.id}`}><Ltr>{String(dom.name)}</Ltr></Link> : '-'], [t('الاستضافة', 'Hosting'), host ? <Link className="link" to={`/admin/hosting/${host.id}`}>{String(host.plan)}</Link> : '-'],
        [t('المساحة', 'Disk'), <span className="latin">{gb(w.usedGb)} / {gb(w.diskGb)}</span>], [t('الإيميلات', 'Mailboxes'), <span className="latin">{mails.length}</span>]]} />
      <div className="cust-layout">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[['overview', t('نظرة عامة', 'Overview')], ['domain', t('الدومين', 'Domain'), dns.length], ['hosting', t('الاستضافة', 'Hosting')], ['email', t('الإيميلات', 'Email'), mails.length]]} />
          {tab === 'overview' && <div className="card"><Kv rows={[[t('الرابط', 'URL'), <Ltr>{String(w.url || w.name)}</Ltr>], [t('العميل', 'Client'), <ClientLine users={all.users} uid={w.uid} />], [t('المزوّد', 'Provider'), String(w.provider || '-')], [t('ملاحظات', 'Notes'), String(w.notes || '-')]]} />
            {num(w.diskGb) > 0 && <><h3 style={{ marginTop: 16 }}>{t('المساحة', 'Disk')}</h3><p className="muted latin">{gb(w.usedGb)} / {gb(w.diskGb)} · {Math.round(used)}%</p><Meter value={used} tone={used > 85 ? 'warn' : undefined} /></>}</div>}
          {tab === 'domain' && (dom ? <div className="card"><h3><Link className="link" to={`/admin/domains/${dom.id}`}><Ltr>{String(dom.name)}</Ltr></Link></h3><p className="muted">{t('ينتهي', 'Expires')}: <Ltr>{String(dom.expires || '-')}</Ltr></p>
            <Table head={[t('الدومين الفرعي', 'Subdomain'), t('النوع', 'Type'), t('القيمة', 'Value')]} empty={dns.length === 0 ? t('مفيش سجلات DNS فرعية.', 'No subdomain DNS records.') : undefined}>{dns.map((r) => <tr key={r.id}><td><Ltr>{r.host}.{String(dom.name)}</Ltr></td><td><span className="tag">{r.type}</span></td><td className="latin">{r.value}</td></tr>)}</Table></div>
            : <p className="muted">{t('مفيش دومين مربوط. اربطه من "تعديل".', 'No domain linked. Link one in Edit.')}</p>)}
          {tab === 'hosting' && (host ? <div className="card"><h3><Link className="link" to={`/admin/hosting/${host.id}`}>{String(host.plan)}</Link></h3><p className="muted latin">{gb(host.usedGb)} / {gb(host.diskGb)} · {String(host.provider || '-')}</p><Meter value={pctUsed(host)} tone={pctUsed(host) > 85 ? 'warn' : undefined} /></div> : <p className="muted">{t('مفيش استضافة مربوطة. اربطها من "تعديل".', 'No hosting linked. Link one in Edit.')}</p>)}
          {tab === 'email' && <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage'), t('الحالة', 'Status')]} empty={mails.length === 0 ? t('مفيش إيميلات على دومين الموقع.', 'No mailboxes on the website’s domain.') : undefined}>{mails.map((m) => <tr key={m.id}><td><Ltr>{String(m.address)}</Ltr></td><td className="latin">{num(m.usedGb)} / {num(m.quotaGb)} GB</td><td><StatusTag s={m.status as 'active'} /></td></tr>)}</Table>}
        </div>
        <aside>
          <SideCard title={t('العميل', 'Client')}><ClientLine users={all.users} uid={w.uid} /></SideCard>
          {host && <SideCard title={t('الاستضافة', 'Hosting')}><Link className="link" to={`/admin/hosting/${host.id}`}>{String(host.plan)}</Link><p className="muted latin">{gb(host.usedGb)} / {gb(host.diskGb)}</p></SideCard>}
        </aside>
      </div>
      {edit && <Modal title={t('تعديل الموقع', 'Edit website')} wide onClose={() => setEdit(null)}><WebsiteForm all={all} form={edit} setForm={setEdit} mine={mine} onSave={() => run(() => post('admin/item-save', { item: edit }, { res: 'websites' }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setEdit(null); })} /></Modal>}
    </Page>
  );
}

/* ───────── One hosting plan ───────── */
export function AdminHostingDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const { err, ok, setOk, setErr, run } = useActions(load);
  const [tab, setTab] = useState<'overview' | 'websites' | 'domains' | 'email' | 'billing'>('overview');
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [link, setLink] = useState('');
  const [usage, setUsage] = useState<Record<string, { diskGb: string; usedGb: string }> | null>(null);
  const h = all?.items.hosting.find((x) => x.id === id);
  if (!all || !h) return <Page title={t('الاستضافة', 'Hosting')}><Notice err={error} ok="" /><Link to="/admin/hosting" className="btn btn-ghost btn-sm">{t('← الاستضافة', '← Hosting')}</Link></Page>;
  const sites = all.items.websites.filter((w) => w.hostingId === h.id);
  const free = all.items.websites.filter((w) => w.uid === h.uid && w.hostingId !== h.id);
  const doms = all.items.domains.filter((d) => sites.some((w) => w.domainId === d.id) || under(h.domain, d.name));
  const mails = all.items.mailboxes.filter((m) => doms.some((d) => String(m.address).toLowerCase().endsWith('@' + String(d.name).toLowerCase())));
  const used = pctUsed(h);
  const allotted = sites.reduce((n, w) => n + num(w.diskGb), 0);
  const inSites = sites.reduce((n, w) => n + num(w.usedGb), 0);
  const m = margin(h.cost, h.price);
  const sync = () => void run(async () => { const r = await post<{ updated: number; note?: string }>('admin/hosting-sync', { id: h.id }); if (r.note) setErr(r.note); else setOk(t(`اتحدّث استخدام ${r.updated} موقع من المزوّد.`, `Refreshed the usage of ${r.updated} websites from the provider.`)); }, '');
  return (
    <Page title={String(h.plan)} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...h })}>{t('تعديل', 'Edit')}</button><Link to="/admin/hosting" className="btn btn-ghost btn-sm">{t('← الاستضافة', '← Hosting')}</Link></div>}>
      <Notice err={err || error} ok={ok} />
      <Strip items={[[t('الحالة', 'Status'), <StatusTag s={h.status as 'active'} />], [t('المساحة', 'Disk'), <span className="latin">{gb(h.usedGb)} / {gb(h.diskGb)}</span>], [t('المواقع', 'Websites'), <span className="latin">{sites.length}</span>], [t('تكلفة → بيع', 'Cost → price'), <span className="latin">{num(h.cost)} → {num(h.price)} {cur}</span>], [t('التجديد', 'Renews'), <Ltr>{String(h.expires || '-')}</Ltr>]]} />
      <div className="cust-layout">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[['overview', t('نظرة عامة', 'Overview')], ['websites', t('المواقع', 'Websites'), sites.length], ['domains', t('الدومينات', 'Domains'), doms.length], ['email', t('الإيميلات', 'Email'), mails.length], ['billing', t('الفواتير والتكلفة', 'Billing')]]} />
          {tab === 'overview' && (
            <div className="card">
              <h3>{t('حجم الاستضافة', 'Hosting size')}</h3>
              <p className="muted latin">{gb(h.usedGb)} / {gb(h.diskGb)} · {Math.round(used)}%</p><Meter value={used} tone={used > 85 ? 'warn' : undefined} />
              <h3 style={{ marginTop: 18 }}>{t('توزيع المساحة على المواقع', 'Space across the websites')}</h3>
              <p className="muted latin">{t('مخصص', 'Allotted')}: {gb(allotted)} · {t('مستخدم', 'In use')}: {gb(inSites)} · {t('متاح للتوزيع', 'Left to allot')}: {gb(Math.max(0, num(h.diskGb) - allotted))}</p>
              <div className="linked">{sites.map((w) => <div key={w.id}><Link className="link" to={`/admin/websites/${w.id}`}><Ltr>{String(w.name)}</Ltr></Link><span style={{ minWidth: 200 }}><span className="latin muted">{gb(w.usedGb)} / {gb(w.diskGb)}</span><Meter value={pctUsed(w)} tone={pctUsed(w) > 85 ? 'warn' : undefined} /></span></div>)}{sites.length === 0 && <p className="muted">{t('مفيش مواقع مربوطة.', 'No websites linked.')}</p>}</div>
              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setUsage(Object.fromEntries(sites.map((w) => [w.id, { diskGb: String(num(w.diskGb)), usedGb: String(num(w.usedGb)) }])))}>{t('تحديث المساحة والاستخدام', 'Update space & usage')}</button>
                <button className="btn btn-ghost btn-sm" disabled={h.provider !== 'hostinger'} onClick={sync}>{t('جلب من المزوّد', 'Fetch from the provider')}</button>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>{t('Hostinger API ما بيرجّعش المساحة المستخدمة لكل موقع، فبنحدّثها هنا (نافذة واحدة لكل مواقع الاستضافة). لو المزوّد رجّعها بتتجلب تلقائيًا.', 'The Hostinger API does not return the disk used per website, so you update it here (one window for every site on this hosting). If the provider returns it, it is fetched automatically.')}</p>
            </div>
          )}
          {tab === 'websites' && (
            <>
              <div className="linked">
                {sites.map((w) => <div key={w.id}><Link className="link" to={`/admin/websites/${w.id}`}><Ltr>{String(w.name)}</Ltr></Link><span><span className="latin muted">{gb(w.usedGb)} / {gb(w.diskGb)}</span> <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/item-save', { item: { ...w, hostingId: '' } }, { res: 'websites' }), t('اتفكّ الربط.', 'Unlinked.'))}>{t('فك الربط', 'Unlink')}</button></span></div>)}
                {sites.length === 0 && <p className="muted">{t('مفيش مواقع مربوطة.', 'No websites linked.')}</p>}
              </div>
              {free.length > 0 && <div className="inline-form" style={{ gridTemplateColumns: '1fr auto', marginTop: 12 }}><div className="field"><label htmlFor="hl">{t('اربط موقع للعميل ده', 'Link one of this client’s websites')}</label><select id="hl" className="select" value={link} onChange={(e) => setLink(e.target.value)}><option value="">…</option>{free.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</select></div>
                <button className="btn btn-primary" disabled={!link} onClick={() => { const w = free.find((x) => x.id === link)!; void run(() => post('admin/item-save', { item: { ...w, hostingId: h.id } }, { res: 'websites' }), t('اتربط.', 'Linked.')).then(() => setLink('')); }}>{t('ربط', 'Link')}</button></div>}
            </>
          )}
          {tab === 'domains' && <div className="linked">{doms.map((d) => <div key={d.id}><Link className="link" to={`/admin/domains/${d.id}`}><Ltr>{String(d.name)}</Ltr></Link><StatusTag s={d.status as 'active'} /></div>)}{doms.length === 0 && <p className="muted">{t('مفيش دومينات مرتبطة.', 'No domains linked.')}</p>}</div>}
          {tab === 'email' && <Table head={[t('الإيميل', 'Address'), t('المساحة', 'Usage')]} empty={mails.length === 0 ? t('مفيش إيميلات على دومينات الاستضافة.', 'No mailboxes on this hosting’s domains.') : undefined}>{mails.map((x) => <tr key={x.id}><td><Ltr>{String(x.address)}</Ltr></td><td className="latin">{num(x.usedGb)} / {num(x.quotaGb)} GB</td></tr>)}</Table>}
          {tab === 'billing' && <div className="card"><Kv rows={[[t('المزوّد', 'Provider'), String(h.provider || '-')], [t('دورة الدفع', 'Billing'), h.billing === 'yearly' ? t('سنوي', 'Yearly') : t('شهري', 'Monthly')], [t('تكلفتك', 'Your cost'), <span className="latin">{num(h.cost)} {cur}</span>], [t('سعر العميل', 'Client price'), <span className="latin">{num(h.price)} {cur}</span>], [t('المكسب', 'Margin'), m !== null ? `${m}%` : '-'], [t('التجديد القادم', 'Next renewal'), <Ltr>{String(h.expires || '-')}</Ltr>]]} />
            <p className="muted" style={{ marginTop: 12 }}><Link className="link" to="/admin/purchases">{t('فواتير الشراء', 'Purchase bills')}</Link></p></div>}
        </div>
        <aside>
          <SideCard title={t('العميل', 'Client')}><ClientLine users={all.users} uid={h.uid} /></SideCard>
          <SideCard title={t('الدومين', 'Domain')}>{h.domain ? <Ltr>{String(h.domain)}</Ltr> : <span className="muted">-</span>}</SideCard>
        </aside>
      </div>
      {usage && (
        <Modal title={t('المساحة والاستخدام', 'Space & usage')} wide onClose={() => setUsage(null)}>
          <p className="muted">{t('المساحة المخصصة والمستخدمة (GB) لكل موقع على الاستضافة دي.', 'The allotted and used space (GB) of every website on this hosting.')}</p>
          <Table head={[t('الموقع', 'Website'), t('المخصص (GB)', 'Allotted (GB)'), t('المستخدم (GB)', 'Used (GB)')]} empty={sites.length === 0 ? t('مفيش مواقع مربوطة.', 'No websites linked.') : undefined}>
            {sites.map((w) => (
              <tr key={w.id}><td><Ltr>{String(w.name)}</Ltr></td>
                <td><input className="input latin" type="number" min={0} step="any" aria-label={`${w.name} allotted`} style={{ height: 38, width: 110 }} value={usage[w.id]?.diskGb ?? ''} onChange={(e) => setUsage({ ...usage, [w.id]: { ...usage[w.id], diskGb: e.target.value } })} /></td>
                <td><input className="input latin" type="number" min={0} step="any" aria-label={`${w.name} used`} style={{ height: 38, width: 110 }} value={usage[w.id]?.usedGb ?? ''} onChange={(e) => setUsage({ ...usage, [w.id]: { ...usage[w.id], usedGb: e.target.value } })} /></td></tr>
            ))}
          </Table>
          <div className="field"><label htmlFor="hu-used">{t('المستخدم من الاستضافة كلها (GB)', 'Used on the whole hosting (GB)')}</label><input id="hu-used" className="input latin" type="number" min={0} step="any" style={{ maxWidth: 200 }} value={String(h.usedGb ?? '')} readOnly /><small className="muted">{t('بيتحسب من مجموع المواقع عند الحفظ.', 'Calculated from the sum of the sites when you save.')}</small></div>
          <button className="btn btn-accent" onClick={() => void run(async () => {
            let total = 0;
            for (const w of sites) { const u = usage[w.id]; const used = Number(u?.usedGb) || 0; total += used; await post('admin/item-save', { item: { ...w, diskGb: Number(u?.diskGb) || 0, usedGb: used } }, { res: 'websites' }); }
            if (sites.length) await post('admin/item-save', { item: { ...h, usedGb: Math.round(total * 100) / 100 } }, { res: 'hosting' });
          }, t('اتحدّثت المساحة.', 'Space updated.')).then((r) => { if (r) setUsage(null); })}>{t('حفظ', 'Save')}</button>
        </Modal>
      )}
      {edit && (
        <Modal title={t('تعديل الاستضافة', 'Edit hosting')} wide onClose={() => setEdit(null)}>
          <form className="admin-form" style={{ marginBlock: 0 }} onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => post('admin/item-save', { item: edit }, { res: 'hosting' }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setEdit(null); }); }}>
            <Field id="hd-uid" label={t('العميل', 'Client')}><select id="hd-uid" className="select" value={String(edit.uid)} onChange={(e) => setEdit({ ...edit, uid: e.target.value })}>{all.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></Field>
            <Field id="hd-plan" label={t('الخطة', 'Plan')}><input id="hd-plan" className="input" required value={String(edit.plan ?? '')} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} /></Field>
            <Field id="hd-dom" label={t('الدومين', 'Domain')}><input id="hd-dom" className="input latin" value={String(edit.domain ?? '')} onChange={(e) => setEdit({ ...edit, domain: e.target.value })} /></Field>
            <Field id="hd-st" label={t('الحالة', 'Status')}><select id="hd-st" className="select" value={String(edit.status)} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{STATUS.filter((s) => s[0] !== 'expiring').map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></Field>
            <Field id="hd-disk" label={t('المساحة (GB)', 'Disk (GB)')}><input id="hd-disk" className="input latin" type="number" min={0} step="any" value={String(edit.diskGb ?? '')} onChange={(e) => setEdit({ ...edit, diskGb: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field id="hd-used" label={t('المستخدم (GB)', 'Used (GB)')}><input id="hd-used" className="input latin" type="number" min={0} step="any" value={String(edit.usedGb ?? '')} onChange={(e) => setEdit({ ...edit, usedGb: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field id="hd-pv" label={t('المزوّد', 'Provider')}><select id="hd-pv" className="select" value={String(edit.provider ?? '')} onChange={(e) => setEdit({ ...edit, provider: e.target.value })}><option value="">{t('بدون', 'None')}</option>{PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Field id="hd-bl" label={t('دورة الدفع للمزوّد', 'Provider billing')}><select id="hd-bl" className="select" value={String(edit.billing || 'monthly')} onChange={(e) => setEdit({ ...edit, billing: e.target.value })}><option value="monthly">{t('شهري', 'Monthly')}</option><option value="yearly">{t('سنوي', 'Yearly')}</option></select></Field>
            <Field id="hd-co" label={`${t('تكلفتك', 'Your cost')} · ${cur}`}><input id="hd-co" className="input latin" type="number" min={0} step="any" value={String(edit.cost ?? '')} onChange={(e) => setEdit({ ...edit, cost: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field id="hd-pr" label={`${t('سعر العميل', 'Client price')} · ${cur}`}><input id="hd-pr" className="input latin" type="number" min={0} step="any" value={String(edit.price ?? '')} onChange={(e) => setEdit({ ...edit, price: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field id="hd-ex" label={t('التجديد القادم', 'Next renewal')}><input id="hd-ex" className="input" type="date" value={String(edit.expires ?? '')} onChange={(e) => setEdit({ ...edit, expires: e.target.value })} /></Field>
            <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
          </form>
        </Modal>
      )}
    </Page>
  );
}

/* ───────── One customer ───────── */
const SECTIONS: { key: string; res: string; ar: string; en: string; to: string; label: (it: Item) => string }[] = [
  { key: 'domains', res: 'domains', ar: 'الدومينات', en: 'Domains', to: '/admin/domains', label: (it) => String(it.name) },
  { key: 'hosting', res: 'hosting', ar: 'الاستضافة', en: 'Hosting', to: '/admin/hosting', label: (it) => `${it.plan}${it.domain ? ` · ${it.domain}` : ''}` },
  { key: 'websites', res: 'websites', ar: 'المواقع', en: 'Websites', to: '/admin/websites', label: (it) => String(it.name) },
  { key: 'mailboxes', res: 'mailboxes', ar: 'الإيميلات', en: 'Email', to: '/admin/email', label: (it) => String(it.address) },
  { key: 'servers', res: 'servers', ar: 'السيرفرات', en: 'Servers', to: '/admin/servers', label: (it) => `${it.name}${it.ip ? ` · ${it.ip}` : ''}` },
  { key: 'invoices', res: 'invoices', ar: 'الفواتير', en: 'Invoices', to: '/admin/invoices', label: (it) => `${it.number ?? ''} ${it.item} — ${it.amount}` },
];
const itemPath = (res: string, it: Item) => (res === 'domains' ? `/admin/domains/${it.id}` : res === 'hosting' ? `/admin/hosting/${it.id}` : res === 'websites' ? `/admin/websites/${it.id}` : null);

export function AdminUserDetail() {
  const { t } = useI18n();
  const cur = useCurrency();
  const nav = useNavigate();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const { err, ok, run } = useActions(load);
  const [tab, setTab] = useState<string>('overview');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [pass, setPass] = useState('');
  const [edit, setEdit] = useState<{ name: string; email: string; phone: string; company: string } | null>(null);
  const u = all?.users.find((x) => x.id === id);
  if (!all || !u) return <Page title={t('العميل', 'Customer')}><Notice err={error} ok="" /><Link to="/admin/users" className="btn btn-ghost btn-sm">{t('← العملاء', '← Customers')}</Link></Page>;
  const owner = (uid: string) => all.users.find((x) => x.id === uid)?.name ?? '-';
  const mine = (res: string) => all.items[res].filter((x) => x.uid === u.id);
  const tickets = all.tickets.filter((x) => x.uid === u.id);
  const dueTotal = mine('invoices').filter((i) => i.status === 'due').reduce((s, i) => s + num(i.amount), 0);
  const paidTotal = mine('invoices').filter((i) => i.status === 'paid').reduce((s, i) => s + num(i.amount), 0);
  const services = SECTIONS.filter((x) => x.res !== 'invoices').reduce((n, x) => n + mine(x.res).length, 0);
  const move = (res: string, itemId: string) => { const it = all.items[res].find((x) => x.id === itemId); if (it) void run(() => post('admin/item-save', { item: { ...it, uid: u.id } }, { res }), t('اتربط بالعميل.', 'Linked to the client.')).then(() => setPick({ ...pick, [res]: '' })); };
  const section = SECTIONS.find((x) => x.key === tab);
  return (
    <Page title={u.name} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => setEdit({ name: u.name, email: u.email, phone: u.phone ?? '', company: u.company ?? '' })}>{t('تعديل', 'Edit')}</button><Link to="/admin/users" className="btn btn-ghost btn-sm">{t('← العملاء', '← Customers')}</Link></div>}>
      <Notice err={err || error} ok={ok} />
      <Strip items={[[t('الخدمات', 'Services'), <span className="latin">{services}</span>], [t('مدفوع', 'Paid'), <span className="latin">{paidTotal} {cur}</span>], [t('مستحق', 'Due'), <span className="latin">{dueTotal} {cur}</span>], [t('عميل من', 'Customer since'), <Ltr>{day(String(u.created ?? '')) || '-'}</Ltr>], [t('تذاكر', 'Tickets'), <span className="latin">{tickets.length}</span>]]} />
      <div className="cust-layout">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[['overview', t('نظرة عامة', 'Overview')], ...SECTIONS.map((s) => [s.key, t(s.ar, s.en), mine(s.res).length] as [string, string, number]), ['tickets', t('التذاكر', 'Tickets'), tickets.length]]} />
          {tab === 'overview' && (
            <div className="card"><Kv rows={SECTIONS.map((s) => [t(s.ar, s.en), <button className="link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setTab(s.key)}><span className="latin">{mine(s.res).length}</span></button>] as [string, React.ReactNode])} />
              <h3 style={{ marginTop: 18 }}>{t('الدومينات', 'Domains')}</h3><div className="linked">{mine('domains').slice(0, 5).map((d) => <div key={d.id}><Link className="link" to={`/admin/domains/${d.id}`}><Ltr>{String(d.name)}</Ltr></Link><StatusTag s={d.status as 'active'} /></div>)}{mine('domains').length === 0 && <p className="muted">{t('مفيش.', 'None.')}</p>}</div></div>
          )}
          {section && (
            <>
              <div className="linked">
                {mine(section.res).map((it) => { const path = itemPath(section.res, it); return <div key={it.id}>{path ? <Link className="link" to={path}>{section.label(it)}</Link> : <span>{section.label(it)}</span>}{it.status ? <StatusTag s={it.status as 'active'} /> : null}</div>; })}
                {mine(section.res).length === 0 && <p className="muted">{t('مفيش.', 'None.')}</p>}
              </div>
              <div className="inline-form" style={{ gridTemplateColumns: '1fr auto auto', marginTop: 12, marginBottom: 8 }}>
                <div className="field"><label htmlFor={`lk-${section.res}`}>{t('ربط عنصر موجود بالعميل', 'Link an existing item to this client')}</label>
                  <select id={`lk-${section.res}`} className="select" value={pick[section.res] ?? ''} onChange={(e) => setPick({ ...pick, [section.res]: e.target.value })}><option value="">…</option>{all.items[section.res].filter((x) => x.uid !== u.id).map((x) => <option key={x.id} value={x.id}>{section.label(x)} — {owner(x.uid)}</option>)}</select></div>
                <button className="btn btn-primary btn-sm" disabled={!pick[section.res]} onClick={() => move(section.res, pick[section.res])}>{t('ربط', 'Link')}</button>
                <Link className="btn btn-ghost btn-sm" to={section.to}>{t('+ جديد', '+ New')}</Link>
              </div>
            </>
          )}
          {tab === 'tickets' && <div className="linked">{tickets.map((x) => <div key={x.id}><Link className="link" to="/admin/tickets">{x.subject}</Link><span className="tag">{x.status}</span></div>)}{tickets.length === 0 && <p className="muted">{t('مفيش.', 'None.')}</p>}</div>}
        </div>
        <aside>
          <SideCard title={t('بيانات التواصل', 'Contact information')}>
            <a className="link latin" dir="ltr" href={`mailto:${u.email}`}>{u.email}</a>
            {u.phone ? <a className="link latin" dir="ltr" href={`tel:${u.phone}`}>{u.phone}</a> : <p className="muted">{t('مفيش موبايل مسجّل.', 'No phone on file.')}</p>}
            {u.phone && <a className="link" href={`https://wa.me/${u.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
            {u.company && <p><b>{t('الشركة', 'Company')}:</b> {u.company}</p>}
          </SideCard>
          <SideCard title={t('الحساب', 'Account')}>
            <p><span className={`tag ${u.role === 'admin' ? 'dark' : ''}`}>{u.role === 'admin' ? t('أدمن', 'Admin') : t('عميل', 'Client')}</span> {u.source === 'signup' && <span className="tag">{t('سجّل من الموقع', 'Signed up on the website')}</span>}</p>
            <p className="muted">{t('تاريخ التسجيل', 'Registered')}: <Ltr>{day(String(u.created ?? '')) || '-'}</Ltr></p>
            <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/user-update', { id: u.id, password: pass }), t('تم تغيير كلمة السر.', 'Password changed.')).then(() => setPass('')); }}>
              <input className="input latin" type="password" minLength={8} required autoComplete="new-password" placeholder={t('كلمة سر جديدة (8+)', 'New password (8+)')} value={pass} onChange={(e) => setPass(e.target.value)} />
              <button className="btn btn-ghost btn-sm" type="submit">{t('تغيير', 'Change')}</button>
            </form>
            <div className="row-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/user-update', { id: u.id, role: u.role === 'admin' ? 'client' : 'admin' }), t('تم تغيير النوع.', 'Role changed.'))}>{u.role === 'admin' ? t('خفّض لعميل', 'Make client') : t('اجعله أدمن', 'Make admin')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف الحساب وكل خدماته وتذاكره؟', 'Delete the account with all its services and tickets?'))) void run(() => post('admin/user-delete', { id: u.id }), t('تم الحذف.', 'Deleted.')).then((r) => { if (r) nav('/admin/users'); }); }}>{t('حذف', 'Delete')}</button>
            </div>
          </SideCard>
        </aside>
      </div>
      {edit && (
        <Modal title={t('تعديل بيانات العميل', 'Edit customer')} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => post('admin/user-update', { id: u.id, ...edit }), t('اتحفظ.', 'Saved.')).then((r) => { if (r) setEdit(null); }); }}>
            <Field id="cu-n" label={t('الاسم', 'Name')}><input id="cu-n" className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field id="cu-e" label={t('الإيميل', 'Email')}><input id="cu-e" className="input latin" type="email" required value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field id="cu-p" label={t('الموبايل', 'Phone')}><input id="cu-p" className="input latin" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field id="cu-c" label={t('الشركة', 'Company')}><input id="cu-c" className="input" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></Field>
            <button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button>
          </form>
        </Modal>
      )}
    </Page>
  );
}
