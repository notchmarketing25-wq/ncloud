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
export function SvcCard({ host, title, sub, to, actions, dim, tech }: { host: string; title: ReactNode; sub: ReactNode; to?: string; actions?: ReactNode; dim?: boolean; tech?: unknown }) {
  const { t } = useI18n();
  const h = bare(host);
  const body = <><Preview host={host} /><div className="svc-main"><div className="svc-title">{tech ? <TechIcon type={tech} /> : null}{title}{h && <a className="svc-ext" href={`https://${h}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={t('افتح الموقع', 'Open the site')}>↗</a>}</div><div className="svc-sub">{sub}</div></div></>;
  return (
    <div className={`svc-card${dim ? ' dim' : ''}`}>
      {to ? <Link to={to} className="svc-link">{body}</Link> : <div className="svc-link">{body}</div>}
      {actions && <div className="svc-actions">{actions}</div>}
    </div>
  );
}

/** Small cell for tables: thumbnail + name + subscription ID. */
export function SvcCell({ host, name, sub, to, tech }: { host: string; name: ReactNode; sub?: string; to?: string; tech?: unknown }) {
  const inner = <><Preview host={host} size="sm" /><span className="svc-cell-t"><b>{tech ? <TechIcon type={tech} size={18} /> : null}{name}</b>{sub && <small className="latin muted">{sub}</small>}</span></>;
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

/* ───────── website technology badges (one consistent style) ───────── */
type TechKey = 'wordpress' | 'node' | 'next' | 'react' | 'vue' | 'php' | 'laravel' | 'python' | 'static' | 'joomla' | 'drupal' | 'other';
const TECH: Record<TechKey, { name: string; color: string; glyph: ReactNode }> = {
  wordpress: { name: 'WordPress', color: '#21759b', glyph: <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="Georgia,serif" fill="#fff">W</text> },
  node: { name: 'Node.js', color: '#3c873a', glyph: <path d="M12 4.5l6.5 3.75v7.5L12 19.5l-6.5-3.75v-7.5z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /> },
  next: { name: 'Next.js', color: '#111111', glyph: <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fontFamily="system-ui,sans-serif" fill="#fff">N</text> },
  react: { name: 'React', color: '#149eca', glyph: <g fill="none" stroke="#fff" strokeWidth="1.3"><ellipse cx="12" cy="12" rx="8" ry="3.2" /><ellipse cx="12" cy="12" rx="8" ry="3.2" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="8" ry="3.2" transform="rotate(120 12 12)" /><circle cx="12" cy="12" r="1.4" fill="#fff" /></g> },
  vue: { name: 'Vue', color: '#41b883', glyph: <path d="M5 6h3.5L12 12.5 15.5 6H19l-7 12z" fill="#fff" /> },
  php: { name: 'PHP', color: '#777bb3', glyph: <text x="12" y="16" textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="system-ui,sans-serif" fill="#fff">php</text> },
  laravel: { name: 'Laravel', color: '#ff2d20', glyph: <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui,sans-serif" fill="#fff">L</text> },
  python: { name: 'Python', color: '#3776ab', glyph: <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="system-ui,sans-serif" fill="#ffd43b">Py</text> },
  static: { name: 'HTML', color: '#e44d26', glyph: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> },
  joomla: { name: 'Joomla', color: '#f9a541', glyph: <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui,sans-serif" fill="#fff">J</text> },
  drupal: { name: 'Drupal', color: '#0678be', glyph: <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui,sans-serif" fill="#fff">D</text> },
  other: { name: 'Web', color: '#6b7280', glyph: <g fill="none" stroke="#fff" strokeWidth="1.4"><circle cx="12" cy="12" r="6.5" /><path d="M5.5 12h13M12 5.5c2 2 2 11 0 13M12 5.5c-2 2-2 11 0 13" /></g> },
};
export function techOf(type: unknown): TechKey | null {
  const s = String(type ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/wordpress|woocommerce|\bwp\b/.test(s)) return 'wordpress';
  if (/next/.test(s)) return 'next';
  if (/react/.test(s)) return 'react';
  if (/vue|nuxt/.test(s)) return 'vue';
  if (/node|express|nest/.test(s)) return 'node';
  if (/laravel/.test(s)) return 'laravel';
  if (/php/.test(s)) return 'php';
  if (/python|django|flask/.test(s)) return 'python';
  if (/html|static|vite|website builder|builder/.test(s)) return 'static';
  if (/joomla/.test(s)) return 'joomla';
  if (/drupal/.test(s)) return 'drupal';
  return 'other';
}
/** The technology of a site as a small badge: icon, and the name when `label` is on. */
export function TechIcon({ type, label = false, size = 22 }: { type: unknown; label?: boolean; size?: number }) {
  const k = techOf(type);
  if (!k) return null;
  const x = TECH[k];
  const name = k === 'other' ? String(type) : x.name;
  return (
    <span className="tech" title={name}>
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={name}><rect width="24" height="24" rx="6" fill={x.color} />{x.glyph}</svg>
      {label && <span className="tech-n latin">{name}</span>}
    </span>
  );
}
