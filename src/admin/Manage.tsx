import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSite, useCurrency } from '../site/settings';
import { Ltr, useI18n } from '../i18n';
import { api, post, type User } from '../lib/api';
import type { DnsRec, Lead, Settings, Ticket } from '../lib/types';
import { day, InvoiceTag, Page, StatusTag, Table, TicketTag } from '../ui';
import { errText } from './errors';

type Item = { id: string; uid: string; [k: string]: unknown };
type Opt = [string, string, string]; // value, ar, en
type Field = { key: string; label: [string, string]; type: 'text' | 'number' | 'date' | 'select' | 'bool'; options?: Opt[]; latin?: boolean; req?: boolean };

function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api<{ users: User[] }>('admin/users').then((r) => setUsers(r.users)).catch(() => undefined); }, []);
  return users;
}

function Notice({ err, ok }: { err: string; ok: string }) {
  return <>{err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}</>;
}

/* ───────── DNS editor (admin side of the same svc/dns-* routes the client uses) ───────── */
function DnsAdmin({ domainId, records, onChange }: { domainId: string; records: DnsRec[]; onChange: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: 'A', host: '', value: '', ttl: 3600 });
  const [err, setErr] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    try { await post('svc/dns-save', { id: domainId, ...f }); setF({ ...f, host: '', value: '' }); onChange(); } catch (x) { setErr(errText(x, t)); }
  };
  const del = async (rid: string) => { try { await post('svc/dns-delete', { id: domainId, rid }); onChange(); } catch (x) { setErr(errText(x, t)); } };
  return (
    <div style={{ marginTop: 12 }}>
      <h3 className="sub" style={{ margin: '0 0 8px', fontSize: 15 }}>{t('سجلات DNS', 'DNS records')}</h3>
      <div className="dns">
        <div className="dns-row dns-head"><span>TYPE</span><span>HOST</span><span>VALUE</span><span>TTL</span><span /></div>
        {records.length === 0 && <div className="dns-empty nt-hatch-dark">{t('مفيش سجلات', 'No records')}</div>}
        {records.map((r) => <div className="dns-row" key={r.id}><span>{r.type}</span><span>{r.host}</span><span>{r.value}</span><span>{r.ttl}</span><button type="button" className="dns-del" onClick={() => void del(r.id)} aria-label={t('حذف', 'Delete')}>×</button></div>)}
      </div>
      {err && <div className="form-error" style={{ marginTop: 8 }}>{err}</div>}
      <div className="dns-form">
        <select className="select" aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map((x) => <option key={x}>{x}</option>)}</select>
        <input className="input latin" aria-label="Host" placeholder="@ / www" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} />
        <input className="input latin" aria-label="Value" placeholder={t('القيمة', 'Value')} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        <select className="select" aria-label="TTL" value={f.ttl} onChange={(e) => setF({ ...f, ttl: Number(e.target.value) })}>{[300, 3600, 14400, 86400].map((x) => <option key={x}>{x}</option>)}</select>
        <button type="button" className="btn btn-primary" disabled={!f.value.trim()} onClick={(e) => void add(e as unknown as FormEvent)}>{t('إضافة', 'Add')}</button>
      </div>
    </div>
  );
}

/* ───────── Generic resource manager ───────── */
type Col = { label: [string, string]; render: (it: Item, owner: string) => ReactNode };

