import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Ltr, useI18n } from '../i18n';
import { api, apiUrl, post } from '../lib/api';
import { useCurrency } from '../site/settings';
import { Page } from '../ui';
import { errText } from './errors';

type Report = { currency: string; from: string; to: string; months: { month: string; invoiced: number; tax: number; collected: number; refunded: number; fees: number; costs: number; profit: number }[]; totals: { invoiced: number; tax: number; collected: number; refunded: number; fees: number; costs: number; profit: number }; outstanding: number; overdue: number; credit: number; byMethod: { key: string; amount: number }[]; byCategory: { key: string; amount: number }[]; topClients: { uid: string; name: string; collected: number }[] };
const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return d.toISOString().slice(0, 10); };

function Bars({ rows, label }: { rows: { key: string; amount: number }[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return <div className="bars">{rows.length === 0 ? <p className="muted">-</p> : rows.map((r) => <div key={r.key} className="bar-row"><span>{label(r.key)}</span><i style={{ width: `${Math.max(2, (r.amount / max) * 100)}%` }} /><b className="latin">{f(r.amount)}</b></div>)}</div>;
}

/** Admin → Reports: money in and out per month, what is owed, where it comes from, and CSV exports for the accountant. */
export function AdminReports() {
  const { t } = useI18n();
  const cur = useCurrency();
  const [from, setFrom] = useState(yearAgo());
  const [to, setTo] = useState(today());
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { setR(null); api<Report>('admin/ops/report', undefined, { from, to }).then(setR).catch((e) => setErr(errText(e, t))); }, [from, to, t]);
  useEffect(load, [load]);
  const cat = (k: string) => ({ hosting: t('استضافة', 'Hosting'), email: t('إيميلات', 'Email'), vps: 'VPS', site: t('تصميم مواقع', 'Web design'), bundle: t('باقات', 'Bundles'), domains: t('دومينات', 'Domains'), renewals: t('تجديدات', 'Renewals'), manual: t('فواتير يدوية', 'Manual invoices'), other: t('أخرى', 'Other'), custom: t('عروض أسعار', 'Quotes') } as Record<string, string>)[k] ?? k;
  const maxM = useMemo(() => Math.max(1, ...(r?.months ?? []).map((m) => Math.max(m.collected, m.costs))), [r]);
  const csv = (kind: string) => apiUrl('admin/ops/export', { kind, from, to });
  return (
    <Page title={t('التقارير المالية', 'Financial reports')}>
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="card inline-form" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
        <div className="field"><label htmlFor="rp-f">{t('من', 'From')}</label><input id="rp-f" className="input latin" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label htmlFor="rp-t">{t('إلى', 'To')}</label><input id="rp-t" className="input latin" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-ghost" onClick={load}>↻</button>
      </div>
      {!r ? <p className="muted">…</p> : (
        <>
          <div className="em-stats rp-stats">
            <div className="card"><span className="muted">{t('المحصّل', 'Collected')}</span><b className="latin">{f(r.totals.collected - r.totals.refunded)}</b><small className="muted latin">{cur}</small></div>
            <div className="card"><span className="muted">{t('المتفوتر', 'Invoiced')}</span><b className="latin">{f(r.totals.invoiced)}</b><small className="muted latin">{t('ضريبة', 'tax')} {f(r.totals.tax)}</small></div>
            <div className="card"><span className="muted">{t('تكلفة الشراء', 'Costs')}</span><b className="latin">{f(r.totals.costs)}</b><small className="muted latin">{t('رسوم بوابات', 'gateway fees')} {f(r.totals.fees)}</small></div>
            <div className="card"><span className="muted">{t('الربح', 'Profit')}</span><b className="latin">{f(r.totals.profit)}</b></div>
            <div className="card"><span className="muted">{t('مستحق على العملاء', 'Owed by clients')}</span><b className="latin">{f(r.outstanding)}</b><small className="muted latin">{t('متأخر', 'overdue')} {f(r.overdue)}</small></div>
            <div className="card"><span className="muted">{t('رصيد العملاء', 'Client credit')}</span><b className="latin">{f(r.credit)}</b></div>
          </div>
          <div className="card" style={{ overflow: 'auto' }}>
            <h3>{t('شهريًا', 'By month')}</h3>
            <table className="tbl"><thead><tr><th>{t('الشهر', 'Month')}</th><th>{t('المتفوتر', 'Invoiced')}</th><th>{t('المحصّل', 'Collected')}</th><th>{t('مسترد', 'Refunded')}</th><th>{t('التكلفة', 'Costs')}</th><th>{t('الربح', 'Profit')}</th><th style={{ minWidth: 140 }} /></tr></thead>
              <tbody>{r.months.length === 0 ? <tr><td colSpan={7} className="muted">{t('مفيش حركة في الفترة دي.', 'No activity in this period.')}</td></tr> : r.months.map((m) => (
                <tr key={m.month}><td className="latin">{m.month}</td><td className="latin">{f(m.invoiced)}</td><td className="latin">{f(m.collected)}</td><td className="latin">{f(m.refunded)}</td><td className="latin">{f(m.costs)}</td><td className="latin"><b>{f(m.profit)}</b></td>
                  <td><div className="mini-bars" aria-hidden="true"><i style={{ width: `${(m.collected / maxM) * 100}%` }} /><i className="cost" style={{ width: `${(m.costs / maxM) * 100}%` }} /></div></td></tr>))}
              </tbody></table>
          </div>
          <div className="rp-cols">
            <div className="card"><h3>{t('حسب وسيلة الدفع', 'By payment method')}</h3><Bars rows={r.byMethod} label={(k) => k} /></div>
            <div className="card"><h3>{t('حسب نوع الخدمة (المتفوتر)', 'By service type (invoiced)')}</h3><Bars rows={r.byCategory} label={cat} /></div>
            <div className="card"><h3>{t('أعلى العملاء (محصّل)', 'Top clients (collected)')}</h3><Bars rows={r.topClients.map((c) => ({ key: c.name, amount: c.collected }))} label={(k) => k} /></div>
          </div>
          <div className="card">
            <h3>{t('تصدير CSV (للمحاسب)', 'CSV export (for your accountant)')}</h3>
            <p className="muted">{t('الفواتير والمعاملات بتتصدّر حسب الفترة اللي فوق. الملفات بتفتح في Excel بالعربي.', 'Invoices and transactions follow the dates above. Files open in Excel with Arabic text intact.')}</p>
            <div className="row-actions">{[['invoices', t('الفواتير', 'Invoices')], ['transactions', t('المعاملات', 'Transactions')], ['clients', t('العملاء', 'Clients')], ['services', t('الخدمات', 'Services')], ['purchases', t('فواتير الشراء', 'Purchases')]].map(([k, l]) => <a key={k} className="btn btn-ghost btn-sm" href={csv(k)}>↓ {l}</a>)}</div>
          </div>
        </>
      )}
    </Page>
  );
}

type Backup = { name: string; size: number; created: string };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Admin → Backups: a full copy of the data (accounts, services, invoices, ID documents) that can be downloaded and restored. */
export function AdminBackups() {
  const { t } = useI18n();
  const [list, setList] = useState<{ backups: Backup[]; last: string; zip: boolean } | null>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<string | 'upload' | ''>('');
  const [file, setFile] = useState<File | null>(null); const [confirm, setConfirm] = useState('');
  const load = useCallback(() => { api<{ backups: Backup[]; last: string; zip: boolean }>('admin/ops/backups').then(setList).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<void>) => { setErr(''); setOk(''); setBusy(true); try { await fn(); load(); } catch (e) { setErr(errText(e, t)); } finally { setBusy(false); } };
  const restore = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const fd = new FormData(); fd.append('confirm', confirm);
      if (target === 'upload' && file) fd.append('file', file, file.name); else fd.append('name', target);
      const res = await fetch(apiUrl('admin/ops/backup-restore'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(j.error ?? res.status));
      setOk(t('اتسترجعت البيانات. اتعمل نسخة أمان قبلها: ', 'Data restored. A safety copy was made first: ') + j.restored.safety); setTarget(''); setConfirm(''); setFile(null);
    });
  };
  return (
    <Page title={t('النسخ الاحتياطي', 'Backups')} action={<button className="btn btn-accent btn-sm" disabled={busy || (list ? !list.zip : false)} onClick={() => void run(async () => { await post('admin/ops/backup-create', {}); setOk(t('اتعملت نسخة احتياطية.', 'Backup created.')); })}>{busy ? '…' : t('+ نسخة دلوقتي', '+ Back up now')}</button>}>
      {err && <div className="form-error" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}
      <div className="card"><p className="muted" style={{ margin: 0 }}>{t('النسخة فيها كل الحسابات والخدمات والفواتير والتذاكر ومستندات الهوية ومفاتيح المزوّدين. بتتعمل أوتوماتيك مرة كل يوم (وقبل كل تحديث وقبل أي استرجاع)، وبنحتفظ بآخر 10. حمّل نسخة بانتظام واحفظها خارج السيرفر في مكان آمن: النسخة حساسة.', 'A backup holds every account, service, invoice, ticket, ID document and provider key. One is made automatically each day (and before every update and every restore); the latest 10 are kept. Download one regularly and keep it off this server, somewhere safe: it is sensitive.')}</p>
        {list && list.last && <p className="muted">{t('آخر نسخة يومية:', 'Last daily backup:')} <Ltr>{list.last}</Ltr></p>}
        {list && !list.zip && <p className="form-error">{t('السيرفر مفيهوش إضافة zip، فمش هينفع تعمل نسخ. فعّلها من الاستضافة.', 'This server has no PHP zip extension, so backups are impossible. Enable it at your host.')}</p>}</div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="tbl"><thead><tr><th>{t('الملف', 'File')}</th><th>{t('التاريخ', 'Date')}</th><th>{t('الحجم', 'Size')}</th><th /></tr></thead>
          <tbody>{!list ? <tr><td colSpan={4}>…</td></tr> : list.backups.length === 0 ? <tr><td colSpan={4} className="muted">{t('مفيش نسخ لسه.', 'No backups yet.')}</td></tr> : list.backups.map((b) => (
            <tr key={b.name}><td className="latin" style={{ overflowWrap: 'anywhere' }}>{b.name}</td><td className="latin">{b.created.slice(0, 16).replace('T', ' ')}</td><td className="latin">{size(b.size)}</td>
              <td><div className="row-actions"><a className="btn btn-ghost btn-sm" href={apiUrl('admin/ops/backup-download', { name: b.name })}>↓ {t('تحميل', 'Download')}</a><button className="btn btn-ghost btn-sm" onClick={() => { setTarget(b.name); setFile(null); setConfirm(''); }}>{t('استرجاع', 'Restore')}</button><button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('تحذف النسخة؟', 'Delete this backup?'))) void run(async () => { await post('admin/ops/backup-delete', { name: b.name }); }); }}>{t('حذف', 'Delete')}</button></div></td></tr>))}
          </tbody></table>
      </div>
      <div className="card form">
        <h3>{t('استرجاع من ملف على جهازك', 'Restore from a file on your computer')}</h3>
        <div className="row-actions"><input type="file" accept=".zip,application/zip" aria-label={t('ملف النسخة', 'Backup file')} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setTarget(e.target.files?.[0] ? 'upload' : ''); setConfirm(''); }} /></div>
      </div>
      {target !== '' && (
        <form className="card form" onSubmit={restore} style={{ borderColor: 'var(--nt-error)' }}>
          <h3>{t('تأكيد الاسترجاع', 'Confirm the restore')}</h3>
          <p className="form-error">{t('ده هيستبدل كل البيانات الحالية بالنسخة (' , 'This replaces ALL current data with the backup (')}<Ltr>{target === 'upload' ? file?.name ?? '' : target}</Ltr>{t('). اللي اتعمل بعد النسخة هيضيع. هنعمل نسخة أمان قبل ما نبدأ.', '). Anything done after it is lost. A safety copy is made first.')}</p>
          <div className="field"><label htmlFor="bk-c">{t('اكتب RESTORE للتأكيد', 'Type RESTORE to confirm')}</label><input id="bk-c" className="input latin" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></div>
          <div className="row-actions"><button className="btn btn-primary" type="submit" disabled={busy || confirm !== 'RESTORE'}>{t('استرجع', 'Restore')}</button><button type="button" className="btn btn-ghost" onClick={() => { setTarget(''); setFile(null); }}>{t('إلغاء', 'Cancel')}</button></div>
        </form>
      )}
    </Page>
  );
}
