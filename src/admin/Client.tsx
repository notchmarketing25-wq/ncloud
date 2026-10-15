import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Ltr, useI18n } from '../i18n';
import { api, apiUrl, post } from '../lib/api';
import type { Invoice, InvItem, LedgerEntry, PayMethod, Quote } from '../lib/types';
import { QuoteTag } from '../portal/Extras';
import { IdentityFields, idOf, KycDocs, useTerms, termsAccepted } from '../portal/Identity';
import { useCurrency } from '../site/settings';
import { DomainName } from '../site/svc';
import { day, InvoiceTag, Modal, Page, StatusTag, Table } from '../ui';
import { errText } from './errors';
import { InvoiceEditor, LedgerTable } from './Invoices';
import { Field, Notice, SideCard, Tabs, useAll, type AllData, type Item } from './kit';

type U = AllData['users'][number] & { no?: number; group?: string; notes?: string; contacts?: Contact[]; taxExempt?: boolean; noReminders?: boolean; addr?: Record<string, string> };
type Contact = { id?: string; name: string; email: string; phone: string; role: string };
type AInv = Invoice & { uid: string };
type Log = { at: string; by: string; action: string; detail: string };
type MailRow = { at: string; to: string; subject: string; ok: boolean; err: string };
const num = (v: unknown) => Number(v ?? 0);
const m2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TABS = ['summary', 'profile', 'contacts', 'services', 'domains', 'billable', 'invoices', 'quotes', 'transactions', 'tickets', 'emails', 'notes', 'log'] as const;
type Tab = (typeof TABS)[number];
const SERVICE_RES: [string, string, string, string][] = [['hosting', 'استضافة', 'Hosting', '/admin/hosting'], ['websites', 'موقع', 'Website', '/admin/websites'], ['servers', 'سيرفر', 'Server', '/admin/servers'], ['mailboxes', 'إيميل', 'Mailbox', '/admin/email']];

function useActions(load: () => void) {
  const { t } = useI18n();
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); if (done) setOk(done); load(); return true; } catch (e) { setErr(errText(e, t)); return false; } };
  return { err, ok, setErr, setOk, run };
}

