import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { api, post, type User } from '../lib/api';
import type { Business, Invoice, InvItem, LedgerEntry, PayMethod } from '../lib/types';
import { Sheet, toLines } from '../portal/Extras';
import { useCurrency } from '../site/settings';
import { day, InvoiceTag, Modal, Page, Table } from '../ui';
import { errText, methodLabel } from './errors';
import { ClientLine, Field, Notice, Strip, Tabs, useAll, type AllData } from './kit';
import { usePaged } from './pager';

type AInv = Invoice & { uid: string; created?: string };
type Tax = { name: string; rate: number };
type Cfg = { business?: Business; taxes?: Tax[]; taxInclusive?: boolean; payments?: PayMethod[]; invoicePrefix?: string };

const num = (v: unknown) => Number(v ?? 0);
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

function useCfg() {
  const [c, setC] = useState<Cfg>({});
  useEffect(() => { api<Cfg>('admin/settings').then(setC).catch(() => undefined); }, []);
  return c;
}

/** Same arithmetic as the server (for the live total while typing). */
function calc(items: InvItem[], discount: number, taxes: Tax[], inclusive: boolean) {
  const sub = items.reduce((n, i) => n + num(i.amount), 0);
  const taxed = items.filter((i) => i.taxed).reduce((n, i) => n + num(i.amount), 0);
  const d = Math.min(Math.max(0, discount), sub);
  const net = taxed * (1 - (sub > 0 ? d / sub : 0));
  const rates = taxes.reduce((n, t) => n + t.rate, 0);
  const base = inclusive && rates > 0 ? net / (1 + rates / 100) : net;
  const lines = taxes.map((t) => ({ ...t, amount: Math.round(base * t.rate) / 100 }));
  const total = sub - d + (inclusive ? 0 : lines.reduce((n, l) => n + l.amount, 0));
  return { sub, d, lines, total };
}