function ResourcePage({ res, title, newLabel, fields, defaults, columns, actions }: {
  res: string; title: [string, string]; newLabel: [string, string]; fields: Field[]; defaults: Record<string, unknown>; columns: Col[];
  actions?: (it: Item, run: (fn: () => Promise<unknown>, done: string) => Promise<boolean>) => ReactNode;
}) {
  const { t } = useI18n();
  const users = useUsers();
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const owner = (uid: string) => users.find((u) => u.id === uid)?.name ?? '-';

  const load = useCallback(() => { api<{ items: Item[] }>('admin/items', undefined, { res }).then((r) => setItems(r.items)).catch((e) => setErr(errText(e, t))); }, [res, t]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (form && await run(() => post('admin/item-save', { item: form }, { res }), t('تم الحفظ.', 'Saved.'))) setForm(null);
  };
  const liveForm = form && form.id ? items.find((i) => i.id === form.id) : null;

  return (
    <Page title={t(title[0], title[1])} action={<button className="btn btn-primary btn-sm" onClick={() => setForm(form ? null : { uid: users.find((u) => u.role === 'client')?.id ?? users[0]?.id ?? '', ...defaults })}>{form ? t('إلغاء', 'Cancel') : t(newLabel[0], newLabel[1])}</button>}>
      <Notice err={err} ok={ok} />
      {form && (
        <form className="card admin-form" onSubmit={save}>
          <div className="field"><label htmlFor="f-uid">{t('العميل', 'Client')}</label>
            <select id="f-uid" className="select" required value={String(form.uid ?? '')} onChange={(e) => setForm({ ...form, uid: e.target.value })}>
              <option value="" disabled>{t('اختر عميل', 'Choose a client')}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select></div>
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`f-${f.key}`}>{t(f.label[0], f.label[1])}</label>
              {f.type === 'select' ? (
                <select id={`f-${f.key}`} className="select" value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>{f.options!.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select>
              ) : f.type === 'bool' ? (
                <label className="check"><input id={`f-${f.key}`} type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} /> {t('نعم', 'Yes')}</label>
              ) : (
                <input id={`f-${f.key}`} className={`input${f.latin ? ' latin' : ''}`} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? 0 : undefined}
                  required={f.req} value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} />
              )}
            </div>
          ))}
          <div className="admin-form-actions"><button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button></div>
          {res === 'domains' && liveForm && <div style={{ gridColumn: '1 / -1' }}><DnsAdmin domainId={liveForm.id} records={(liveForm.dns as DnsRec[]) ?? []} onChange={load} /></div>}
        </form>
      )}
      <Table head={[...columns.map((c) => t(c.label[0], c.label[1])), t('العميل', 'Client'), '']} empty={items.length === 0 ? t('مفيش عناصر لسه.', 'Nothing here yet.') : undefined}>
        {items.map((it) => (
          <Fragment key={it.id}>
            <tr>
              {columns.map((c, i) => <td key={i}>{c.render(it, owner(it.uid))}</td>)}
              <td>{owner(it.uid)}</td>
              <td><div className="row-actions">
                {actions?.(it, run)}
                <button className="btn btn-ghost btn-sm" onClick={() => { setOk(''); setForm({ ...it }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('تعديل', 'Edit')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف العنصر ده؟', 'Delete this item?'))) void run(() => post('admin/item-delete', { id: it.id }, { res }), t('تم الحذف.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button>
              </div></td>
            </tr>
          </Fragment>
        ))}
      </Table>
    </Page>
  );
}

const statusOpts: Opt[] = [['active', 'نشط', 'Active'], ['pending', 'قيد التفعيل', 'Pending'], ['stopped', 'متوقف', 'Stopped']];
const num = (v: unknown) => Number(v ?? 0);
const providerOpts: Opt[] = [['', 'بدون', 'None'], ['hostinger', 'Hostinger', 'Hostinger'], ['namecheap', 'Namecheap', 'Namecheap'], ['resellerclub', 'ResellerClub', 'ResellerClub']];

/** Provider, what it costs us and what the client pays, with the margin between them. */
function CostCell({ it }: { it: Item }) {
  const cur = useCurrency();
  const cost = num(it.cost), price = num(it.price);
  if (!it.provider && !cost && !price) return <>-</>;
  const margin = cost > 0 && price > 0 ? Math.round(((price - cost) / cost) * 100) : null;
  return <span className="latin">{String(it.provider || '-')} · {cost} → {price} {cur}{margin !== null ? ` (${margin}%)` : ''}{it.billing ? ` / ${it.billing === 'yearly' ? 'yr' : 'mo'}` : ''}</span>;
}
const status = (it: Item) => <StatusTag s={it.status as 'active'} />;

export const AdminDomains = () => (
  <ResourcePage res="domains" title={['الدومينات', 'Domains']} newLabel={['+ دومين', '+ Domain']} defaults={{ name: '', status: 'active', expires: '', autoRenew: true, provider: '', cost: 0, price: 0 }}
    fields={[
      { key: 'name', label: ['الدومين', 'Domain'], type: 'text', latin: true, req: true },
      { key: 'status', label: ['الحالة', 'Status'], type: 'select', options: [...statusOpts.slice(0, 2), ['expiring', 'قرب ينتهي', 'Expiring'], statusOpts[2]] },
      { key: 'expires', label: ['ينتهي في', 'Expires'], type: 'date' },
      { key: 'autoRenew', label: ['تجديد تلقائي', 'Auto-renew'], type: 'bool' },
      { key: 'provider', label: ['المزوّد', 'Provider'], type: 'select', options: providerOpts },
      { key: 'cost', label: ['تكلفتك (سنة)', 'Your cost (per year)'], type: 'number' },
      { key: 'price', label: ['سعر البيع للعميل (سنة)', 'Client price (per year)'], type: 'number' },
    ]}
    columns={[
      { label: ['الدومين', 'Domain'], render: (it) => <Ltr>{String(it.name)}</Ltr> }, { label: ['الحالة', 'Status'], render: status },
      { label: ['ينتهي', 'Expires'], render: (it) => <Ltr>{String(it.expires || '-')}</Ltr> }, { label: ['سجلات DNS', 'DNS'], render: (it) => <span className="latin">{((it.dns as unknown[]) ?? []).length}</span> },
      { label: ['المزوّد / التكلفة / البيع', 'Provider / cost / price'], render: (it) => <CostCell it={it} /> },
    ]} />
);

export const AdminMailboxes = () => (
  <ResourcePage res="mailboxes" title={['الإيميلات', 'Email']} newLabel={['+ صندوق إيميل', '+ Mailbox']} defaults={{ address: '', quotaGb: 5, usedGb: 0, status: 'active' }}
    fields={[
      { key: 'address', label: ['الإيميل', 'Address'], type: 'text', latin: true, req: true },
      { key: 'quotaGb', label: ['المساحة (GB)', 'Quota (GB)'], type: 'number' }, { key: 'usedGb', label: ['المستخدم (GB)', 'Used (GB)'], type: 'number' },
      { key: 'status', label: ['الحالة', 'Status'], type: 'select', options: statusOpts },
    ]}
    columns={[
      { label: ['الإيميل', 'Address'], render: (it) => <Ltr>{String(it.address)}</Ltr> },
      { label: ['المساحة', 'Usage'], render: (it) => <span className="latin">{num(it.usedGb)} / {num(it.quotaGb)} GB</span> }, { label: ['الحالة', 'Status'], render: status },
    ]} />
);

export const AdminHosting = () => (
  <ResourcePage res="hosting" title={['الاستضافة', 'Hosting']} newLabel={['+ خطة استضافة', '+ Hosting plan']} defaults={{ plan: 'Business', domain: '', diskGb: 50, usedGb: 0, status: 'active', provider: '', cost: 0, billing: 'monthly', expires: '', price: 0 }}
    fields={[
      { key: 'plan', label: ['الخطة', 'Plan'], type: 'text', req: true }, { key: 'domain', label: ['الدومين', 'Domain'], type: 'text', latin: true },
      { key: 'diskGb', label: ['المساحة (GB)', 'Disk (GB)'], type: 'number' }, { key: 'usedGb', label: ['المستخدم (GB)', 'Used (GB)'], type: 'number' },
      { key: 'status', label: ['الحالة', 'Status'], type: 'select', options: statusOpts },
      { key: 'provider', label: ['المزوّد', 'Provider'], type: 'select', options: providerOpts },
      { key: 'billing', label: ['دورة الدفع للمزوّد', 'Provider billing'], type: 'select', options: [['monthly', 'شهري', 'Monthly'], ['yearly', 'سنوي', 'Yearly']] },
      { key: 'cost', label: ['تكلفتك (لكل دورة)', 'Your cost (per cycle)'], type: 'number' },
      { key: 'price', label: ['سعر البيع للعميل (لكل دورة)', 'Client price (per cycle)'], type: 'number' },
      { key: 'expires', label: ['التجديد القادم', 'Next renewal'], type: 'date' },
    ]}
    columns={[
      { label: ['الخطة', 'Plan'], render: (it) => String(it.plan) }, { label: ['الدومين', 'Domain'], render: (it) => <Ltr>{String(it.domain || '-')}</Ltr> },
      { label: ['المساحة', 'Disk'], render: (it) => <span className="latin">{num(it.usedGb)} / {num(it.diskGb)} GB</span> }, { label: ['الحالة', 'Status'], render: status },
      { label: ['المزوّد / التكلفة / البيع', 'Provider / cost / price'], render: (it) => <CostCell it={it} /> },
      { label: ['التجديد', 'Renews'], render: (it) => <Ltr>{String(it.expires || '-')}</Ltr> },
    ]} />
);

export const AdminServers = () => (
  <ResourcePage res="servers" title={['السيرفرات', 'Servers']} newLabel={['+ سيرفر', '+ Server']} defaults={{ name: '', ip: '', spec: '1 vCPU · 2 GB · 40 GB', cpu: 0, ram: 0, status: 'active' }}
    fields={[
      { key: 'name', label: ['الاسم', 'Name'], type: 'text', latin: true, req: true }, { key: 'ip', label: ['IP', 'IP'], type: 'text', latin: true },
      { key: 'spec', label: ['المواصفات', 'Spec'], type: 'text' }, { key: 'cpu', label: ['CPU %', 'CPU %'], type: 'number' }, { key: 'ram', label: ['RAM %', 'RAM %'], type: 'number' },
      { key: 'status', label: ['الحالة', 'Status'], type: 'select', options: statusOpts },
    ]}
    columns={[
      { label: ['الاسم', 'Name'], render: (it) => <Ltr>{String(it.name)}</Ltr> }, { label: ['IP', 'IP'], render: (it) => <Ltr>{String(it.ip || '-')}</Ltr> },
      { label: ['المواصفات', 'Spec'], render: (it) => <Ltr>{String(it.spec || '-')}</Ltr> }, { label: ['الحالة', 'Status'], render: status },
    ]} />
);

export function AdminInvoices() {
  const { t } = useI18n();
  const cur = useCurrency();
  return (
    <ResourcePage res="invoices" title={['الفواتير', 'Invoices']} newLabel={['+ فاتورة', '+ Invoice']} defaults={{ item: '', amount: 0, date: '', status: 'due' }}
      fields={[
        { key: 'item', label: ['البند', 'Item'], type: 'text', req: true }, { key: 'amount', label: ['المبلغ', 'Amount'], type: 'number', req: true }, { key: 'date', label: ['التاريخ', 'Date'], type: 'date' },
        { key: 'status', label: ['الحالة', 'Status'], type: 'select', options: [['due', 'مستحقة', 'Due'], ['paid', 'مدفوعة', 'Paid'], ['void', 'ملغاة', 'Void']] },
      ]}
      columns={[
        { label: ['الرقم', 'No.'], render: (it) => <Ltr>{String(it.number ?? '-')}</Ltr> }, { label: ['البند', 'Item'], render: (it) => String(it.item) },
        { label: ['المبلغ', 'Amount'], render: (it) => <span><b className="latin">{num(it.amount)}</b> {cur}</span> }, { label: ['التاريخ', 'Date'], render: (it) => <Ltr>{day(String(it.date))}</Ltr> },
        { label: ['الحالة', 'Status'], render: (it) => <InvoiceTag s={it.status as 'due'} /> },
      ]}
      actions={(it, run) => it.status === 'due' ? <button className="btn btn-accent btn-sm" onClick={() => void run(() => post('admin/item-save', { item: { ...it, status: 'paid' } }, { res: 'invoices' }), t('تم تسجيل الدفع.', 'Marked as paid.'))}>{t('تم الدفع', 'Mark paid')}</button> : null} />
  );
}

/* ───────── Tickets ───────── */
export function AdminTickets() {
  const { t } = useI18n();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'answered' | 'closed'>('all');
  const load = useCallback(() => { api<{ tickets: Ticket[] }>('admin/tickets').then((r) => setTickets(r.tickets)).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };
  const shown = tickets.filter((k) => filter === 'all' || k.status === filter);
  const cur = tickets.find((k) => k.id === open);
  return (
    <Page title={t('تذاكر الدعم', 'Support tickets')} action={<select className="select" style={{ width: 'auto', height: 38 }} aria-label="filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
      <option value="all">{t('الكل', 'All')}</option><option value="open">{t('مفتوحة', 'Open')}</option><option value="answered">{t('تم الرد', 'Answered')}</option><option value="closed">{t('مغلقة', 'Closed')}</option></select>}>
      {err && <div className="form-error" role="alert">{err}</div>}
      <Table head={[t('الموضوع', 'Subject'), t('العميل', 'Client'), t('آخر تحديث', 'Updated'), t('الحالة', 'Status'), '']} empty={shown.length === 0 ? t('مفيش تذاكر.', 'No tickets.') : undefined}>
        {shown.map((k) => (
          <tr key={k.id} className={k.id === open ? 'is-sel' : ''}>
            <td>{k.subject}</td><td>{k.owner}</td><td><Ltr>{day(k.updated)}</Ltr></td><td><TicketTag s={k.status} /></td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === k.id ? null : k.id)}>{t('فتح', 'Open')}</button></td>
          </tr>
        ))}
      </Table>
      {cur && (
        <div className="card thread">
          <h3>{cur.subject} <small className="muted">· {cur.owner}</small></h3>
          {cur.messages.map((m, i) => <div key={i} className={`msg ${m.from}`}><b>{m.from === 'admin' ? t('الدعم', 'Support') : m.name}</b> <span className="muted latin">{day(m.at)}</span><p>{m.text}</p></div>)}
          <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('tickets/reply', { id: cur.id, text: reply.trim() }))) setReply(''); }}>
            <textarea className="textarea" required maxLength={4000} placeholder={t('اكتب ردك…', 'Write a reply…')} value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="row-actions">
              <button className="btn btn-primary btn-sm" type="submit">{t('رد', 'Reply')}</button>
              {cur.status !== 'closed' ? <button className="btn btn-ghost btn-sm" type="button" onClick={() => void run(() => post('tickets/status', { id: cur.id, status: 'closed' }))}>{t('إغلاق', 'Close')}</button>
                : <button className="btn btn-ghost btn-sm" type="button" onClick={() => void run(() => post('tickets/status', { id: cur.id, status: 'open' }))}>{t('إعادة فتح', 'Reopen')}</button>}
            </div>
          </form>
        </div>
      )}
    </Page>
  );
}

