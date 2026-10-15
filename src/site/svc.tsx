import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';

/** "brand.com" with the extension in the accent colour. */
export function DomainName({ name }: { name: string }) {
  const i = name.indexOf('.');
  if (i <= 0) return <Ltr>{name}</Ltr>;
  return <span className="dn" dir="ltr"><span className="dn-l">{name.slice(0, i)}</span><span className="dn-t">{name.slice(i)}</span></span>;
}

const bare = (v: string) => (v || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();

/** A screenshot of the live site (free mShots service). While it is not ready, or when there is no site, a tile with the name in the Notch style is shown. */
export function Preview({ host, size = 'md' }: { host: string; size?: 'sm' | 'md' }) {
  const h = bare(host);
  const [bad, setBad] = useState(false);
  const [ok, setOk] = useState(false);
  return (
    <span className={`pv pv-${size}`} aria-hidden>
      <span className="pv-tile"><i>{(h.split('.')[0] || '?').slice(0, 2).toUpperCase()}</i></span>
      {h && !bad && <img src={`https://s.wordpress.com/mshots/v1/${encodeURIComponent('https://' + h)}?w=${size === 'sm' ? 160 : 480}&h=${size === 'sm' ? 100 : 300}`} alt="" loading="lazy" onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth > 200 || size === 'sm') setOk(true); else setBad(false); }} onError={() => setBad(true)} style={{ opacity: ok ? 1 : 0 }} />}
    </span>
  );
}

/** One service as a card: preview, name, small print, and actions on the end. */
export function SvcCard({ host, title, sub, to, actions, dim }: { host: string; title: ReactNode; sub: ReactNode; to?: string; actions?: ReactNode; dim?: boolean }) {
  const { t } = useI18n();
  const h = bare(host);
  const body = <><Preview host={host} /><div className="svc-main"><div className="svc-title">{title}{h && <a className="svc-ext" href={`https://${h}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={t('افتح الموقع', 'Open the site')}>↗</a>}</div><div className="svc-sub">{sub}</div></div></>;
  return (
    <div className={`svc-card${dim ? ' dim' : ''}`}>
      {to ? <Link to={to} className="svc-link">{body}</Link> : <div className="svc-link">{body}</div>}
      {actions && <div className="svc-actions">{actions}</div>}
    </div>
  );
}

/** Small cell for tables: thumbnail + name + subscription ID. */
export function SvcCell({ host, name, sub, to }: { host: string; name: ReactNode; sub?: string; to?: string }) {
  const inner = <><Preview host={host} size="sm" /><span className="svc-cell-t"><b>{name}</b>{sub && <small className="latin muted">{sub}</small>}</span></>;
  return to ? <Link className="svc-cell" to={to}>{inner}</Link> : <span className="svc-cell">{inner}</span>;
}

/** "ID · Started · Renews" small print shared by cards. */
export function SubLine({ sub, started, expires, extra }: { sub?: string; started?: string; expires?: string; extra?: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="sub-line">
      {extra}
      {sub && <span className="latin">{sub}</span>}
      {started && <span>{t('بدأ', 'Started')} <Ltr>{started}</Ltr></span>}
      {expires && <span>{t('ينتهي', 'Renews')} <Ltr>{expires}</Ltr></span>}
    </span>
  );
}
