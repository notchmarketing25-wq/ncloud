import type { ReactNode } from 'react';
import { useI18n } from './i18n';
import type { Status } from './lib/types';

export function Page({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <><div className="page-head"><h1>{title}</h1>{action}</div>{children}</>;
}

export function StatusTag({ s }: { s: Status }) {
  const { t } = useI18n();
  const map: Record<Status, [string, string, string]> = {
    active: ['ok', 'نشط', 'Active'], pending: ['warn', 'قيد التفعيل', 'Pending'], expiring: ['bad', 'قرب ينتهي', 'Expiring'], stopped: ['', 'متوقف', 'Stopped'],
  };
  const [cls, ar, en] = map[s] ?? ['', s, s];
  return <span className={`tag ${cls}`}>{s === 'active' && <i className="dot" />}{t(ar, en)}</span>;
}

export function InvoiceTag({ s }: { s: 'due' | 'paid' | 'void' }) {
  const { t } = useI18n();
  const map = { paid: ['ok', 'مدفوعة', 'Paid'], due: ['bad', 'مستحقة', 'Due'], void: ['', 'ملغاة', 'Void'] } as const;
  const [cls, ar, en] = map[s];
  return <span className={`tag ${cls}`}>{t(ar, en)}</span>;
}

export function TicketTag({ s }: { s: 'open' | 'answered' | 'closed' }) {
  const { t } = useI18n();
  const map = { open: ['warn', 'مفتوحة', 'Open'], answered: ['ok', 'تم الرد', 'Answered'], closed: ['', 'مغلقة', 'Closed'] } as const;
  const [cls, ar, en] = map[s];
  return <span className={`tag ${cls}`}>{t(ar, en)}</span>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="table-wrap">
      <table className="tbl"><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>
      {empty && <div className="empty-note nt-hatch">{empty}</div>}
    </div>
  );
}

export function Meter({ value, tone }: { value: number; tone?: 'warn' }) {
  return <div className={`meter${tone ? ' ' + tone : ''}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export const day = (iso: string) => (iso || '').slice(0, 10);
export const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);