/* ───────── Leads (contact-form inbox) ───────── */
export function AdminLeads() {
  const { t } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { api<{ leads: Lead[] }>('admin/leads').then((r) => setLeads(r.leads)).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); load(); } catch (e) { setErr(errText(e, t)); } };
  const tag = (s: Lead['status']) => <span className={`tag ${s === 'new' ? 'volt' : s === 'contacted' ? 'warn' : ''}`}>{s === 'new' ? t('جديد', 'New') : s === 'contacted' ? t('تم التواصل', 'Contacted') : t('مغلق', 'Closed')}</span>;
  return (
    <Page title={t('طلبات التواصل', 'Leads')}>
      {err && <div className="form-error" role="alert">{err}</div>}
      <Table head={[t('الاسم', 'Name'), t('الإيميل', 'Email'), t('الخدمة', 'Service'), t('التاريخ', 'Date'), t('الحالة', 'Status'), '']} empty={leads.length === 0 ? t('مفيش طلبات لسه.', 'No leads yet.') : undefined}>
        {leads.map((l) => (
          <Fragment key={l.id}>
            <tr className={l.id === open ? 'is-sel' : ''}>
              <td>{l.name}</td><td><Ltr>{l.email}</Ltr></td><td>{l.service || '-'}</td><td><Ltr>{day(l.at)}</Ltr></td><td>{tag(l.status)}</td>
              <td><div className="row-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === l.id ? null : l.id)}>{t('عرض', 'View')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف الطلب ده؟', 'Delete this lead?'))) void run(() => post('admin/lead-delete', { id: l.id })); }}>{t('حذف', 'Delete')}</button>
              </div></td>
            </tr>
            {open === l.id && (
              <tr className="edit-row"><td colSpan={6}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{l.message}</p>
                {l.phone && <p className="muted"><Ltr>{l.phone}</Ltr></p>}
                <div className="row-actions" style={{ marginTop: 10 }}>
                  <a className="btn btn-primary btn-sm" href={`mailto:${l.email}`}>{t('رد بالإيميل', 'Reply by email')}</a>
                  {(['new', 'contacted', 'closed'] as const).filter((s) => s !== l.status).map((s) => <button key={s} className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/lead-update', { id: l.id, status: s }))}>{s === 'new' ? t('اجعله جديد', 'Mark new') : s === 'contacted' ? t('تم التواصل', 'Mark contacted') : t('إغلاق', 'Close')}</button>)}
                </div>
              </td></tr>
            )}
          </Fragment>
        ))}
      </Table>
    </Page>
  );
}

/* ───────── Settings ───────── */
export function AdminSettings() {
  const { t } = useI18n();
  const { refresh } = useSite();
  const [s, setS] = useState<(Settings & { version?: string }) | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  useEffect(() => { api<Settings & { version?: string }>('admin/settings').then(setS).catch((e) => setErr(errText(e, t))); }, [t]);
  if (!s) return <Page title={t('الإعدادات', 'Settings')}>{err ? <div className="form-error">{err}</div> : <p className="muted">…</p>}</Page>;
  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setOk('');
    try { await post('admin/settings', s); setOk(t('تم الحفظ.', 'Saved.')); await refresh(); } catch (x) { setErr(errText(x, t)); }
  };
  return (
    <Page title={t('الإعدادات', 'Settings')}>
      <form className="card form" onSubmit={save} style={{ maxWidth: 560 }}>
        <Notice err={err} ok={ok} />
        <div className="field"><label htmlFor="s-site">{t('اسم الشركة', 'Company name')}</label><input id="s-site" className="input" maxLength={80} value={s.site} onChange={(e) => setS({ ...s, site: e.target.value })} /></div>
        <div className="field"><label htmlFor="s-mail">{t('إيميل استلام الطلبات', 'Email for new requests')}</label><input id="s-mail" type="email" className="input latin" value={s.contactEmail} onChange={(e) => setS({ ...s, contactEmail: e.target.value })} placeholder="hello@company.com" /><small className="muted">{t('بيوصله إيميل مع كل طلب تواصل جديد (لو الاستضافة بتدعم mail).', 'Gets an email for every new lead (if the host supports mail).')}</small></div>
        <div className="field"><label htmlFor="s-cur">{t('العملة (تظهر في الأسعار)', 'Currency label (shown on prices)')}</label><input id="s-cur" className="input" maxLength={8} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} placeholder="EGP" /></div>
        <label className="check"><input type="checkbox" checked={s.placeholder} onChange={(e) => setS({ ...s, placeholder: e.target.checked })} /> {t('اعرض علامة "تجريبي" على الأسعار والأرقام', 'Show the "placeholder" marks on prices and numbers')}</label>
        <button className="btn btn-primary" type="submit">{t('حفظ', 'Save')}</button>
        {s.version && <p className="muted latin">v{s.version}</p>}
      </form>
    </Page>
  );
}

/* ───────── Activity ───────── */
export function AdminActivity() {
  const { t } = useI18n();
  const [log, setLog] = useState<{ at: string; by: string; action: string; detail: string }[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ log: typeof log }>('admin/activity').then((r) => setLog(r.log)).catch((e) => setErr(errText(e, t))); }, [t]);
  return (
    <Page title={t('سجل النشاط', 'Activity log')}>
      {err && <div className="form-error">{err}</div>}
      <Table head={[t('الوقت', 'Time'), t('المستخدم', 'By'), t('العملية', 'Action'), t('التفاصيل', 'Detail')]} empty={log.length === 0 ? t('مفيش نشاط لسه.', 'No activity yet.') : undefined}>
        {log.map((l, i) => <tr key={i}><td><Ltr>{l.at.replace('T', ' ').slice(0, 16)}</Ltr></td><td>{l.by}</td><td><span className="tag latin">{l.action}</span></td><td>{l.detail}</td></tr>)}
      </Table>
    </Page>
  );
}

