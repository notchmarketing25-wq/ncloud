import { useState, type FormEvent } from 'react';
import { useI18n } from './i18n';
import type { DnsRec } from './lib/types';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];

/** The DNS records of one domain: list, delete and add. The caller decides where changes go. */
export function DnsEditor({ records, onAdd, onDelete, err, readOnly = false }: { readOnly?: boolean; records: DnsRec[]; onAdd: (r: Omit<DnsRec, 'id'>) => Promise<void>; onDelete: (id: string) => Promise<void>; err?: string }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: 'A', host: '', value: '', ttl: 3600 });
  const [busy, setBusy] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.value.trim()) return;
    setBusy(true);
    try { await onAdd({ ...f, host: f.host.trim() || '@', value: f.value.trim() }); setF({ ...f, host: '', value: '' }); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="dns">
        <div className="dns-row dns-head"><span>TYPE</span><span>HOST</span><span>VALUE</span><span>TTL</span><span /></div>
        {records.length === 0 && <div className="dns-empty nt-hatch-dark">{t('مفيش سجلات لسه', 'No records yet')}</div>}
        {records.map((r) => (
          <div className="dns-row" key={r.id}>
            <span>{r.type}</span><span>{r.host}</span><span>{r.value}</span><span>{r.ttl}</span>
            {!readOnly && <button className="dns-del" onClick={() => void onDelete(r.id)} aria-label={t('حذف السجل', 'Delete record')}>×</button>}
          </div>
        ))}
      </div>
      {err && <div className="form-error" style={{ marginTop: 10 }}>{err}</div>}
      {readOnly ? <p className="muted" style={{ marginTop: 10 }}>{t('إدارة DNS لدومينك عندنا. تواصل مع الدعم لأي تعديل.', 'DNS for this domain is managed by us. Contact support for any change.')}</p> : <form className="dns-form" onSubmit={add}>
        <select className="select" aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select>
        <input className="input latin" aria-label="Host" placeholder="@ / www" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} />
        <input className="input latin" aria-label="Value" placeholder={t('القيمة', 'Value')} required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        <select className="select" aria-label="TTL" value={f.ttl} onChange={(e) => setF({ ...f, ttl: Number(e.target.value) })}>{[300, 3600, 14400, 86400].map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn btn-primary" type="submit" disabled={busy}>{t('إضافة', 'Add')}</button>
      </form>}
    </div>
  );
}
