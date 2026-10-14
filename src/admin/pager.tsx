import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';

const KEY = 'nc-page-size';
export const PAGE_SIZES = [10, 20, 50, 100];
const readSize = () => { try { const n = Number(localStorage.getItem(KEY)); return PAGE_SIZES.includes(n) ? n : 20; } catch { return 20; } };

/** Prev / next and "how many per page" under a table. The chosen size is remembered for every list. */
export function Pager({ total, page, size, onPage, onSize }: { total: number; page: number; size: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= PAGE_SIZES[0] && size >= total) return null;
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <div className="pager">
      <span className="muted latin">{from}–{to} / {total}</span>
      <div className="row-actions" style={{ alignItems: 'center' }}>
        <label className="muted" htmlFor="pg-size">{t('في الصفحة', 'Per page')}</label>
        <select id="pg-size" className="select" style={{ height: 36, width: 76 }} value={size} onChange={(e) => onSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('السابق', 'Previous')}>‹</button>
        <span className="latin">{page} / {pages}</span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('التالي', 'Next')}>›</button>
      </div>
    </div>
  );
}

/** Slices a list into pages (20 by default). `resetKey` sends you back to page 1 when a filter or search changes. */
export function usePaged<T>(items: T[], resetKey = ''): { rows: T[]; pager: ReactNode } {
  const [size, setSizeState] = useState(readSize);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey, size]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const cur = Math.min(page, pages);
  const rows = useMemo(() => items.slice((cur - 1) * size, cur * size), [items, cur, size]);
  const setSize = (n: number) => { try { localStorage.setItem(KEY, String(n)); } catch { /* private mode */ } setSizeState(n); };
  return { rows, pager: <Pager total={items.length} page={cur} size={size} onPage={setPage} onSize={setSize} /> };
}