/* ───────── create / edit an invoice ───────── */
export function InvoiceEditor({ inv, users, cfg, onClose, onSaved, presetUid, presetAddFunds }: { inv?: AInv; users: AllData['users']; cfg: Cfg; onClose: () => void; onSaved: (i: Invoice) => void; presetUid?: string; presetAddFunds?: boolean }) {
  const { t } = useI18n();
  const cur = useCurrency();
  const [f, setF] = useState({
    uid: inv?.uid ?? presetUid ?? users.find((u) => u.role === 'client')?.id ?? '', date: inv?.date ?? today(), dueDate: inv?.dueDate ?? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    status: inv?.status === 'draft' ? 'draft' : inv?.status === 'void' ? 'void' : inv?.status === 'collections' ? 'collections' : 'due', notes: inv?.notes ?? '', payMethod: inv?.payMethod ?? '', discount: inv?.discount ?? 0, addFunds: inv ? !!inv.addFunds : !!presetAddFunds,
  });
  const [items, setItems] = useState<InvItem[]>(inv?.items?.length ? inv.items.map((i) => ({ ...i })) : [{ desc: presetAddFunds && !inv ? 'Add funds' : '', amount: 0, taxed: !presetAddFunds }]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const c = calc(items, f.discount, cfg.taxes ?? [], cfg.taxInclusive !== false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await post<{ invoice: Invoice }>('admin/invoice-save', { id: inv?.id ?? '', ...f, items }); onSaved(r.invoice); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  const setItem = (i: number, patch: Partial<InvItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Modal title={inv ? `${t('تعديل فاتورة', 'Edit invoice')} ${inv.number}` : t('فاتورة جديدة', 'New invoice')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="admin-form">
          <Field id="iv-u" label={t('العميل', 'Client')}><select id="iv-u" className="select" required disabled={!!inv} value={f.uid} onChange={(e) => setF({ ...f, uid: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></Field>
          <Field id="iv-s" label={t('الحالة', 'Status')}><select id="iv-s" className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="due">{t('غير مدفوعة', 'Unpaid')}</option><option value="draft">{t('مسودة (مش بتظهر للعميل)', 'Draft')}</option><option value="collections">{t('تحصيل', 'Collections')}</option><option value="void">{t('ملغاة', 'Cancelled')}</option></select></Field>
          <Field id="iv-d" label={t('تاريخ الفاتورة', 'Invoice date')}><input id="iv-d" className="input latin" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field id="iv-du" label={t('تاريخ الاستحقاق', 'Due date')}><input id="iv-du" className="input latin" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <h4>{t('البنود', 'Items')}</h4>
        <div className="inv-edit-items">
          {items.map((it, i) => (
            <div key={i} className="inv-edit-row">
              <input className="input" aria-label={t('الوصف', 'Description')} placeholder={t('الوصف', 'Description')} maxLength={200} value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} />
              <input className="input latin" aria-label={t('المبلغ', 'Amount')} type="number" step="0.01" value={it.amount} onChange={(e) => setItem(i, { amount: Number(e.target.value) })} />
              <label className="check"><input type="checkbox" checked={!!it.taxed} onChange={(e) => setItem(i, { taxed: e.target.checked })} /> {t('خاضع للضريبة', 'Taxed')}</label>
              <button type="button" className="btn btn-ghost btn-sm" disabled={items.length < 2} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={t('حذف', 'Remove')}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([...items, { desc: '', amount: 0, taxed: true }])}>{t('+ بند', '+ Item')}</button>
        </div>
        <div className="admin-form">
          <Field id="iv-ds" label={t('خصم', 'Discount')}><input id="iv-ds" className="input latin" type="number" min={0} step="0.01" value={f.discount} onChange={(e) => setF({ ...f, discount: Number(e.target.value) })} /></Field>
          <Field id="iv-pm" label={t('وسيلة الدفع', 'Payment method')}><select id="iv-pm" className="select" value={f.payMethod} onChange={(e) => setF({ ...f, payMethod: e.target.value })}><option value="">—</option>{(cfg.payments ?? []).map((m) => <option key={m.id} value={m.nameEn || m.nameAr}>{m.nameAr || m.nameEn}</option>)}</select></Field>
          <Field id="iv-n" label={t('ملاحظات تظهر في الفاتورة', 'Notes shown on the invoice')} wide><textarea id="iv-n" className="textarea" maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.addFunds} onChange={(e) => setF({ ...f, addFunds: e.target.checked })} /> {t('فاتورة إضافة رصيد (لما تتدفع بيتضاف مبلغها لرصيد العميل)', 'Add-funds invoice (when paid, its amount is added to the client’s credit)')}</label>
        <div className="inv-sum" style={{ marginInlineStart: 0 }}>
          {c.d > 0 && <div><span>{t('خصم', 'Discount')}</span><b className="latin">−{money(c.d)}</b></div>}
          {c.lines.map((l) => <div key={l.name}><span>{l.name} {l.rate}%</span><b className="latin">{money(l.amount)}</b></div>)}
          <div className="inv-total"><span>{t('الإجمالي', 'Total')}</span><b className="latin">{money(c.total)} {cur}</b></div>
          <small className="muted">{cfg.taxInclusive !== false ? t('الأسعار شاملة الضريبة.', 'Prices include tax.') : t('الضريبة بتتضاف فوق الأسعار.', 'Tax is added on top of the prices.')}</small>
        </div>
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('حفظ الفاتورة', 'Save invoice')}</button>
      </form>
    </Modal>
  );
}

/* ───────── the list ───────── */
const TABS: [string, string, string][] = [['all', 'الكل', 'All'], ['due', 'غير مدفوعة', 'Unpaid'], ['overdue', 'متأخرة', 'Overdue'], ['paid', 'مدفوعة', 'Paid'], ['draft', 'مسودة', 'Draft'], ['void', 'ملغاة', 'Cancelled'], ['refunded', 'مستردة', 'Refunded'], ['collections', 'تحصيل', 'Collections']];
export function AdminInvoices() {
  const { t } = useI18n();
  const cur = useCurrency();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const { all, error, load } = useAll();
  const cfg = useCfg();
  const [tab, setTab] = useState(qs.get('s') ?? 'all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<AInv | 'new' | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const invs = useMemo(() => ((all?.items.invoices ?? []) as unknown as AInv[]).slice().sort((a, b) => String(b.created ?? b.date).localeCompare(String(a.created ?? a.date))), [all]);
  const owner = (uid: string) => all?.users.find((u) => u.id === uid)?.name ?? '-';
  const isOverdue = (i: AInv) => i.status === 'due' && !!i.dueDate && i.dueDate < today() && num(i.balance) > 0;
  const cf = qs.get('c');
  const shown = invs.filter((i) => (!cf || i.uid === cf) && (tab === 'all' || (tab === 'overdue' ? isOverdue(i) : i.status === tab)) && (!q.trim() || `${i.number} ${i.item} ${owner(i.uid)}`.toLowerCase().includes(q.trim().toLowerCase())));
  const { rows, pager } = usePaged(shown, `${tab}|${q}`);
  const count = (s: string) => invs.filter((i) => s === 'all' || (s === 'overdue' ? isOverdue(i) : i.status === s)).length;
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); } catch (x) { setErr(errText(x, t)); } };
  const wa = async (i: AInv) => {
    const r = await api<{ users: (User & { phone?: string })[] }>('admin/users');
    const u = r.users.find((x) => x.id === i.uid);
    let ph = (u?.phone ?? '').replace(/\D/g, '').replace(/^00/, '');
    if (ph.startsWith('0')) ph = '20' + ph.slice(1);
    if (!ph) throw new Error('this client has no phone number');
    const link = `${window.location.href.split('#')[0]}#/portal/invoices/${i.id}`;
    const msg = t(`أهلًا ${u?.name ?? ''}، فاتورتك ${i.number} بمبلغ ${i.amount} ${cur}: ${link}`, `Hello ${u?.name ?? ''}, your invoice ${i.number} for ${i.amount} ${cur}: ${link}`);
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    await post('admin/invoice-send', { id: i.id, via: 'whatsapp' });
  };
  const unpaid = invs.filter((i) => i.status === 'due').reduce((n, i) => n + num(i.balance), 0);
  const paidSum = invs.reduce((n, i) => n + num(i.paid), 0);
  return (
    <Page title={cf && all ? `${t('فواتير', 'Invoices')}: ${owner(cf)}` : t('الفواتير', 'Invoices')} action={<div className="row-actions"><Link to="/admin/transactions" className="btn btn-ghost btn-sm">{t('المعاملات', 'Transactions')}</Link><button className="btn btn-accent btn-sm" onClick={() => setEdit('new')}>{t('+ فاتورة', '+ Invoice')}</button></div>}>
      <Notice err={err || error} ok={ok} />
      <Strip items={[[t('غير مدفوعة', 'Unpaid'), <span className="latin">{money(unpaid)} {cur}</span>], [t('متأخرة', 'Overdue'), <span className="latin">{count('overdue')}</span>], [t('المحصّل', 'Collected'), <span className="latin">{money(paidSum)} {cur}</span>], [t('كل الفواتير', 'All invoices'), <span className="latin">{invs.length}</span>]]} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cust-bar">
          <Tabs value={tab} onChange={setTab} tabs={TABS.map(([k, ar, en]) => [k, t(ar, en), count(k)] as [string, string, number])} />
          <input className="input" style={{ height: 40, width: 220 }} placeholder={t('ابحث برقم الفاتورة أو العميل', 'Search number or client')} aria-label={t('بحث', 'Search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="tbl">
            <thead><tr>{[t('الرقم', 'No.'), t('العميل', 'Client'), t('التاريخ', 'Date'), t('الاستحقاق', 'Due'), t('الإجمالي', 'Total'), t('المتبقي', 'Balance'), t('الحالة', 'Status'), t('المتابعة', 'Follow-up'), ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="row-link" onClick={() => nav(`/admin/invoices/${i.id}`)}>
                  <td><Link className="link latin" to={`/admin/invoices/${i.id}`} onClick={(e) => e.stopPropagation()}>{i.number}</Link></td>
                  <td onClick={(e) => e.stopPropagation()}>{all && <ClientLine users={all.users} uid={i.uid} />}</td>
                  <td><Ltr>{day(i.date)}</Ltr></td><td><Ltr>{i.dueDate || '-'}</Ltr>{isOverdue(i) && <> <span className="tag bad">{t('متأخرة', 'Overdue')}</span></>}</td>
                  <td className="latin">{money(i.amount)}</td><td className="latin">{money(num(i.balance))}</td>
                  <td><InvoiceTag s={i.status} /></td>
                  <td><span className="sub-line">{i.sentAt ? <span className="tag">{i.sentVia === 'whatsapp' ? 'WhatsApp' : 'Email'} · <Ltr>{day(i.sentAt)}</Ltr></span> : <span className="muted">{t('لم تُرسل', 'Not sent')}</span>}{i.viewedAt ? <span className="tag ok">{t('اتفتحت', 'Viewed')}</span> : null}</span></td>
                  <td onClick={(e) => e.stopPropagation()}><div className="row-actions">
                    {i.status === 'due' && <button className="btn btn-accent btn-sm" onClick={() => void run(() => post('admin/invoice-status', { id: i.id, status: 'paid' }), t('تم تسجيل الدفع وتفعيل الخدمة المرتبطة.', 'Marked as paid; the linked service is activated.'))}>{t('تم الدفع', 'Mark paid')}</button>}
                    {i.status === 'due' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/invoice-email', { id: i.id, template: 'created' }), t('اتبعتت بالإيميل.', 'Emailed.'))}>{t('إيميل', 'Email')}</button>}
                    {i.status === 'due' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => wa(i), t('اتفتح واتساب واتسجّل الإرسال.', 'WhatsApp opened and the send was recorded.'))}>{t('واتساب', 'WhatsApp')}</button>}
                  </div></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={9}><div className="empty-note">{all ? t('مفيش فواتير.', 'No invoices.') : '…'}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}>{pager}</div>
      </div>
      {edit && all && <InvoiceEditor inv={edit === 'new' ? undefined : edit} users={all.users} cfg={cfg} onClose={() => setEdit(null)} onSaved={(i) => { setEdit(null); setOk(t('اتحفظت الفاتورة.', 'Invoice saved.')); load(); if (edit === 'new') nav(`/admin/invoices/${i.id}`); }} />}
    </Page>
  );
}

/* ───────── one invoice (WHMCS-style: Summary · Add payment · Credit · Refund · Notes) ───────── */
const TEMPLATES: [string, string, string][] = [['created', 'الفاتورة', 'Invoice created'], ['reminder', 'تذكير بالدفع', 'Payment reminder'], ['overdue', 'فاتورة متأخرة', 'Overdue notice'], ['confirmation', 'تأكيد الدفع', 'Payment confirmation'], ['refund', 'تأكيد استرداد', 'Refund confirmation']];
export function AdminInvoice() {
  const { t, L } = useI18n();
  const cur = useCurrency();
  const { id } = useParams();
  const { all, error, load } = useAll();
  const cfg = useCfg();
  const [tab, setTab] = useState<'summary' | 'payment' | 'credit' | 'refund' | 'fee' | 'notes'>('summary');
  const [client, setClient] = useState(false);
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [tpl, setTpl] = useState('created');
  const [pay, setPay] = useState({ amount: '', method: 'Manual', ref: '', fee: '', date: today(), note: '' });
  const [cr, setCr] = useState('');
  const [rf, setRf] = useState({ amount: '', toCredit: true, method: 'Manual', ref: '', note: '' });
  const [fee, setFee] = useState({ desc: '', amount: '', taxed: false });
  const [entry, setEntry] = useState<{ id: string; type: string; amount: string; method: string; ref: string; fee: string; note: string; date: string } | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const inv = ((all?.items.invoices ?? []) as unknown as AInv[]).find((x) => x.id === id);
  if (!all) return <Page title={t('فاتورة', 'Invoice')}><Notice err={error} ok="" /></Page>;
  if (!inv) return <Page title={t('فاتورة', 'Invoice')}><p className="muted">{t('الفاتورة مش موجودة.', 'Invoice not found.')}</p><Link to="/admin/invoices" className="btn btn-ghost btn-sm">{t('← الفواتير', '← Invoices')}</Link></Page>;
  const u = all.users.find((x) => x.id === inv.uid);
  const order = (all.items.orders as unknown as { id: string; lines: never[] }[] | undefined)?.find((o) => o.id === inv.orderId);
  const credit = num(u?.credit);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(''); setOk(''); try { await fn(); setOk(done); load(); return true; } catch (x) { setErr(errText(x, t)); return false; } };
  const methods = (cfg.payments ?? []).map((m) => m.nameEn || m.nameAr);
  const bal = num(inv.balance);
  const stampCls = inv.status === 'paid' ? 'ok' : inv.status === 'due' || inv.status === 'collections' ? 'bad' : '';
  if (client) {
    return (
      <Page title={`${t('فاتورة', 'Invoice')} ${inv.number}`} action={<div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => window.print()}>{t('طباعة / PDF', 'Print / PDF')}</button><button className="btn btn-ghost btn-sm" onClick={() => setClient(false)}>{t('← الإدارة', '← Manage')}</button></div>}>
        <Sheet inv={inv} lines={toLines(order as never, inv, t, L)} biz={cfg.business ?? {}} taxRate={0} customer={u ? { name: u.name, email: u.email, phone: u.phone, company: u.company } : { name: '-', email: '' }} methods={(cfg.payments ?? []).filter((m) => m.active)} />
      </Page>
    );
  }
  return (
    <Page title={`${t('فاتورة', 'Invoice')} #${inv.number}`} action={<div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>{t('إدارة الفاتورة', 'Manage invoice')}</button><button className="btn btn-ghost btn-sm" onClick={() => setClient(true)}>{t('عرض كعميل', 'View as client')}</button><button className="btn btn-ghost btn-sm" onClick={() => { setClient(true); setTimeout(() => window.print(), 300); }}>{t('طباعة / PDF', 'Print / PDF')}</button><Link to="/admin/invoices" className="btn btn-ghost btn-sm">{t('← الفواتير', '← Invoices')}</Link></div>}>
      <Notice err={err || error} ok={ok} />
      <Tabs value={tab} onChange={setTab} tabs={[['summary', t('ملخص', 'Summary')], ['payment', t('إضافة دفعة', 'Add payment')], ['credit', t('رصيد', 'Credit')], ['refund', t('استرداد', 'Refund')], ['fee', t('غرامة / رسوم', 'Fee / penalty')], ['notes', t('ملاحظات', 'Notes')]]} />
      {tab === 'summary' && (
        <div className="inv-admin-top">
          <div className="card"><dl className="kv">
            <div><dt>{t('العميل', 'Client')}</dt><dd><ClientLine users={all.users} uid={inv.uid} /> {u && <Link className="link" to={`/admin/invoices?c=${u.id}`}>({t('كل فواتيره', 'View invoices')})</Link>}</dd></div>
            <div><dt>{t('رقم الفاتورة', 'Invoice #')}</dt><dd className="latin">{inv.number}</dd></div>
            <div><dt>{t('تاريخ الفاتورة', 'Invoice date')}</dt><dd><Ltr>{day(inv.date)}</Ltr></dd></div>
            <div><dt>{t('تاريخ الاستحقاق', 'Due date')}</dt><dd><Ltr>{inv.dueDate || '-'}</Ltr></dd></div>
            <div><dt>{t('مبلغ الفاتورة', 'Invoice amount')}</dt><dd className="latin">{money(inv.amount)} {cur}</dd></div>
            <div><dt>{t('المتبقي', 'Balance')}</dt><dd className="latin" style={{ color: bal > 0 ? '#c0321b' : '#4a7c0a' }}>{money(bal)} {cur}</dd></div>
          </dl></div>
          <div className="card inv-stamp">
            <div className={`inv-status ${stampCls}`}><InvoiceTag s={inv.status} /></div>
            <p>{t('وسيلة الدفع', 'Payment method')}: <b>{inv.payMethod || '-'}</b></p>
            <div className="row-actions">
              <select className="select" aria-label={t('قالب الإيميل', 'Email template')} value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map(([k, ar, en]) => <option key={k} value={k}>{t(ar, en)}</option>)}</select>
              <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/invoice-email', { id: inv.id, template: tpl }), t('اتبعت الإيميل.', 'Email sent.'))}>{t('ابعت إيميل', 'Send email')}</button>
            </div>
            <div className="row-actions">
              {(inv.status === 'due' || inv.status === 'collections' || inv.status === 'draft') && <button className="btn btn-accent btn-sm" onClick={() => void run(() => post('admin/invoice-status', { id: inv.id, status: 'paid' }), t('تم تسجيل الدفع وتفعيل الخدمة المرتبطة.', 'Marked as paid; the linked service is activated.'))}>{t('تم الدفع', 'Mark paid')}</button>}
              {inv.status !== 'due' && inv.status !== 'paid' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/invoice-status', { id: inv.id, status: 'due' }), t('رجعت غير مدفوعة.', 'Set to unpaid.'))}>{t('غير مدفوعة', 'Mark unpaid')}</button>}
              {inv.status === 'due' && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => post('admin/invoice-status', { id: inv.id, status: 'collections' }), t('اتحولت للتحصيل.', 'Moved to collections.'))}>{t('تحصيل', 'Collections')}</button>}
              {inv.status !== 'void' && inv.status !== 'paid' && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تلغي الفاتورة؟', 'Cancel this invoice?'))) void run(() => post('admin/invoice-status', { id: inv.id, status: 'void' }), t('اتلغت.', 'Cancelled.')); }}>{t('إلغاء', 'Cancel')}</button>}
            </div>
            <p className="muted">{inv.sentAt ? `${t('اتبعتت', 'Sent')} ${inv.sentVia === 'whatsapp' ? 'WhatsApp' : 'Email'} · ${day(inv.sentAt)}` : t('لم تُرسل', 'Not sent yet')}{inv.viewedAt ? ` · ${t('اتفتحت', 'Viewed')} ${day(inv.viewedAt)}` : ''}</p>
          </div>
        </div>
      )}
      {tab === 'payment' && (
        <form className="card form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await post('admin/invoice-payment', { id: inv.id, amount: Number(pay.amount || bal), method: pay.method, ref: pay.ref, fee: Number(pay.fee || 0), date: pay.date, note: pay.note }); setPay({ ...pay, amount: '', ref: '', fee: '', note: '' }); setTab('summary'); }, t('اتسجّلت الدفعة.', 'Payment recorded.')); }}>
          <div className="admin-form">
            <Field id="p-d" label={t('التاريخ', 'Date')}><input id="p-d" className="input latin" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
            <Field id="p-a" label={t('المبلغ', 'Amount')}><input id="p-a" className="input latin" type="number" step="0.01" min="0" placeholder={String(bal)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field id="p-m" label={t('وسيلة الدفع', 'Payment method')}><select id="p-m" className="select" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="Manual">{t('يدوي', 'Manual')}</option>{methods.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
            <Field id="p-r" label={t('رقم العملية / المرجع', 'Transaction ID / reference')}><input id="p-r" className="input latin" maxLength={160} value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} /></Field>
            <Field id="p-f" label={t('رسوم', 'Fees')}><input id="p-f" className="input latin" type="number" step="0.01" min="0" value={pay.fee} onChange={(e) => setPay({ ...pay, fee: e.target.value })} /></Field>
            <Field id="p-n" label={t('ملاحظة', 'Note')}><input id="p-n" className="input" maxLength={200} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
          </div>
          <p className="muted">{t('لما المتبقي يوصل صفر الفاتورة بتتحول لمدفوعة والخدمة المرتبطة بتتفعّل.', 'When the balance reaches zero the invoice becomes paid and the linked service is activated.')} {t('المتبقي:', 'Balance:')} <b className="latin">{money(bal)}</b></p>
          <button className="btn btn-accent" type="submit">{t('إضافة دفعة', 'Add payment')}</button>
        </form>
      )}
      {tab === 'credit' && (
        <div className="card form">
          <p>{t('رصيد العميل:', 'Client credit balance:')} <b className="latin">{money(credit)} {cur}</b> · {t('المتبقي على الفاتورة:', 'Invoice balance:')} <b className="latin">{money(bal)}</b></p>
          <div className="row-actions">
            <input className="input latin" style={{ maxWidth: 200 }} type="number" step="0.01" min="0" aria-label={t('المبلغ', 'Amount')} placeholder={String(Math.min(credit, bal))} value={cr} onChange={(e) => setCr(e.target.value)} />
            <button className="btn btn-accent btn-sm" disabled={credit <= 0 || bal <= 0} onClick={() => void run(async () => { await post('admin/invoice-credit', { id: inv.id, amount: Number(cr || Math.min(credit, bal)) }); setCr(''); }, t('اتطبّق الرصيد على الفاتورة.', 'Credit applied.'))}>{t('طبّق الرصيد', 'Apply credit')}</button>
          </div>
          <CreditAdjust uid={inv.uid} onDone={() => load()} setErr={setErr} setOk={setOk} />
        </div>
      )}
      {tab === 'refund' && (
        <form className="card form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await post('admin/invoice-refund', { id: inv.id, amount: Number(rf.amount || num(inv.paid)), toCredit: rf.toCredit, method: rf.method, ref: rf.ref, note: rf.note }); setRf({ ...rf, amount: '', ref: '', note: '' }); setTab('summary'); }, t('اتسجّل الاسترداد.', 'Refund recorded.')); }}>
          <p>{t('المدفوع على الفاتورة:', 'Paid on this invoice:')} <b className="latin">{money(num(inv.paid))} {cur}</b></p>
          <div className="admin-form">
            <Field id="r-a" label={t('مبلغ الاسترداد', 'Refund amount')}><input id="r-a" className="input latin" type="number" step="0.01" min="0" placeholder={String(num(inv.paid))} value={rf.amount} onChange={(e) => setRf({ ...rf, amount: e.target.value })} /></Field>
            <Field id="r-m" label={t('الاسترداد إلى', 'Refund to')}><select id="r-m" className="select" value={rf.toCredit ? 'credit' : 'manual'} onChange={(e) => setRf({ ...rf, toCredit: e.target.value === 'credit' })}><option value="credit">{t('رصيد العميل', 'Client credit')}</option><option value="manual">{t('رديته للعميل بره النظام', 'Refunded outside the system')}</option></select></Field>
            {!rf.toCredit && <Field id="r-r" label={t('المرجع', 'Reference')}><input id="r-r" className="input latin" value={rf.ref} onChange={(e) => setRf({ ...rf, ref: e.target.value })} /></Field>}
            <Field id="r-n" label={t('ملاحظة', 'Note')}><input id="r-n" className="input" value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} /></Field>
          </div>
          <button className="btn btn-accent" type="submit" disabled={num(inv.paid) <= 0}>{t('استرداد', 'Refund')}</button>
        </form>
      )}
      {tab === 'fee' && (
        <form className="card form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await post('admin/invoice-fee', { id: inv.id, desc: fee.desc, amount: Number(fee.amount), taxed: fee.taxed }); setFee({ desc: '', amount: '', taxed: false }); setTab('summary'); }, t('اتضافت الغرامة على الفاتورة.', 'The fee was added to the invoice.')); }}>
          <p className="muted">{t('بتتضاف كبند جديد على الفاتورة وبيزيد المتبقي (مثلًا غرامة تأخير). تتاح لفاتورة غير مدفوعة بس.', 'Added as one more invoice item and raises the balance (for example a late fee). Only for an unpaid invoice.')}</p>
          <div className="admin-form">
            <Field id="f-d" label={t('الوصف', 'Description')}><input id="f-d" className="input" required maxLength={200} placeholder={t('غرامة تأخير', 'Late payment fee')} value={fee.desc} onChange={(e) => setFee({ ...fee, desc: e.target.value })} /></Field>
            <Field id="f-a" label={t('المبلغ', 'Amount')}><input id="f-a" className="input latin" type="number" step="0.01" min="0" required value={fee.amount} onChange={(e) => setFee({ ...fee, amount: e.target.value })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={fee.taxed} onChange={(e) => setFee({ ...fee, taxed: e.target.checked })} /> {t('خاضعة للضريبة', 'Taxed')}</label>
          <button className="btn btn-accent" type="submit" disabled={inv.status !== 'due' && inv.status !== 'collections'}>{t('إضافة الغرامة', 'Add fee')}</button>
        </form>
      )}
      {tab === 'notes' && (
        <div className="card form">
          <Field id="in-n" label={t('ملاحظات الفاتورة (بتظهر على الفاتورة للعميل)', 'Invoice notes (shown on the invoice)')}><textarea id="in-n" className="textarea" rows={6} maxLength={1000} value={notes ?? inv.notes ?? ''} onChange={(e) => setNotes(e.target.value)} /></Field>
          <button className="btn btn-accent" disabled={notes === null} onClick={() => void run(async () => { await post('admin/invoice-save', { id: inv.id, uid: inv.uid, items: inv.items, date: inv.date, dueDate: inv.dueDate, status: inv.status === 'paid' || inv.status === 'refunded' ? 'due' : inv.status, notes, payMethod: inv.payMethod, discount: inv.discount, addFunds: inv.addFunds }); setNotes(null); }, t('اتحفظت.', 'Saved.'))}>{t('حفظ', 'Save')}</button>
        </div>
      )}
      <h3 className="sub">{t('بنود الفاتورة', 'Invoice items')}</h3>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('الوصف', 'Description')}</th><th>{t('المبلغ', 'Amount')}</th><th>{t('ضريبة', 'Taxed')}</th></tr></thead>
          <tbody>
            {(inv.items ?? []).map((i, k) => <tr key={k}><td>{L({ ar: i.descAr || i.desc, en: i.desc })}</td><td className="latin">{money(num(i.amount))}</td><td>{i.taxed ? '✓' : ''}</td></tr>)}
            {!!inv.discount && <tr><td className="muted">{t('خصم', 'Discount')}</td><td className="latin">−{money(num(inv.discount))}</td><td /></tr>}
            {(inv.taxes ?? []).map((x) => <tr key={x.name}><td className="muted">{x.name} {x.rate}%</td><td className="latin">{money(x.amount)}</td><td /></tr>)}
            <tr className="inv-total-row"><td><b>{t('مبلغ الفاتورة', 'Invoice amount')}</b></td><td className="latin"><b>{money(inv.amount)} {cur}</b></td><td /></tr>
          </tbody>
        </table>
      </div>
      <h3 className="sub">{t('دفتر الحساب', 'Ledger')}</h3>
      <LedgerTable rows={inv.payments ?? []} empty={t('مفيش حركات لسه.', 'No entries yet.')}
        onEdit={(e) => setEntry({ id: e.id, type: e.type, amount: String(e.amount), method: e.method ?? '', ref: e.ref ?? '', fee: String(e.fee ?? 0), note: e.note ?? '', date: (e.at ?? '').slice(0, 10) })}
        onDelete={(e) => { if (window.confirm(t('تحذف الحركة دي من دفتر الحساب؟ المتبقي هيتحسب من جديد.', 'Remove this entry from the ledger? The balance is recalculated.'))) void run(() => post('admin/invoice-entry', { id: inv.id, entry: e.id, action: 'delete' }), t('اتحذفت الحركة.', 'Entry removed.')); }} />
      {entry && (
        <Modal title={t('تعديل حركة', 'Edit entry')} onClose={() => setEntry(null)}>
          <form className="form" onSubmit={(ev: FormEvent) => { ev.preventDefault(); void run(async () => { await post('admin/invoice-entry', { id: inv.id, entry: entry.id, action: 'edit', amount: Number(entry.amount), method: entry.method, ref: entry.ref, fee: Number(entry.fee || 0), note: entry.note, date: entry.date }); setEntry(null); }, t('اتعدّلت الحركة.', 'Entry updated.')); }}>
            <div className="admin-form">
              <Field id="e-d" label={t('التاريخ', 'Date')}><input id="e-d" className="input latin" type="date" value={entry.date} onChange={(ev) => setEntry({ ...entry, date: ev.target.value })} /></Field>
              <Field id="e-a" label={t('المبلغ', 'Amount')}><input id="e-a" className="input latin" type="number" step="0.01" min="0" required value={entry.amount} onChange={(ev) => setEntry({ ...entry, amount: ev.target.value })} /></Field>
              {entry.type === 'payment' && <><Field id="e-m" label={t('وسيلة الدفع', 'Payment method')}><input id="e-m" className="input" maxLength={60} value={entry.method} onChange={(ev) => setEntry({ ...entry, method: ev.target.value })} /></Field>
              <Field id="e-r" label={t('المرجع', 'Reference')}><input id="e-r" className="input latin" maxLength={160} value={entry.ref} onChange={(ev) => setEntry({ ...entry, ref: ev.target.value })} /></Field>
              <Field id="e-f" label={t('رسوم', 'Fees')}><input id="e-f" className="input latin" type="number" step="0.01" min="0" value={entry.fee} onChange={(ev) => setEntry({ ...entry, fee: ev.target.value })} /></Field></>}
              <Field id="e-n" label={t('ملاحظة', 'Note')}><input id="e-n" className="input" maxLength={200} value={entry.note} onChange={(ev) => setEntry({ ...entry, note: ev.target.value })} /></Field>
            </div>
            <p className="muted">{t('لو الفاتورة كانت اتدفعت وفعّلت خدمة، التعديل بيغيّر الحساب بس ومابيلغيش التفعيل.', 'If the invoice was paid and activated a service, editing only changes the books; it does not undo the activation.')}</p>
            <button className="btn btn-accent" type="submit">{t('حفظ', 'Save')}</button>
          </form>
        </Modal>
      )}
      {edit && <InvoiceEditor inv={inv} users={all.users} cfg={cfg} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); setOk(t('اتحفظت الفاتورة.', 'Invoice saved.')); load(); }} />}
    </Page>
  );
}

