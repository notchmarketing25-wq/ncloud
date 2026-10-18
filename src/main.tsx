import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import './brand/fonts';
import './brand/tokens.css';
import './brand/base.css';
import './site/site.css';
import './portal/portal.css';
import { AdminAccount, AdminLayout, AdminOverview } from './admin/Admin';
import { AdminUsers } from './admin/Customers';
import { AdminUpdates } from './admin/Updates';
import { AdminPlans } from './admin/Plans';
import { AdminDomainDetail, AdminHostingDetail, AdminWebsiteDetail, AdminWebsites } from './admin/Detail';
import { AdminApps, AdminPricing, AdminPurchaseDetail, AdminPurchases } from './admin/Providers';
import { AdminActivity, AdminDomains, AdminHosting, AdminLeads, AdminMailboxes, AdminServers, AdminTickets } from './admin/Manage';
import { AdminSettings } from './admin/Settings';
import { SiteProvider } from './site/settings';
import { CatalogProvider } from './site/catalog';
import { CartProvider } from './site/cart';
import { CartPage, Checkout, OrderRedirect, PortalOrderDetail, PortalOrders } from './site/CartPages';
import { AdminOrders } from './admin/Orders';
import { PortalProfile, TermsPage } from './portal/Identity';
import { MailApp } from './portal/Mail';
import { ForgotPassword, PortalInvoice, PortalQuoteView, PortalQuotes, PublicQuote, RenewPage, ResetPassword } from './portal/Extras';
import { AdminInvoice, AdminInvoices, AdminTransactions } from './admin/Invoices';
import { AdminClient } from './admin/Client';
import { AuthProvider } from './auth';
import { I18nProvider } from './i18n';
import Layout from './site/Layout';
import { Cloud, Contact, Domains, EmailPage, Home, Hosting, NotFound, Pricing, Status, Websites } from './site/pages';
import { Login, Overview, Register, PortalBilling, PortalDomainDetail, PortalDomains, PortalEmail, PortalHosting, PortalHostingDetail, PortalLayout, PortalServers, PortalSupport, PortalWebsiteDetail, PortalWebsites } from './portal/Portal';

const Router = import.meta.env.VITE_ROUTER === 'browser' ? BrowserRouter : HashRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
      <SiteProvider>
      <CatalogProvider>
      <CartProvider>
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
            <Route path="cart" element={<CartPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="portal/login" element={<Login />} />
          <Route path="portal/register" element={<Register />} />
          <Route path="portal/forgot" element={<ForgotPassword />} />
          <Route path="portal/reset" element={<ResetPassword />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="domains" element={<AdminDomains />} />
            <Route path="domains/:id" element={<AdminDomainDetail />} />
            <Route path="websites" element={<AdminWebsites />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="websites/:id" element={<AdminWebsiteDetail />} />
            <Route path="hosting/:id" element={<AdminHostingDetail />} />
            <Route path="users/:id" element={<AdminClient />} />
            <Route path="updates" element={<AdminUpdates />} />
            <Route path="email" element={<AdminMailboxes />} />
            <Route path="hosting" element={<AdminHosting />} />
            <Route path="servers" element={<AdminServers />} />
            <Route path="invoices" element={<AdminInvoices />} />
            <Route path="invoices/:id" element={<AdminInvoice />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="leads" element={<AdminLeads />} />
            <Route path="apps" element={<AdminApps />} />
            <Route path="pricing" element={<AdminPricing />} />
            <Route path="purchases" element={<AdminPurchases />} />
            <Route path="purchases/:id" element={<AdminPurchaseDetail />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="settings/:section" element={<AdminSettings />} />
            <Route path="activity" element={<AdminActivity />} />
            <Route path="account" element={<AdminAccount />} />
          </Route>
          <Route path="mail" element={<MailApp />} />
          <Route path="quote/:token" element={<PublicQuote />} />
          <Route path="portal" element={<PortalLayout />}>
            <Route index element={<Overview />} />
            <Route path="domains" element={<PortalDomains />} />
            <Route path="domains/:id" element={<PortalDomainDetail />} />
            <Route path="websites" element={<PortalWebsites />} />
            <Route path="websites/:id" element={<PortalWebsiteDetail />} />
            <Route path="hosting/:id" element={<PortalHostingDetail />} />
            <Route path="order/:id" element={<OrderRedirect />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="orders" element={<PortalOrders />} />
            <Route path="invoices/:id" element={<PortalInvoice />} />
            <Route path="quotes" element={<PortalQuotes />} />
            <Route path="quotes/:id" element={<PortalQuoteView />} />
            <Route path="profile" element={<PortalProfile />} />
            <Route path="renew/:res/:id" element={<RenewPage />} />
            <Route path="orders/:id" element={<PortalOrderDetail />} />
            <Route path="email" element={<PortalEmail />} />
            <Route path="mail" element={<Navigate to="/mail" replace />} />
            <Route path="hosting" element={<PortalHosting />} />
            <Route path="servers" element={<PortalServers />} />
            <Route path="billing" element={<PortalBilling />} />
            <Route path="support" element={<PortalSupport />} />
          </Route>
        </Routes>
      </Router>
      </CartProvider>
      </CatalogProvider>
      </SiteProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
