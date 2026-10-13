import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className={`logo${dark ? ' on-dark' : ''}`} aria-label="Notch Cloud Services">
      <span className="logo-word">Notch</span><i className="dot" />
      <span className="logo-sub latin">CLOUD SERVICES</span>
    </Link>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button className="lang-btn" lang={next} onClick={() => setLang(next)} aria-label={next === 'en' ? 'Switch to English' : 'التبديل للعربية'}>
      {next === 'en' ? 'EN' : 'عربي'}
    </button>
  );
}

export default function Layout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  const names: Record<string, string> = {
    '/domains': t('دومينات', 'Domains'), '/email': t('إيميلات الأعمال', 'Business email'), '/websites': t('تصميم المواقع', 'Web design'),
    '/hosting': t('استضافة', 'Hosting'), '/cloud': t('كلاود وVPS', 'Cloud & VPS'), '/pricing': t('الأسعار', 'Pricing'),
    '/status': t('حالة الخدمات', 'Status'), '/contact': t('تواصل معنا', 'Contact'),
  };
  useEffect(() => {
    const page = names[pathname];
    document.title = page ? `${page} | Notch Cloud Services` : 'Notch Cloud Services | نوتش كلاود';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, t('ar', 'en')]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const nav = [
    { to: '/domains', label: t('دومينات', 'Domains') },
    { to: '/email', label: t('إيميلات', 'Email') },
    { to: '/websites', label: t('مواقع', 'Websites') },
    { to: '/hosting', label: t('استضافة', 'Hosting') },
    { to: '/cloud', label: t('كلاود', 'Cloud') },
    { to: '/pricing', label: t('الأسعار', 'Pricing') },
    { to: '/status', label: t('الحالة', 'Status') },
  ];

  return (
    <>
      <div className="announce"><span className="dot pulse" /> {t('كل الأرقام والأسعار في الموقع تجريبية لحد الإطلاق', 'All numbers and prices on this site are placeholders until launch')}</div>
      <header className={`header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="container header-in">
          <Logo />
          <nav className="nav" aria-label={t('القائمة الرئيسية', 'Main')}>
            {nav.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
          </nav>
          <div className="header-actions">
            <LangToggle />
            <Link to={user ? (user.role === 'admin' ? '/admin' : '/portal') : '/portal/login'} className="btn btn-ghost btn-sm hide-sm">{user ? t('لوحتي', 'My panel') : t('دخول العميل', 'Client login')}</Link>
            <Link to="/contact" className="btn btn-primary btn-sm hide-sm">{t('ابدأ الآن', 'Get started')}</Link>
            <button className="burger" onClick={() => setOpen(true)} aria-label={t('القائمة', 'Menu')}><span /><span /><span /></button>
          </div>
        </div>
      </header>

      {open && (
        <div className="mobile-nav on-dark" role="dialog" aria-modal="true">
          <div className="mobile-nav-top"><Logo dark /><button className="mobile-close" onClick={() => setOpen(false)} aria-label={t('إغلاق', 'Close')}>×</button></div>
          {nav.map((n) => <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}>{n.label}</NavLink>)}
          <div className="mobile-nav-foot">
            <Link to="/portal/login" className="btn btn-ghost">{t('دخول العميل', 'Client login')}</Link>
            <Link to="/contact" className="btn btn-accent">{t('ابدأ الآن', 'Get started')}</Link>
          </div>
        </div>
      )}

      <main><Outlet /></main>
      <Footer />
    </>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer on-dark">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo dark />
            <p className="footer-about">{t('دومينات، إيميلات، مواقع، استضافة وكلاود. كل حاجة تحتاجها أونلاين في مكان واحد.', 'Domains, email, websites, hosting and cloud. Everything you need online in one place.')}</p>
            <p className="status-line"><span className="dot pulse" /> <span className="latin">ALL SYSTEMS OPERATIONAL</span></p>
          </div>
          <div><h5>{t('الخدمات', 'Services')}</h5><Link to="/domains">{t('دومينات', 'Domains')}</Link><Link to="/email">{t('إيميلات', 'Email')}</Link><Link to="/websites">{t('مواقع', 'Websites')}</Link><Link to="/hosting">{t('استضافة', 'Hosting')}</Link><Link to="/cloud">{t('كلاود وVPS', 'Cloud & VPS')}</Link></div>
          <div><h5>{t('الشركة', 'Company')}</h5><Link to="/pricing">{t('الأسعار', 'Pricing')}</Link><Link to="/status">{t('حالة الخدمات', 'Status')}</Link><Link to="/contact">{t('تواصل معنا', 'Contact')}</Link></div>
          <div><h5>{t('العميل', 'Clients')}</h5><Link to="/portal/login">{t('دخول العميل', 'Client login')}</Link><Link to="/portal">{t('لوحة التحكم', 'Control panel')}</Link></div>
        </div>
        <div className="footer-word" aria-hidden>NOTCH</div>
        <div className="footer-bottom latin"><span>© {new Date().getFullYear()} NOTCH CLOUD SERVICES</span><span>PLACEHOLDER CONTENT</span></div>
      </div>
    </footer>
  );
}