function CreditAdjust({ uid, onDone, setErr, setOk }: { uid: string; onDone: () => void; setErr: (s: string) => void; setOk: (s: string) => void }) {
  const { t } = useI18n();
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="row-actions" style={{ marginTop: 12 }}>
      <input className="input latin" style={{ maxWidth: 160 }} type="number" step="0.01" placeholder={t('± مبلغ', '± amount')} aria-label={t('تعديل الرصيد', 'Adjust credit')} value={amt} onChange={(e) => setAmt(e.target.value)} />
      <input className="input" style={{ maxWidth: 240 }} placeholder={t('ملاحظة', 'Note')} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn-ghost btn-sm" disabled={!Number(amt)} onClick={() => { setErr(''); post('admin/credit', { uid, amount: Number(amt), note }).then(() => { setOk(t('اتعدّل رصيد العميل.', 'Client credit updated.')); setAmt(''); setNote(''); onDone(); }).catch((x) => setErr(errText(x, t))); }}>{t('أضف / اخصم رصيد', 'Add / remove credit')}</button>
    </div>
  );
}

export function LedgerTable({ rows, empty, withInvoice = false, users, onEdit, onDelete }: { rows: LedgerEntry[]; empty: string; withInvoice?: boolean; users?: AllData['users']; onEdit?: (e: LedgerEntry) => void; onDelete?: (e: LedgerEntry) => void }) {
  const { t } = useI18n();
  const cur = useCurrency();
  const label = (e: LedgerEntry) => (e.type === 'payment' ? t('دفعة', 'Payment') : e.type === 'credit' ? t('رصيد مطبّق', 'Applied credit') : t('استرداد', 'Refund'));
  return (
    <Table head={[t('التاريخ', 'Date'), t('النوع', 'Type'), ...(withInvoice ? [t('الفاتورة', 'Invoice'), t('العميل', 'Client')] : []), t('وسيلة الدفع', 'Payment method'), t('المرجع', 'Reference'), t('المبلغ', 'Amount'), t('الرسوم', 'Fees'), ...(onEdit || onDelete ? [''] : [])]} empty={rows.length === 0 ? empty : undefined}>
      {rows.map((e) => (
        <tr key={e.id}>
          <td><Ltr>{(e.at || '').slice(0, 16).replace('T', ' ')}</Ltr></td><td>{label(e)}{e.note && <small className="muted"> · {e.note}</small>}</td>
          {withInvoice && <><td><Link className="link latin" to={`/admin/invoices/${e.invoiceId}`}>{e.number}</Link></td><td>{users?.find((u) => u.id === e.uid)?.name ?? '-'}</td></>}
          <td>{methodLabel(e.method, t)}</td><td><Ltr>{e.ref || '-'}</Ltr></td><td className="latin" style={{ color: e.type === 'refund' ? '#c0321b' : undefined }}>{e.type === 'refund' ? '−' : ''}{money(e.amount)} {cur}</td><td className="latin">{money(e.fee)}</td>
          {(onEdit || onDelete) && <td><div className="row-actions">{onEdit && <button className="btn btn-ghost btn-sm" onClick={() => onEdit(e)}>{t('تعديل', 'Edit')}</button>}{onDelete && <button className="btn btn-ghost btn-sm" onClick={() => onDelete(e)}>{t('حذف', 'Delete')}</button>}</div></td>}
        </tr>
      ))}
    </Table>
  );
}

