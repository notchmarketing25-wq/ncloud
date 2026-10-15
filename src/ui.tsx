import { useEffect, type ReactNode } from 'react';
import { useI18n } from './i18n';
import type { Status } from './lib/types';

export function Page({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <><div className="page-head"><h1>{title}</h1>{action}</div>{children}</>;
}

export function StatusTag({ s }: { s: Status }) {
  const { t } = useI18n();
  const map: Record<Status, [string, string, string]> = {
    active: ['ok', 'نشط', 'Active'], pending: ['warn', 'قيد التفعيل', 'Pending'], expiring: ['bad', 'قرب ينتهي', 'Expiring'], stopped: ['', 'متوقف', 'Stopped'], archived: ['', 'مؤرشف', 'Archived'],
  };
  const [cls, ar, en] = map[s] ?? ['', s, s];
  return <span className={`tag ${cls}`}>{s === 'active' && <i className="dot" />}{t(ar, en)}</span>;
}

export function InvoiceTag({ s }: { s: 'draft' | 'due' | 'paid' | 'void' | 'refunded' | 'collections' }) {
  const { t } = useI18n();
  const map = { paid: ['ok', 'مدفوعة', 'Paid'], due: ['bad', 'غير مدفوعة', 'Unpaid'], void: ['', 'ملغاة', 'Cancelled'], draft: ['', 'مسودة', 'Draft'], refunded: ['warn', 'مستردة', 'Refunded'], collections: ['bad', 'تحصيل', 'Collections'] } as const;
  const [cls, ar, en] = map[s] ?? ['', s, s];
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

/** A window over the page: Esc or a click outside closes it. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="modal-x" onClick={onClose} aria-label={t('إغلاق', 'Close')}>×</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
