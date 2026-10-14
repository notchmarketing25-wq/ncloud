import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { post } from '../lib/api';
import type { Order } from '../lib/types';
import { OrderTag, unitLabel } from '../site/CartPages';
import { useCurrency } from '../site/settings';
import { day, Modal, Page, Table } from '../ui';
import { ClientLine, Notice, useAll, type Item } from './kit';
import { errText } from './errors';
import { usePaged } from './pager';

const FILTERS: [string, string, string][] = [['all', 'الكل', 'All'], ['pending', 'في انتظار الدفع', 'Awaiting payment'], ['paid', 'مدفوع', 'Paid'], ['active', 'مفعّل', 'Active'], ['cancelled', 'ملغي', 'Cancelled']];
const NEXT: Record<string, [Order['status'], string, string][]> = {
  pending: [['paid', 'تأكيد الدفع', 'Confirm payment'], ['active', 'تأكيد وتفعيل', 'Confirm & activate'], ['cancelled', 'إلغاء الطلب', 'Cancel order']],
  paid: [['active', 'تفعيل الخدمة', 'Activate service'], ['cancelled', 'إلغاء الطلب', 'Cancel order']],
  active: [['cancelled', 'إلغاء الطلب', 'Cancel order']],
  cancelled: [['pending', 'إعادة فتح', 'Reopen']],
};

/** Admin → Orders: what customers ordered from the cart, with payment and activation. */
export function AdminOrders() {
  const { t, L } = useI18n();
  const cur = useCurrency();
  const { all, error, load } = useAll();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const orders = ((all?.items.orders ?? []) as unknown as Order[]).slice().sort((a, b) => b.created.localeCompare(a.created)).filter((o) => filter === 'all' || o.status === filter);
  const { rows, pager } = usePaged(orders, filter);
  const o = open ? ((all?.items.orders ?? []) as unknown as Order[]).find((x) => x.id === open) : undefined;
  const setStatus = async (id: string, status: string) => {
    setErr(''); setOk('');
    try { await post('admin/order-status', { id, status }); setOk(status === 'active' ? t('اتفعّل الطلب واتضافت الخدمات في حساب العميل.', 'Order activated; the services were added to the client\'s account.') : t('اتحدّث الطلب.', 'Order updated.')); load(); } catch (e) { setErr(errText(e, t)); }
  };
  const saveNote = async () => { if (!o || note === null) return; try { await post('admin/item-save', { item: { ...(o as unknown as Item), adminNote: note } }, { res: 'orders' }); setNote(null); load(); } catch (e) { setErr(errText(e, t)); } };
  const user = all?.users.find((u) => u.id === o?.uid);
  return (
    <Page title={t('الطلبات', 'Orders')}>
      <Notice err={err || error} ok={ok} />
      <div className="tabs tabs-bar" role="tablist">{FILTERS.map(([k, ar, en]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t(ar, en)}</button>)}</div>
      <Table head={[t('الرقم', 'No.'), t('العميل', 'Client'), t('الطلب', 'Order'), t('الإجمالي', 'Total'), t('الدفع', 'Payment'), t('الحالة', 'Status'), '']} empty={orders.length === 0 ? t('مفيش طلبات.', 'No orders.') : undefined}>
        {rows.map((x) => (
          <tr key={x.id}>
            <td><button className="link latin" onClick={() => { setOpen(x.id); setNote(null); }}>{x.number}</button><div className="muted latin">{day(x.created)}</div></td>
            <td>{all && <ClientLine users={all.users} uid={x.uid ?? ''} />}</td>
            <td>{x.summary}</td>
            <td><b className="latin">{x.total}</b> {cur}</td>
            <td>{x.payRef ? <span className="tag ok">{t('أبلغ بالدفع', 'Reported paid')}</span> : <span className="muted">—</span>}</td>
            <td><OrderTag s={x.status} /></td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => { setOpen(x.id); setNote(null); }}>{t('فتح', 'Open')}</button></td>
          </tr>
        ))}
      </Table>
      {pager}
      {o && (
        <Modal title={`${t('طلب', 'Order')} ${o.number}`} onClose={() => setOpen(null)} wide>
          <div className="row-actions" style={{ justifyContent: 'space-between' }}><OrderTag s={o.status} /><span className="muted latin">{day(o.created)}</span></div>
          <Table head={[t('البند', 'Item'), t('المدة', 'Term'), t('السعر', 'Price')]}>
            {o.lines.map((l, i) => <tr key={i}><td>{L({ ar: l.nameAr, en: l.nameEn })}</td><td>{unitLabel(l.unit, l.qty, t)}</td><td className="latin">{l.price}</td></tr>)}
          </Table>
          <p><b>{t('الإجمالي', 'Total')}:</b> <b className="latin">{o.total}</b> {o.currency || cur}</p>
          <dl className="kv">
            <div><dt>{t('العميل', 'Client')}</dt><dd>{user ? <Link className="link" to={`/admin/users/${user.id}`}>{user.name}</Link> : '-'}</dd></div>
            <div><dt>{t('وسيلة الدفع', 'Payment method')}</dt><dd>{(o as Order & { methodName?: string }).methodName || o.method || '-'}</dd></div>
            <div><dt>{t('رقم العملية', 'Payment reference')}</dt><dd><Ltr>{o.payRef || '-'}</Ltr></dd></div>
            <div><dt>{t('الدومين', 'Domain')}</dt><dd><Ltr>{o.domain || '-'}</Ltr></dd></div>
          </dl>
          {o.note && <p className="muted">{t('ملاحظة العميل:', 'Client note:')} {o.note}</p>}
          <div className="field"><label htmlFor="on">{t('ملاحظة داخلية', 'Internal note')}</label><textarea id="on" className="textarea" maxLength={1000} value={note ?? o.adminNote ?? ''} onChange={(e) => setNote(e.target.value)} />{note !== null && <button className="btn btn-ghost btn-sm" onClick={saveNote}>{t('حفظ الملاحظة', 'Save note')}</button>}</div>
          <div className="row-actions">{(NEXT[o.status] ?? []).map(([s, ar, en]) => <button key={s} className={`btn btn-sm ${s === 'cancelled' ? 'btn-ghost' : 'btn-accent'}`} onClick={() => { if (s !== 'cancelled' || window.confirm(t('تلغي الطلب؟ الفاتورة هتتلغي.', 'Cancel the order? Its invoice will be voided.'))) void setStatus(o.id, s); }}>{t(ar, en)}</button>)}</div>
          {o.status !== 'active' && <p className="muted">{t('"تفعيل" بيضيف الاستضافة والدومين والموقع في حساب العميل تلقائيًا (الدومين بيتسجّل عندك يدويًا عند المورد).', '"Activate" adds the hosting, domain and website to the client\'s account automatically (you still register the domain at the provider by hand).')}</p>}
        </Modal>
      )}
    </Page>
  );
}