export function AdminTransactions() {
  const { t } = useI18n();
  const [rows, setRows] = useState<LedgerEntry[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const { all } = useAll();
  useEffect(() => { api<{ transactions: LedgerEntry[] }>('admin/transactions').then((r) => setRows(r.transactions)).catch((e) => setErr(errText(e, t))); }, [t]);
  const shown = (rows ?? []).filter((e) => !q.trim() || `${e.number} ${e.ref} ${e.method} ${all?.users.find((u) => u.id === e.uid)?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const { rows: page, pager } = usePaged(shown, q);
  const sum = shown.reduce((n, e) => n + (e.type === 'refund' ? -e.amount : e.amount), 0);
  return (
    <Page title={t('المعاملات', 'Transactions')} action={<Link to="/admin/invoices" className="btn btn-ghost btn-sm">{t('← الفواتير', '← Invoices')}</Link>}>
      <Notice err={err} ok="" />
      <Strip items={[[t('عدد الحركات', 'Entries'), <span className="latin">{shown.length}</span>], [t('الصافي', 'Net'), <span className="latin">{money(sum)}</span>]]} />
      <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder={t('ابحث (فاتورة، عميل، مرجع)', 'Search (invoice, client, reference)')} value={q} onChange={(e) => setQ(e.target.value)} />
      <LedgerTable rows={page} withInvoice users={all?.users} empty={rows ? t('مفيش معاملات.', 'No transactions.') : '…'} />
      {pager}
    </Page>
  );
}
