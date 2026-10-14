import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import './brand/fonts';
import './brand/tokens.css';
import './brand/base.css';
import './site/site.css';
import './portal/portal.css';
import { AdminAccount, AdminLayout, AdminOverview, AdminUsers } from './admin/Admin';
import { AdminApps, AdminPricing, AdminPurchases } from './admin/Providers';
import { AdminActivity, AdminDomains, AdminHosting, AdminInvoices, AdminLeads, AdminMailboxes, AdminServers, AdminSettings, AdminTickets } from './admin/Manage';
import { SiteProvider } from './site/settings';
import { AuthProvider } from './auth';
import { I18nProvider } from './i18n';
import Layout from './site/Layout';
import { Cloud, Contact, Domains, EmailPage, Home, Hosting, NotFound, Pricing, Status, Websites } from './site/pages';
import { Login, Overview, PortalBilling, PortalDomains, PortalEmail, PortalHosting, PortalLayout, PortalServers, PortalSupport } from './portal/Portal';

const Router = import.meta.env.VITE_ROUTER === 'browser' ? BrowserRouter : HashRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
      <SiteProvider>
      <Router>
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
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="domains" element={<AdminDomains />} />
            <Route path="email" element={<AdminMailboxes />} />
            <Route path="hosting" element={<AdminHosting />} />
            <Route path="servers" element={<AdminServers />} />
            <Route path="invoices" element={<AdminInvoices />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="leads" element={<AdminLeads />} />
            <Route path="apps" element={<AdminApps />} />
            <Route path="pricing" element={<AdminPricing />} />
            <Route path="purchases" element={<AdminPurchases />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="activity" element={<AdminActivity />} />
            <Route path="account" element={<AdminAccount />} />
          </Route>
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
      </Router>
      </SiteProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
