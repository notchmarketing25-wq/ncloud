import { useEffect, useState, type ReactNode } from 'react';
import { Ltr, useI18n } from '../i18n';
import { api } from '../lib/api';
import type { PayMethod } from '../lib/types';
import { useCurrency } from '../site/settings';
import { Field } from './kit';

type Row = Record<string, unknown>;

/** The billing details every service has (like the product / domain pages of a billing system): dates, amounts, promo code, provider subscription ID, payment method, tools, notes, reminder history. */
export function SvcFields({ kind, v, put }: { kind: 'domains' | 'hosting' | 'websites' | 'servers' | 'mailboxes'; v: Row; put: (k: string, val: unknown) => void }) {
  const { t } = useI18n();
  const cur = useCurrency();
  const [methods, setMethods] = useState<string[]>([]);
  useEffect(() => { api<{ payments?: PayMethod[] }>('admin/settings').then((s) => setMethods((s.payments ?? []).map((m) => m.nameEn || m.nameAr))).catch(() => undefined); }, []);
  const num = (k: string) => (v[k] === undefined || v[k] === null || v[k] === '' ? '' : String(v[k]));
  const setNum = (k: string) => (e: { target: { value: string } }) => put(k, e.target.value === '' ? '' : Number(e.target.value));
  const log = (v.remindLog as { at: string; days: number; to: string }[] | undefined) ?? [];
  const tog = (k: string, label: ReactNode, inverted = false) => (
    <label className="check"><input type="checkbox" checked={inverted ? !v[k] : Boolean(v[k])} onChange={(e) => put(k, inverted ? !e.target.checked : e.target.checked)} /> {label}</label>
  );
  return (
    <>
      <h4 style={{ gridColumn: '1 / -1', margin: '8px 0 0' }}>{t('الاشتراك والفوترة', 'Subscription & billing')}</h4>
      <Field id="sv-sub" label={t('معرّف الاشتراك (بتاعنا)', 'Subscription ID (ours)')}><input id="sv-sub" className="input latin" readOnly value={String(v.sub ?? '')} /></Field>
      <Field id="sv-ref" label={t('معرّف الاشتراك عند المزوّد', 'Provider subscription ID')}><input id="sv-ref" className="input latin" maxLength={80} value={String(v.subRef ?? '')} onChange={(e) => put('subRef', e.target.value)} /></Field>
      {kind === 'domains' && <Field id="sv-ry" label={t('مدة التسجيل (سنين)', 'Registration period (years)')}><input id="sv-ry" className="input latin" type="number" min={1} max={10} value={num('regYears')} onChange={setNum('regYears')} /></Field>}
      {kind === 'domains' && <Field id="sv-rd" label={t('تاريخ التسجيل', 'Registration date')}><input id="sv-rd" className="input latin" type="date" value={String(v.regDate ?? '')} onChange={(e) => put('regDate', e.target.value)} /></Field>}
      <Field id="sv-nd" label={t('تاريخ الاستحقاق القادم', 'Next due date')}><input id="sv-nd" className="input latin" type="date" value={String(v.nextDue ?? '')} onChange={(e) => put('nextDue', e.target.value)} /></Field>
      <Field id="sv-ex" label={kind === 'domains' ? t('تاريخ الانتهاء', 'Expiry date') : t('ينتهي الاشتراك', 'Subscription ends')}><input id="sv-ex" className="input latin" type="date" value={String(v.expires ?? '')} onChange={(e) => put('expires', e.target.value)} /></Field>
      <Field id="sv-fa" label={`${t('أول دفعة', 'First payment amount')} · ${cur}`}><input id="sv-fa" className="input latin" type="number" min={0} step="any" value={num('firstAmount')} onChange={setNum('firstAmount')} /></Field>
      {kind !== 'domains' && kind !== 'hosting' && <Field id="sv-pr" label={`${t('المبلغ المتكرر', 'Recurring amount')} · ${cur}`}><input id="sv-pr" className="input latin" type="number" min={0} step="any" value={num('price')} onChange={setNum('price')} /></Field>}
      <Field id="sv-pc" label={t('كود الخصم', 'Promotion code')}><input id="sv-pc" className="input latin" maxLength={40} value={String(v.promo ?? '')} onChange={(e) => put('promo', e.target.value)} /></Field>
      <Field id="sv-pm" label={t('وسيلة الدفع', 'Payment method')}><select id="sv-pm" className="select" value={String(v.payMethod ?? '')} onChange={(e) => put('payMethod', e.target.value)}><option value="">—</option>{methods.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
      <Field id="sv-ns" label={t('ما توقفش الخدمة لحد', 'Do not suspend until')}><input id="sv-ns" className="input latin" type="date" value={String(v.noSuspendUntil ?? '')} onChange={(e) => put('noSuspendUntil', e.target.value)} /></Field>
      {kind === 'domains' && (
        <div style={{ gridColumn: '1 / -1' }} className="row-actions">
          {tog('dnsOff', t('إدارة DNS للعميل', 'DNS management for the client'), true)}
          {tog('emailFwd', t('تحويل الإيميل', 'Email forwarding'))}
          {tog('idProtect', t('حماية الهوية (WHOIS)', 'ID protection'))}
        </div>
      )}
      <Field id="sv-an" label={t('ملاحظات الأدمن (مش بتظهر للعميل)', 'Admin notes (hidden from the client)')} wide><textarea id="sv-an" className="textarea" rows={3} maxLength={1000} value={String(v.adminNotes ?? '')} onChange={(e) => put('adminNotes', e.target.value)} /></Field>
      {kind === 'domains' && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h4>{t('سجل التذكيرات', 'Reminder history')}</h4>
          {log.length === 0 ? <p className="muted">{t('لسه مفيش تذكيرات اتبعتت.', 'No reminders sent yet.')}</p> : (
            <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('التاريخ', 'Date')}</th><th>{t('التذكير', 'Reminder')}</th><th>{t('إلى', 'To')}</th></tr></thead><tbody>
              {log.map((r, i) => <tr key={i}><td><Ltr>{r.at.slice(0, 16).replace('T', ' ')}</Ltr></td><td>{r.days < 0 ? t('منتهي', 'Expired') : t(`قبل الانتهاء بـ ${r.days} يوم`, `${r.days} days before expiry`)}</td><td><Ltr>{r.to}</Ltr></td></tr>)}
            </tbody></table></div>
          )}
        </div>
      )}
    </>
  );
}