/* ───────── services / domains table with bulk actions ───────── */
function ServiceTable({ rows, kind, methods, run, all, uid }: { rows: { res: string; it: Item }[]; kind: 'services' | 'domains'; methods: string[]; run: (fn: () => Promise<unknown>, done: string) => Promise<boolean>; all: AllData; uid: string }) {
  const { t } = useI18n();
  const cur = useCurrency();
  const nav = useNavigate();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState('');
  const [pm, setPm] = useState('');
  const [until, setUntil] = useState('');
  const [link, setLink] = useState('');
  const ids = rows.filter((r) => sel[r.it.id]);
  const resOf = (r: { res: string }) => r.res;
  // bulk actions work on one resource at a time
  const byRes = (fn: (res: string, ids: string[]) => Promise<unknown>) => async () => { const groups: Record<string, string[]> = {}; ids.forEach((r) => { (groups[resOf(r)] ??= []).push(r.it.id); }); for (const [res, list] of Object.entries(groups)) await fn(res, list); setSel({}); };
  const apply = () => {
    if (ids.length === 0) return;
    void run(byRes(async (res, list) => {
      if (status) await post('admin/bulk', { res, ids: list, action: 'status', value: status });
      if (pm) await post('admin/bulk', { res, ids: list, action: 'payMethod', value: pm });
      if (until) await post('admin/bulk', { res, ids: list, action: 'noSuspendUntil', value: until });
    }), t('اتطبّق على المحدد.', 'Applied to the selection.'));
    setStatus(''); setPm(''); setUntil('');
  };
  const path = (res: string, it: Item) => (res === 'domains' ? `/admin/domains/${it.id}` : res === 'hosting' ? `/admin/hosting/${it.id}` : res === 'websites' ? `/admin/websites/${it.id}` : null);
  const label = (res: string, it: Item) => (res === 'domains' ? String(it.name) : res === 'hosting' ? `${String(it.plan)}${it.domain ? ` (${String(it.domain)})` : ''}` : res === 'websites' ? String(it.name) : res === 'servers' ? String(it.name) : String(it.address));
  const typeName = (res: string) => { const x = SERVICE_RES.find((r) => r[0] === res); return x ? t(x[1], x[2]) : t('دومين', 'Domain'); };
  const resList = kind === 'domains' ? ['domains'] : SERVICE_RES.map((r) => r[0]);
  const candidates = resList.flatMap((res) => (all.items[res] ?? []).filter((x) => x.uid !== uid).map((x) => ({ res, it: x })));
  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 36 }}><input type="checkbox" aria-label={t('تحديد الكل', 'Select all')} checked={rows.length > 0 && ids.length === rows.length} onChange={(e) => setSel(e.target.checked ? Object.fromEntries(rows.map((r) => [r.it.id, true])) : {})} /></th>
            <th>ID</th>{kind === 'services' && <th>{t('النوع', 'Type')}</th>}<th>{kind === 'domains' ? t('الدومين', 'Domain') : t('المنتج / الخدمة', 'Product / service')}</th>
            {kind === 'domains' && <th>{t('المسجّل', 'Registrar')}</th>}
            <th>{t('المبلغ', 'Amount')}</th>{kind === 'services' && <th>{t('دورة الدفع', 'Billing cycle')}</th>}
            <th>{kind === 'domains' ? t('تاريخ التسجيل', 'Registration date') : t('بداية الاشتراك', 'Signup date')}</th><th>{t('الاستحقاق القادم', 'Next due')}</th>{kind === 'domains' && <th>{t('الانتهاء', 'Expiry')}</th>}<th>{t('الحالة', 'Status')}</th>
          </tr></thead>
          <tbody>
            {rows.map(({ res, it }) => {
              const p = path(res, it);
              return (
                <tr key={it.id} className={p ? 'row-link' : ''} onClick={p ? () => nav(p) : undefined}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="select" checked={!!sel[it.id]} onChange={(e) => setSel({ ...sel, [it.id]: e.target.checked })} /></td>
                  <td className="latin">{String(it.sub ?? '')}</td>
                  {kind === 'services' && <td>{typeName(res)}</td>}
                  <td>{res === 'domains' ? <DomainName name={String(it.name)} /> : label(res, it)}</td>
                  {kind === 'domains' && <td>{String(it.provider || t('بدون', 'None'))}</td>}
                  <td className="latin">{num(it.price) ? `${m2(num(it.price))} ${cur}` : '-'}</td>
                  {kind === 'services' && <td>{it.billing === 'yearly' ? t('سنوي', 'Annually') : it.billing === 'monthly' ? t('شهري', 'Monthly') : '-'}</td>}
                  <td><Ltr>{String((kind === 'domains' ? it.regDate || it.started : it.started) || '-')}</Ltr></td>
                  <td><Ltr>{String(it.nextDue || it.expires || '-')}</Ltr></td>
                  {kind === 'domains' && <td><Ltr>{String(it.expires || '-')}</Ltr></td>}
                  <td><StatusTag s={it.status as 'active'} /></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10}><div className="empty-note">{t('مفيش.', 'None.')}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="bulk-bar">
        <span><b>{t('للمحدد:', 'With selected:')}</b></span>
        <button className="btn btn-ghost btn-sm" disabled={ids.length === 0} onClick={() => void run(byRes(async (res, list) => { await post('admin/bulk', { res, ids: list, action: 'invoice' }); }), t('اتعملت فاتورة بالبنود المحددة.', 'An invoice was created for the selected items.'))}>{t('اعمل فاتورة للمحدد', 'Invoice selected items')}</button>
        <button className="btn btn-ghost btn-sm danger-btn" disabled={ids.length === 0} onClick={() => { if (window.confirm(t('تحذف المحدد نهائيًا؟', 'Delete the selected items permanently?'))) void run(byRes(async (res, list) => { await post('admin/bulk', { res, ids: list, action: 'delete' }); }), t('اتحذف.', 'Deleted.')); }}>{t('احذف المحدد', 'Delete selected items')}</button>
      </div>
      <div className="bulk-bar bulk-actions">
        <b>{t('إجراءات جماعية', 'Bulk actions')}</b>
        <select className="select" aria-label={t('الحالة', 'Status')} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('- تغيير الحالة -', '- Set status -')}</option><option value="active">{t('نشط', 'Active')}</option><option value="pending">{t('قيد التفعيل', 'Pending')}</option><option value="stopped">{t('متوقف', 'Suspended')}</option><option value="archived">{t('مؤرشف', 'Archived')}</option></select>
        <select className="select" aria-label={t('وسيلة الدفع', 'Payment method')} value={pm} onChange={(e) => setPm(e.target.value)}><option value="">{t('- وسيلة الدفع -', '- Set payment method -')}</option>{methods.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <label className="check">{t('ما توقفش لحد', 'Do not suspend until')} <input className="input latin" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        <button className="btn btn-primary btn-sm" disabled={ids.length === 0 || (!status && !pm && !until)} onClick={apply}>{t('تطبيق', 'Apply')}</button>
      </div>
      <div className="inline-form" style={{ gridTemplateColumns: '1fr auto', marginTop: 12 }}>
        <div className="field"><label htmlFor={`lk-${kind}`}>{t('ربط عنصر موجود بالعميل', 'Link an existing item to this client')}</label>
          <select id={`lk-${kind}`} className="select" value={link} onChange={(e) => setLink(e.target.value)}><option value="">…</option>{candidates.map(({ res, it }) => <option key={`${res}:${it.id}`} value={`${res}:${it.id}`}>{typeName(res)} · {label(res, it)} — {all.users.find((x) => x.id === it.uid)?.name ?? '-'}</option>)}</select></div>
        <button className="btn btn-primary btn-sm" disabled={!link} onClick={() => { const [res, id] = link.split(':'); const it = all.items[res].find((x) => x.id === id); if (it) void run(() => post('admin/item-save', { item: { ...it, uid } }, { res }), t('اتربط بالعميل.', 'Linked to the client.')).then(() => setLink('')); }}>{t('ربط', 'Link')}</button>
      </div>
    </>
  );
}

/* ───────── a quote ───────── */
function QuoteEditor({ q, uid, onClose, onSaved }: { q?: Quote; uid: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ subject: q?.subject ?? '', validUntil: q?.validUntil ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), status: q?.status ?? 'draft', notes: q?.notes ?? '', discount: q?.discount ?? 0 });
  const [items, setItems] = useState<InvItem[]>(q?.items?.length ? q.items.map((i) => ({ ...i })) : [{ desc: '', amount: 0, taxed: true }]);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(''); try { await post('admin/quote-save', { id: q?.id ?? '', uid, ...f, items }); onSaved(); } catch (x) { setErr(errText(x, t)); } };
  const setItem = (i: number, patch: Partial<InvItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Modal title={q ? `${t('تعديل عرض', 'Edit quote')} ${q.number}` : t('عرض سعر جديد', 'New quote')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="admin-form">
          <Field id="qt-s" label={t('الموضوع', 'Subject')} wide><input id="qt-s" className="input" required maxLength={160} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field id="qt-v" label={t('صالح لحد', 'Valid until')}><input id="qt-v" className="input latin" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          <Field id="qt-st" label={t('الحالة', 'Status')}><select id="qt-st" className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Quote['status'] })}><option value="draft">{t('مسودة', 'Draft')}</option><option value="delivered">{t('مُرسل للعميل', 'Delivered')}</option><option value="accepted">{t('مقبول', 'Accepted')}</option><option value="declined">{t('مرفوض', 'Declined')}</option><option value="expired">{t('منتهي', 'Expired')}</option></select></Field>
        </div>
        <div className="inv-edit-items">
          {items.map((it, i) => (
            <div key={i} className="inv-edit-row">
              <input className="input" aria-label={t('الوصف', 'Description')} placeholder={t('الوصف', 'Description')} value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} />
              <input className="input latin" aria-label={t('المبلغ', 'Amount')} type="number" step="0.01" value={it.amount} onChange={(e) => setItem(i, { amount: Number(e.target.value) })} />
              <label className="check"><input type="checkbox" checked={!!it.taxed} onChange={(e) => setItem(i, { taxed: e.target.checked })} /> {t('خاضع للضريبة', 'Taxed')}</label>
              <button type="button" className="btn btn-ghost btn-sm" disabled={items.length < 2} onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([...items, { desc: '', amount: 0, taxed: true }])}>{t('+ بند', '+ Item')}</button>
        </div>
        <div className="admin-form">
          <Field id="qt-d" label={t('خصم', 'Discount')}><input id="qt-d" className="input latin" type="number" min={0} step="0.01" value={f.discount} onChange={(e) => setF({ ...f, discount: Number(e.target.value) })} /></Field>
          <Field id="qt-n" label={t('ملاحظات للعميل', 'Notes for the client')} wide><textarea id="qt-n" className="textarea" maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button>
      </form>
    </Modal>
  );
}

