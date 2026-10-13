import type { ClientData } from '../lib/types';

/** Demo dataset for static (no-PHP) installs. In server mode the same shapes come from the API (me/data). */
export const demoData: ClientData = {
  domains: [
    { id: 'd1', name: 'acme-trading.com', status: 'active', expires: '2027-03-14', autoRenew: true, dns: [
      { id: 'r1', type: 'A', host: '@', value: '203.0.113.10', ttl: 3600 },
      { id: 'r2', type: 'CNAME', host: 'www', value: 'acme-trading.com', ttl: 3600 },
      { id: 'r3', type: 'MX', host: '@', value: '10 mail.ncloud.example', ttl: 3600 },
      { id: 'r4', type: 'TXT', host: '@', value: 'v=spf1 include:_spf.ncloud.example ~all', ttl: 3600 },
      { id: 'r5', type: 'TXT', host: '_dmarc', value: 'v=DMARC1; p=quarantine', ttl: 3600 },
    ] },
    { id: 'd2', name: 'acme.com.eg', status: 'expiring', expires: '2026-11-02', autoRenew: false, dns: [] },
    { id: 'd3', name: 'acmeshop.net', status: 'pending', expires: '2027-09-21', autoRenew: true, dns: [] },
  ],
  mailboxes: [
    { id: 'm1', address: 'info@acme-trading.com', usedGb: 1.2, quotaGb: 30, status: 'active' },
    { id: 'm2', address: 'sales@acme-trading.com', usedGb: 8.7, quotaGb: 30, status: 'active' },
    { id: 'm3', address: 'hr@acme-trading.com', usedGb: 0.3, quotaGb: 5, status: 'active' },
  ],
  hosting: [
    { id: 'h1', plan: 'Business', domain: 'acme-trading.com', diskGb: 50, usedGb: 12.4, status: 'active' },
    { id: 'h2', plan: 'Start', domain: 'acmeshop.net', diskGb: 10, usedGb: 0.8, status: 'pending' },
  ],
  servers: [
    { id: 's1', name: 'app-prod-01', ip: '203.0.113.21', spec: '2 vCPU · 4 GB · 80 GB', cpu: 34, ram: 61, status: 'active', snapshots: 0 },
    { id: 's2', name: 'db-prod-01', ip: '203.0.113.22', spec: '4 vCPU · 8 GB · 160 GB', cpu: 12, ram: 48, status: 'active', snapshots: 0 },
    { id: 's3', name: 'staging-01', ip: '203.0.113.23', spec: '1 vCPU · 2 GB · 40 GB', cpu: 0, ram: 0, status: 'stopped', snapshots: 0 },
  ],
  invoices: [
    { id: 'i1', number: 'INV-1042', date: '2026-10-01', item: 'استضافة Business', amount: 169, status: 'due' },
    { id: 'i2', number: 'INV-1038', date: '2026-09-01', item: 'استضافة Business', amount: 169, status: 'paid' },
    { id: 'i3', number: 'INV-1021', date: '2026-08-14', item: 'تسجيل acmeshop.net', amount: 649, status: 'paid' },
  ],
  tickets: [
    { id: 't1', subject: 'نقل دومين acme.com.eg', status: 'answered', updated: '2026-10-11T10:00:00Z', messages: [
      { from: 'client', name: 'Demo', text: 'عايز أنقل الدومين لنوتش كلاود.', at: '2026-10-10T09:00:00Z' },
      { from: 'admin', name: 'Support', text: 'تمام، ابعتلنا كود النقل (EPP).', at: '2026-10-11T10:00:00Z' } ] },
    { id: 't2', subject: 'زيادة مساحة الإيميل', status: 'closed', updated: '2026-09-28T10:00:00Z', messages: [
      { from: 'client', name: 'Demo', text: 'محتاج زيادة المساحة.', at: '2026-09-27T10:00:00Z' } ] },
  ],
};
