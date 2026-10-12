import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './brand/fonts';
import './brand/tokens.css';
import './brand/base.css';
import './site/site.css';
import './portal/portal.css';
import { I18nProvider } from './i18n';
import Layout from './site/Layout';
import { Cloud, Contact, Domains, EmailPage, Home, Hosting, NotFound, Pricing, Status, Websites } from './site/pages';
import { Login, Overview, PortalBilling, PortalDomains, PortalEmail, PortalHosting, PortalLayout, PortalServers, PortalSupport } from './portal/Portal';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="domains" element={<Domains />} />
            <Route path="email" element={<EmailPage />} />
            <Route path="websites" element={<Websites />} />
            <Route path="hosting" element={<Hosting />} />
            <Route path="cloud" element={<Cloud />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="status" element={<Status />} />
            <Route path="contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="portal/login" element={<Login />} />
          <Route path="portal" element={<PortalLayout />}>
            <Route index element={<Overview />} />
            <Route path="domains" element={<PortalDomains />} />
            <Route path="email" element={<PortalEmail />} />
            <Route path="hosting" element={<PortalHosting />} />
            <Route path="servers" element={<PortalServers />} />
            <Route path="billing" element={<PortalBilling />} />
            <Route path="support" element={<PortalSupport />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