function TermsCard({ u, onAttest }: { u: U; onAttest: () => void }) {
  const { t } = useI18n();
  const terms = useTerms();
  const ok = termsAccepted(terms, u.terms);
  return (
    <SideCard title={t('الشروط والأحكام', 'Terms & conditions')}>
      {u.terms ? <p>{ok ? <span className="tag ok">{t('وافق على النسخة الحالية', 'Accepted the current version')}</span> : <span className="tag warn">{t('نسخة قديمة', 'Older version')}</span>} <span className="muted">v{u.terms.version} · <Ltr>{u.terms.at.slice(0, 16).replace('T', ' ')}</Ltr> · {u.terms.by === 'admin' ? t('سجّلتها الإدارة', 'recorded by admin') : t('وافق بنفسه', 'accepted by the client')}{u.terms.ip ? ` · ${u.terms.ip}` : ''}</span></p> : <p><span className="tag bad">{t('لم يوافق', 'Not accepted')}</span></p>}
      {terms && (terms.ar || terms.en) && !ok && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تسجّل إن العميل وافق على الشروط (مثلًا على ورق أو واتساب)؟', 'Record that the client accepted the terms (e.g. on paper or WhatsApp)?'))) onAttest(); }}>{t('سجّل موافقة العميل', 'Record client acceptance')}</button>}
    </SideCard>
  );
}

/* ───────── the client page ───────── */
export function AdminClient() {
  const { t } = useI18n();
  const cur = useCurrency();
  const nav = useNavigate();
  const { impersonate } = useAuth();
  const { id } = useParams();
  const [qs, setQs] = useSearchParams();
  const { all, error, load } = useAll();
  const { err, ok, setOk, run } = useActions(load);
  const tab = ((qs.get('tab') as Tab) || 'summary');
  const setTab = (x: Tab) => setQs({ tab: x }, { replace: true });
  const [methods, setMethods] = useState<string[]>([]);
  const [mails, setMails] = useState<MailRow[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [invEdit, setInvEdit] = useState<{ addFunds?: boolean } | null>(null);
  const [quoteEdit, setQuoteEdit] = useState<Quote | 'new' | null>(null);
  const [mail, setMail] = useState({ subject: '', message: '' });
  const [notes, setNotes] = useState<string | null>(null);
  const [bill, setBill] = useState({ desc: '', amount: '', taxed: true });
  const [billSel, setBillSel] = useState<Record<string, boolean>>({});
  const [prof, setProf] = useState<(Partial<U> & Partial<ReturnType<typeof idOf>> & { addr: Record<string, string> }) | null>(null);
  const [pass, setPass] = useState('');
  const [credit, setCredit] = useState({ amount: '', note: '' });
  const [contact, setContact] = useState<Contact | null>(null);
  const u = all?.users.find((x) => x.id === id) as U | undefined;
  useEffect(() => { api<{ payments?: PayMethod[] }>('admin/settings').then((s) => setMethods((s.payments ?? []).map((m) => m.nameEn || m.nameAr))).catch(() => undefined); }, []);
  useEffect(() => { if (u?.email) api<{ log: MailRow[] }>('admin/mail-log', undefined, { to: u.email }).then((r) => setMails(r.log)).catch(() => undefined); }, [u?.email, ok]);
  useEffect(() => { if (tab === 'log' || tab === 'summary') api<{ log: Log[] }>('admin/activity').then((r) => setLog(r.log)).catch(() => undefined); }, [tab]);
  const [cfg, setCfg] = useState<Parameters<typeof InvoiceEditor>[0]['cfg']>({});
  useEffect(() => { api<typeof cfg>('admin/settings').then(setCfg).catch(() => undefined); }, []);

  const mine = (res: string) => (all?.items[res] ?? []).filter((x) => x.uid === id);
  const invs = useMemo(() => (mine('invoices') as unknown as AInv[]).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), [all, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showArch, setShowArch] = useState(false);
  if (!all || !u) return <Page title={t('العميل', 'Customer')}><Notice err={error} ok="" /><Link to="/admin/users" className="btn btn-ghost btn-sm">{t('← العملاء', '← Customers')}</Link></Page>;
  const sum = (st: string) => invs.filter((i) => i.status === st);
  const total = (l: AInv[]) => l.reduce((n, i) => n + num(i.amount), 0);
  const paidSum = invs.reduce((n, i) => n + num(i.paid), 0);
  const expenses = (all.items.purchases ?? []).filter((p) => p.client === u.id).reduce((n, p) => n + num(p.amount), 0);
  const ledger: LedgerEntry[] = invs.flatMap((i) => (i.payments ?? []).map((e) => ({ ...e, invoiceId: i.id, number: i.number, uid: i.uid }))).sort((a, b) => b.at.localeCompare(a.at));
  const vis = (r: { it: Item }) => showArch || r.it.status !== 'archived';
  const allServices = SERVICE_RES.flatMap(([res]) => mine(res).map((it) => ({ res, it })));
  const allDomains = mine('domains').map((it) => ({ res: 'domains', it }));
  const archivedCount = allServices.filter((r) => r.it.status === 'archived').length + allDomains.filter((r) => r.it.status === 'archived').length;
  const services = allServices.filter(vis);
  const domains = allDomains.filter(vis);
  const quotes = (mine('quotes') as unknown as Quote[]).slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const billable = mine('billable');
  const tickets = all.tickets.filter((x) => x.uid === u.id);
  const orders = mine('orders');
  const months = u.created ? Math.max(0, Math.floor((Date.now() - new Date(u.created).getTime()) / (30.44 * 864e5))) : 0;
  const clients = all.users.filter((x) => x.role === 'client');
  const myLog = log.filter((l) => `${l.by} ${l.detail}`.toLowerCase().includes(u.email.toLowerCase()) || l.by === u.name || l.detail.includes(u.name));
  const flag = (on: boolean) => <b style={{ color: on ? '#4a7c0a' : '#c0321b' }}>{on ? t('نعم', 'Yes') : t('لا', 'No')}</b>;
  const setUser = (patch: Record<string, unknown>, done: string) => run(() => post('admin/user-update', { id: u.id, ...patch }), done);
  const kv = (rows: [string, ReactNode][]) => <dl className="kv-list">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
  const addr = u.addr ?? {};

  return (
    <Page title={`\u200E#${u.no ?? ''} · ${u.name}`} action={<div className="row-actions"><select className="select" aria-label={t('العميل', 'Client')} style={{ minWidth: 220 }} value={u.id} onChange={(e) => nav(`/admin/users/${e.target.value}?tab=${tab}`)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name} {(c as U).group ? `(${(c as U).group})` : ''} · #{(c as U).no}</option>)}</select><Link to="/admin/users" className="btn btn-ghost btn-sm">{t('← العملاء', '← Customers')}</Link></div>}>
      <Notice err={err || error} ok={ok} />
      <div className="client-flags">
        <span>{t('معفى من الضريبة', 'Exempt from tax')}: <button className="link" onClick={() => void setUser({ taxExempt: !u.taxExempt }, t('اتحدّث.', 'Updated.'))}>{flag(!!u.taxExempt)}</button></span>
        <span>{t('إرسال تذكيرات التجديد', 'Send renewal reminders')}: <button className="link" onClick={() => void setUser({ noReminders: !u.noReminders }, t('اتحدّث.', 'Updated.'))}>{flag(!u.noReminders)}</button></span>
        <span>{t('الحساب', 'Account')}: {u.disabled ? <b style={{ color: '#c0321b' }}>{t('موقوف', 'Suspended')}</b> : <b style={{ color: '#4a7c0a' }}>{t('نشط', 'Active')}</b>}</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        ['summary', t('ملخص', 'Summary')], ['profile', t('البيانات', 'Profile')], ['contacts', t('جهات الاتصال', 'Contacts'), (u.contacts ?? []).length], ['services', t('المنتجات والخدمات', 'Products/Services'), services.length], ['domains', t('الدومينات', 'Domains'), domains.length],
        ['billable', t('بنود قابلة للفوترة', 'Billable items'), billable.filter((b) => b.status === 'pending').length], ['invoices', t('الفواتير', 'Invoices'), invs.length], ['quotes', t('عروض الأسعار', 'Quotes'), quotes.length], ['transactions', t('المعاملات', 'Transactions'), ledger.length],
        ['tickets', t('التذاكر', 'Tickets'), tickets.length], ['emails', t('الإيميلات', 'Emails')], ['notes', t('ملاحظات', 'Notes')], ['log', t('السجل', 'Log')],
      ]} />

      {tab === 'summary' && (
        <div className="client-grid">
          <div className="cg-col">
            <SideCard title={t('بيانات العميل', 'Client information')}>
              {kv([[t('الاسم', 'Name'), u.name], [t('النوع', 'Type'), u.kyc?.type === 'company' ? t('شركة', 'Company') : t('شخص', 'Individual')], [t('الشركة', 'Company'), u.company || '-'], ...(u.kyc?.type === 'company' ? [[t('السجل التجاري', 'Commercial reg.'), u.kyc.commercialReg || '-'] as [string, ReactNode]] : [[t('الرقم القومي', 'National ID'), u.kyc?.nationalId || '-'] as [string, ReactNode]]), [t('الرقم الضريبي', 'Tax number'), u.kyc?.taxId || addr.taxId || '-'], [t('الإيميل', 'Email'), <a className="link latin" dir="ltr" href={`mailto:${u.email}`}>{u.email}</a>], [t('الموبايل', 'Phone'), u.phone ? <a className="link latin" dir="ltr" href={`tel:${u.phone}`}>{u.phone}</a> : '-'], [t('العنوان', 'Address'), [addr.address1, addr.address2].filter(Boolean).join(', ') || '-'], [t('المدينة', 'City'), addr.city || '-'], [t('البلد', 'Country'), addr.country || '-'], [t('الرقم الضريبي', 'Tax ID'), addr.taxId || '-']])}
              {u.role === 'client' && <button className="link" onClick={() => void impersonate(u.id).then(() => nav('/portal'))}>{t('دخول بحساب العميل', 'Login as owner')} ↗</button>}
            </SideCard>
            <SideCard title={t('جهات الاتصال', 'Contacts')}>
              {(u.contacts ?? []).length === 0 ? <p className="muted">{t('مفيش جهات اتصال إضافية.', 'No additional contacts.')}</p> : (u.contacts ?? []).map((c) => <p key={c.id}><b>{c.name}</b> {c.role && <span className="muted">· {c.role}</span>}<br /><span className="latin">{c.email}</span></p>)}
              <button className="link" onClick={() => setTab('contacts')}>{t('+ إضافة جهة اتصال', '+ Add contact')}</button>
            </SideCard>
          </div>
          <div className="cg-col">
            <SideCard title={t('الفواتير والحساب', 'Invoices / billing')}>
              {kv([[t('مدفوعة', 'Paid'), <span className="latin">{sum('paid').length} ({m2(total(sum('paid')))} {cur})</span>], [t('مسودة', 'Draft'), <span className="latin">{sum('draft').length} ({m2(total(sum('draft')))})</span>], [t('غير مدفوعة / مستحقة', 'Unpaid / due'), <span className="latin">{sum('due').length} ({m2(sum('due').reduce((n, i) => n + num(i.balance), 0))})</span>], [t('ملغاة', 'Cancelled'), <span className="latin">{sum('void').length} ({m2(total(sum('void')))})</span>], [t('مستردة', 'Refunded'), <span className="latin">{sum('refunded').length}</span>], [t('تحصيل', 'Collections'), <span className="latin">{sum('collections').length} ({m2(sum('collections').reduce((n, i) => n + num(i.balance), 0))})</span>]])}
              <h4>{t('الدخل', 'Income')}</h4>
              {kv([[t('إجمالي الإيراد', 'Gross revenue'), <span className="latin">{m2(paidSum)} {cur}</span>], [t('مصروفات العميل', 'Client expenses'), <span className="latin">{m2(expenses)} {cur}</span>], [t('صافي الدخل', 'Net income'), <b className="latin">{m2(paidSum - expenses)} {cur}</b>], [t('رصيد العميل', 'Credit balance'), <span className="latin">{m2(num(u.credit))} {cur}</span>]])}
              <div className="cg-links">
                <button className="link" onClick={() => setInvEdit({})}>{t('إنشاء فاتورة', 'Create invoice')}</button>
                <button className="link" onClick={() => setInvEdit({ addFunds: true })}>{t('فاتورة إضافة رصيد', 'Create add-funds invoice')}</button>
                <button className="link" onClick={() => setTab('billable')}>{t('إضافة بند قابل للفوترة', 'Add billable item')}</button>
                <button className="link" onClick={() => setQuoteEdit('new')}>{t('إنشاء عرض سعر', 'Create new quote')}</button>
                <button className="link" onClick={() => setTab('profile')}>{t('إدارة الرصيد', 'Manage credits')}</button>
              </div>
            </SideCard>
            <SideCard title={t('معلومات أخرى', 'Other information')}>
              {kv([[t('الحالة', 'Status'), u.disabled ? t('موقوف', 'Suspended') : t('نشط', 'Active')], [t('مجموعة العميل', 'Client group'), u.group || t('بدون', 'None')], [t('تاريخ التسجيل', 'Signup date'), <Ltr>{day(String(u.created ?? '')) || '-'}</Ltr>], [t('عميل منذ', 'Client for'), t(`${months} شهر`, `${months} months`)]])}
            </SideCard>
          </div>
          <div className="cg-col">
            <SideCard title={t('المنتجات والخدمات', 'Products / services')}>
              {kv([...SERVICE_RES.map(([res, ar, en]) => [t(ar, en), <button className="link" onClick={() => setTab('services')}><span className="latin">{mine(res).length}</span></button>] as [string, ReactNode]), [t('دومينات', 'Domains'), <button className="link" onClick={() => setTab('domains')}><span className="latin">{domains.length}</span></button>], [t('عروض مقبولة', 'Accepted quotes'), <span className="latin">{quotes.filter((q) => q.status === 'accepted').length}</span>], [t('تذاكر الدعم', 'Support tickets'), <span className="latin">{tickets.length}</span>]])}
              <div className="cg-links"><Link className="link" to="/admin/orders">{t('الطلبات', 'View orders')} ({orders.length})</Link></div>
            </SideCard>
            <SideCard title={t('آخر الإيميلات', 'Recent emails')}>
              {mails.length === 0 ? <p className="muted">{t('مفيش إيميلات اتبعتت.', 'No emails sent.')}</p> : mails.slice(0, 5).map((m, i) => <p key={i}><span className="latin muted">{m.at.slice(0, 10)}</span> · {m.subject} {!m.ok && <span className="tag bad">{t('فشل', 'Failed')}</span>}</p>)}
            </SideCard>
          </div>
          <div className="cg-col">
            <SideCard title={t('إجراءات أخرى', 'Other actions')}>
              <div className="cg-links">
                <button className="link" onClick={() => setTab('tickets')}>{t('تذاكر الدعم', 'View all support tickets')}</button>
                <button className="link" onClick={() => setTab('transactions')}>{t('كشف الحساب', 'View account statement')}</button>
                {u.role === 'client' && <button className="link" onClick={() => { if (u.disabled || window.confirm(t('توقف حساب العميل؟ مش هيقدر يدخل لحد ما تفعّله.', 'Suspend this account? The customer cannot sign in until you reactivate it.'))) void setUser({ disabled: !u.disabled }, u.disabled ? t('اتفعّل الحساب.', 'Account activated.') : t('اتوقف الحساب.', 'Account suspended.')); }}>{u.disabled ? t('تفعيل حساب العميل', 'Activate client account') : t('إغلاق حساب العميل', 'Close client account')}</button>}
                <button className="link danger-link" onClick={() => { if (window.confirm(t('تحذف الحساب وكل خدماته وتذاكره؟', 'Delete the account with all its services and tickets?'))) void run(() => post('admin/user-delete', { id: u.id }), t('تم الحذف.', 'Deleted.')).then((r) => { if (r) nav('/admin/users'); }); }}>{t('حذف حساب العميل', 'Delete client account')}</button>
                <a className="link" href={apiUrl('admin/client-export', { uid: u.id })}>{t('تصدير بيانات العميل', 'Export client data')}</a>
              </div>
            </SideCard>
            <SideCard title={t('إرسال إيميل', 'Send email')}>
              <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/client-email', { uid: u.id, ...mail }), t('اتبعت الإيميل.', 'Email sent.')).then((r) => { if (r) setMail({ subject: '', message: '' }); }); }}>
                <input className="input" required maxLength={160} placeholder={t('الموضوع', 'Subject')} value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
                <textarea className="textarea" required rows={4} maxLength={5000} placeholder={t('الرسالة', 'Message')} value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} />
                <button className="btn btn-accent btn-sm" type="submit">{t('إرسال', 'Send')}</button>
              </form>
            </SideCard>
            <SideCard title={t('ملاحظات الأدمن', 'Admin notes')}>
              <textarea className="textarea" rows={5} maxLength={4000} value={notes ?? u.notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
              <button className="btn btn-ghost btn-sm" disabled={notes === null} onClick={() => void setUser({ notes }, t('اتحفظت.', 'Saved.')).then(() => setNotes(null))}>{t('حفظ', 'Submit')}</button>
            </SideCard>
          </div>
        </div>
      )}

      {tab === 'profile' && (() => {
        const p = prof ?? { name: u.name, email: u.email, phone: u.phone ?? '', ...idOf(u), group: u.group ?? '', addr: { ...addr } };
        const set = (patch: Record<string, unknown>) => setProf({ ...p, ...patch } as typeof p);
        const setA = (k: string, v: string) => setProf({ ...p, addr: { ...p.addr, [k]: v } });
        return (
          <div className="cust-layout">
            <form className="card form" onSubmit={(e) => { e.preventDefault(); void setUser({ name: p.name, email: p.email, phone: p.phone, company: p.company, group: p.group, addr: p.addr, kyc: { type: (p as ReturnType<typeof idOf>).type, nationalId: (p as ReturnType<typeof idOf>).nationalId, commercialReg: (p as ReturnType<typeof idOf>).commercialReg, taxId: (p as ReturnType<typeof idOf>).taxId } }, t('اتحفظ.', 'Saved.')).then(() => setProf(null)); }}>
              <div className="admin-form">
                <IdentityFields v={p as never} set={(patch) => set(patch)} idp="cf" />
                <Field id="pf-n" label={t('الاسم', 'Name')}><input id="pf-n" className="input" required value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field id="pf-e" label={t('الإيميل', 'Email')}><input id="pf-e" className="input latin" type="email" required value={p.email} onChange={(e) => set({ email: e.target.value })} /></Field>
                <Field id="pf-p" label={t('الموبايل', 'Phone')}><input id="pf-p" className="input latin" value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
                <Field id="pf-a1" label={t('العنوان 1', 'Address 1')}><input id="pf-a1" className="input" value={p.addr.address1 ?? ''} onChange={(e) => setA('address1', e.target.value)} /></Field>
                <Field id="pf-a2" label={t('العنوان 2', 'Address 2')}><input id="pf-a2" className="input" value={p.addr.address2 ?? ''} onChange={(e) => setA('address2', e.target.value)} /></Field>
                <Field id="pf-ci" label={t('المدينة', 'City')}><input id="pf-ci" className="input" value={p.addr.city ?? ''} onChange={(e) => setA('city', e.target.value)} /></Field>
                <Field id="pf-st" label={t('المحافظة', 'State / region')}><input id="pf-st" className="input" value={p.addr.state ?? ''} onChange={(e) => setA('state', e.target.value)} /></Field>
                <Field id="pf-z" label={t('الرمز البريدي', 'Postcode')}><input id="pf-z" className="input latin" value={p.addr.zip ?? ''} onChange={(e) => setA('zip', e.target.value)} /></Field>
                <Field id="pf-co" label={t('البلد', 'Country')}><input id="pf-co" className="input latin" value={p.addr.country ?? ''} onChange={(e) => setA('country', e.target.value)} /></Field>
                <Field id="pf-t" label={t('الرقم الضريبي', 'Tax / VAT number')}><input id="pf-t" className="input latin" value={p.addr.taxId ?? ''} onChange={(e) => setA('taxId', e.target.value)} /></Field>
                <Field id="pf-g" label={t('مجموعة العميل', 'Client group')}><input id="pf-g" className="input" maxLength={60} placeholder="VIP / Agency …" value={p.group ?? ''} onChange={(e) => set({ group: e.target.value })} /></Field>
              </div>
              <button className="btn btn-accent" type="submit">{t('حفظ التغييرات', 'Save changes')}</button>
            </form>
            <aside>
              <SideCard title={t('مستندات الهوية', 'Identity documents')}>
                <KycDocs kyc={u.kyc} admin uid={u.id} onChange={load} />
              </SideCard>
              <TermsCard u={u} onAttest={() => void setUser({ termsAccepted: true }, t('اتسجّلت موافقة العميل.', 'The client’s acceptance was recorded.'))} />
              <SideCard title={t('رصيد العميل', 'Credit balance')}>
                <p><b className="latin">{m2(num(u.credit))} {cur}</b></p>
                <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/credit', { uid: u.id, amount: Number(credit.amount), note: credit.note }), t('اتعدّل الرصيد.', 'Credit updated.')).then((r) => { if (r) setCredit({ amount: '', note: '' }); }); }}>
                  <input className="input latin" type="number" step="0.01" required placeholder={t('± مبلغ', '± amount')} value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} />
                  <input className="input" placeholder={t('ملاحظة', 'Note')} value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} />
                  <button className="btn btn-ghost btn-sm" type="submit">{t('أضف / اخصم', 'Add / remove')}</button>
                </form>
              </SideCard>
              <SideCard title={t('كلمة السر', 'Password')}>
                <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/user-update', { id: u.id, password: pass }), t('تم تغيير كلمة السر.', 'Password changed.')).then(() => setPass('')); }}>
                  <input className="input latin" type="password" minLength={8} required autoComplete="new-password" placeholder={t('كلمة سر جديدة (8+)', 'New password (8+)')} value={pass} onChange={(e) => setPass(e.target.value)} />
                  <button className="btn btn-ghost btn-sm" type="submit">{t('تغيير', 'Change')}</button>
                </form>
              </SideCard>
            </aside>
          </div>
        );
      })()}

      {tab === 'contacts' && (
        <>
          <div className="row-actions" style={{ margin: '12px 0' }}><button className="btn btn-accent btn-sm" onClick={() => setContact({ name: '', email: '', phone: '', role: '' })}>{t('+ جهة اتصال', '+ Contact')}</button></div>
          <Table head={[t('الاسم', 'Name'), t('الإيميل', 'Email'), t('الموبايل', 'Phone'), t('الدور', 'Role'), '']} empty={(u.contacts ?? []).length === 0 ? t('مفيش جهات اتصال.', 'No contacts.') : undefined}>
            {(u.contacts ?? []).map((c) => <tr key={c.id}><td>{c.name}</td><td><Ltr>{c.email || '-'}</Ltr></td><td><Ltr>{c.phone || '-'}</Ltr></td><td>{c.role || '-'}</td><td><div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setContact({ ...c })}>{t('تعديل', 'Edit')}</button><button className="btn btn-ghost btn-sm" onClick={() => void setUser({ contacts: (u.contacts ?? []).filter((x) => x.id !== c.id) }, t('اتحذفت.', 'Deleted.'))}>{t('حذف', 'Delete')}</button></div></td></tr>)}
          </Table>
          {contact && (
            <Modal title={contact.id ? t('تعديل جهة اتصال', 'Edit contact') : t('جهة اتصال جديدة', 'New contact')} onClose={() => setContact(null)}>
              <form className="form" onSubmit={(e) => { e.preventDefault(); const list = contact.id ? (u.contacts ?? []).map((x) => (x.id === contact.id ? contact : x)) : [...(u.contacts ?? []), contact]; void setUser({ contacts: list }, t('اتحفظت.', 'Saved.')).then(() => setContact(null)); }}>
                <Field id="ct-n" label={t('الاسم', 'Name')}><input id="ct-n" className="input" required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
                <Field id="ct-e" label={t('الإيميل', 'Email')}><input id="ct-e" className="input latin" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
                <Field id="ct-p" label={t('الموبايل', 'Phone')}><input id="ct-p" className="input latin" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
                <Field id="ct-r" label={t('الدور (فواتير، تقني…)', 'Role (billing, technical…)')}><input id="ct-r" className="input" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} /></Field>
                <button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button>
              </form>
            </Modal>
          )}
        </>
      )}

      {(tab === 'services' || tab === 'domains') && archivedCount > 0 && <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={showArch} onChange={(e) => setShowArch(e.target.checked)} /> {t('عرض المؤرشف', 'Show archived')} ({archivedCount})</label>}
      {tab === 'services' && <ServiceTable rows={services} kind="services" methods={methods} run={run} all={all} uid={u.id} />}
      {tab === 'domains' && <ServiceTable rows={domains} kind="domains" methods={methods} run={run} all={all} uid={u.id} />}

      {tab === 'billable' && (
        <>
          <form className="card inline-form" style={{ gridTemplateColumns: '1fr 140px auto auto', alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); void run(() => post('admin/item-save', { item: { uid: u.id, desc: bill.desc, amount: Number(bill.amount), taxed: bill.taxed, status: 'pending' } }, { res: 'billable' }), t('اتضاف البند.', 'Item added.')).then((r) => { if (r) setBill({ desc: '', amount: '', taxed: true }); }); }}>
            <div className="field"><label htmlFor="bl-d">{t('الوصف', 'Description')}</label><input id="bl-d" className="input" required maxLength={200} value={bill.desc} onChange={(e) => setBill({ ...bill, desc: e.target.value })} /></div>
            <div className="field"><label htmlFor="bl-a">{t('المبلغ', 'Amount')}</label><input id="bl-a" className="input latin" type="number" step="0.01" required value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} /></div>
            <label className="check">{t('خاضع للضريبة', 'Taxed')} <input type="checkbox" checked={bill.taxed} onChange={(e) => setBill({ ...bill, taxed: e.target.checked })} /></label>
            <button className="btn btn-accent" type="submit">{t('إضافة', 'Add')}</button>
          </form>
          <Table head={['', t('الوصف', 'Description'), t('المبلغ', 'Amount'), t('الحالة', 'Status'), '']} empty={billable.length === 0 ? t('مفيش بنود.', 'No billable items.') : undefined}>
            {billable.map((b) => <tr key={b.id}><td>{b.status === 'pending' && <input type="checkbox" aria-label="select" checked={!!billSel[b.id]} onChange={(e) => setBillSel({ ...billSel, [b.id]: e.target.checked })} />}</td><td>{String(b.desc)}</td><td className="latin">{m2(num(b.amount))} {cur}</td><td>{b.status === 'invoiced' ? <span className="tag ok">{t('اتفوترت', 'Invoiced')}</span> : <span className="tag warn">{t('منتظرة', 'Pending')}</span>}</td><td>{b.status === 'pending' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/item-delete', { id: b.id }, { res: 'billable' }), t('اتحذف.', 'Deleted.'))}>{t('حذف', 'Delete')}</button>}</td></tr>)}
          </Table>
          <div className="bulk-bar"><button className="btn btn-accent btn-sm" disabled={!Object.values(billSel).some(Boolean)} onClick={() => void run(async () => { const r = await post<{ invoice: string }>('admin/billable-invoice', { uid: u.id, ids: Object.keys(billSel).filter((k) => billSel[k]) }); setBillSel({}); nav(`/admin/invoices/${r.invoice}`); }, '')}>{t('اعمل فاتورة بالبنود المحددة', 'Invoice selected items')}</button></div>
        </>
      )}

      {tab === 'invoices' && (
        <>
          <div className="row-actions" style={{ margin: '12px 0' }}><button className="btn btn-accent btn-sm" onClick={() => setInvEdit({})}>{t('+ فاتورة', '+ Invoice')}</button><button className="btn btn-ghost btn-sm" onClick={() => setInvEdit({ addFunds: true })}>{t('+ فاتورة إضافة رصيد', '+ Add-funds invoice')}</button></div>
          <Table head={[t('الرقم', 'No.'), t('التاريخ', 'Date'), t('الاستحقاق', 'Due'), t('الإجمالي', 'Total'), t('المتبقي', 'Balance'), t('الحالة', 'Status')]} empty={invs.length === 0 ? t('مفيش فواتير.', 'No invoices.') : undefined}>
            {invs.map((i) => <tr key={i.id} className="row-link" onClick={() => nav(`/admin/invoices/${i.id}`)}><td><Link className="link latin" to={`/admin/invoices/${i.id}`}>{i.number}</Link></td><td><Ltr>{day(i.date)}</Ltr></td><td><Ltr>{i.dueDate || '-'}</Ltr></td><td className="latin">{m2(num(i.amount))}</td><td className="latin">{m2(num(i.balance))}</td><td><InvoiceTag s={i.status} /></td></tr>)}
          </Table>
        </>
      )}

      {tab === 'quotes' && (
        <>
          <div className="row-actions" style={{ margin: '12px 0' }}><button className="btn btn-accent btn-sm" onClick={() => setQuoteEdit('new')}>{t('+ عرض سعر', '+ Quote')}</button></div>
          <Table head={[t('الرقم', 'No.'), t('الموضوع', 'Subject'), t('الإجمالي', 'Total'), t('صالح لحد', 'Valid until'), t('الحالة', 'Status'), '']} empty={quotes.length === 0 ? t('مفيش عروض.', 'No quotes.') : undefined}>
            {quotes.map((q) => <tr key={q.id}><td className="latin">{q.number}</td><td>{q.subject}</td><td className="latin">{m2(num(q.total))} {cur}</td><td><Ltr>{q.validUntil || '-'}</Ltr></td><td><QuoteTag s={q.status} /></td><td><div className="row-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setQuoteEdit(q)}>{t('تعديل', 'Edit')}</button>
              {q.status !== 'accepted' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/quote-send', { id: q.id }), t('اتبعت العرض للعميل.', 'Quote sent to the client.'))}>{t('إرسال للعميل', 'Send to client')}</button>}
              {q.invoiceId && <Link className="btn btn-ghost btn-sm" to={`/admin/invoices/${q.invoiceId}`}>{t('الفاتورة', 'Invoice')}</Link>}
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف العرض؟', 'Delete the quote?'))) void run(() => post('admin/item-delete', { id: q.id }, { res: 'quotes' }), t('اتحذف.', 'Deleted.')); }}>{t('حذف', 'Delete')}</button></div></td></tr>)}
          </Table>
        </>
      )}

      {tab === 'transactions' && <LedgerTable rows={ledger} withInvoice users={all.users} empty={t('مفيش معاملات.', 'No transactions.')} />}

      {tab === 'tickets' && <Table head={[t('الموضوع', 'Subject'), t('الحالة', 'Status'), t('آخر تحديث', 'Updated')]} empty={tickets.length === 0 ? t('مفيش تذاكر.', 'No tickets.') : undefined}>{tickets.map((x) => <tr key={x.id}><td><Link className="link" to="/admin/tickets">{x.subject}</Link></td><td><span className="tag">{x.status}</span></td><td><Ltr>{day(x.updated)}</Ltr></td></tr>)}</Table>}

      {tab === 'emails' && <Table head={[t('التاريخ', 'Date'), t('الموضوع', 'Subject'), t('الحالة', 'Status')]} empty={mails.length === 0 ? t('مفيش إيميلات اتبعتت للعميل.', 'No emails were sent to this client.') : undefined}>{mails.map((m, i) => <tr key={i}><td><Ltr>{m.at.slice(0, 16).replace('T', ' ')}</Ltr></td><td>{m.subject}</td><td>{m.ok ? <span className="tag ok">{t('اتبعت', 'Sent')}</span> : <span className="tag bad" title={m.err}>{t('فشل', 'Failed')}</span>}</td></tr>)}</Table>}

      {tab === 'notes' && (
        <div className="card form">
          <Field id="nt" label={t('ملاحظات الأدمن (مش بتظهر للعميل)', 'Admin notes (hidden from the client)')}><textarea id="nt" className="textarea" rows={10} maxLength={4000} value={notes ?? u.notes ?? ''} onChange={(e) => setNotes(e.target.value)} /></Field>
          <button className="btn btn-accent" disabled={notes === null} onClick={() => void setUser({ notes }, t('اتحفظت.', 'Saved.')).then(() => setNotes(null))}>{t('حفظ', 'Save')}</button>
        </div>
      )}

      {tab === 'log' && <Table head={[t('الوقت', 'Time'), t('المستخدم', 'By'), t('العملية', 'Action'), t('التفاصيل', 'Detail')]} empty={myLog.length === 0 ? t('مفيش نشاط مسجّل.', 'No activity recorded.') : undefined}>{myLog.slice(0, 200).map((l, i) => <tr key={i}><td><Ltr>{l.at.replace('T', ' ').slice(0, 16)}</Ltr></td><td>{l.by}</td><td><span className="tag latin">{l.action}</span></td><td>{l.detail}</td></tr>)}</Table>}

      {invEdit && <InvoiceEditor users={all.users.filter((x) => x.id === u.id)} presetUid={u.id} cfg={cfg} presetAddFunds={!!invEdit.addFunds} onClose={() => setInvEdit(null)} onSaved={(i) => { setInvEdit(null); setOk(t('اتحفظت الفاتورة.', 'Invoice saved.')); load(); nav(`/admin/invoices/${i.id}`); }} />}
      {quoteEdit && <QuoteEditor q={quoteEdit === 'new' ? undefined : quoteEdit} uid={u.id} onClose={() => setQuoteEdit(null)} onSaved={() => { setQuoteEdit(null); setOk(t('اتحفظ العرض.', 'Quote saved.')); load(); }} />}
    </Page>
  );
}
