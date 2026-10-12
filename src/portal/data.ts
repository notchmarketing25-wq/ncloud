import type { Bi } from '../i18n';

/** Mock client-area data. Everything here is a placeholder to be replaced by the real backend. */
export type Status = 'active' | 'pending' | 'expiring' | 'stopped';

export const domains: { name: string; status: Status; expires: string; autoRenew: boolean }[] = [
  { name: 'acme-trading.com', status: 'active', expires: '2027-03-14', autoRenew: true },
  { name: 'acme.com.eg', status: 'expiring', expires: '2026-11-02', autoRenew: false },
  { name: 'acmeshop.net', status: 'pending', expires: '2027-09-21', autoRenew: true },
];

export const dnsRecords: { type: string; host: string; value: string; ttl: number }[] = [
  { type: 'A', host: '@', value: '203.0.113.10', ttl: 3600 },
  { type: 'CNAME', host: 'www', value: 'acme-trading.com', ttl: 3600 },
  { type: 'MX', host: '@', value: '10 mail.ncloud.example', ttl: 3600 },
  { type: 'TXT', host: '@', value: 'v=spf1 include:_spf.ncloud.example ~all', ttl: 3600 },
  { type: 'TXT', host: '_dmarc', value: 'v=DMARC1; p=quarantine', ttl: 3600 },
];

export const mailboxes: { address: string; usedGb: number; quotaGb: number; status: Status }[] = [
  { address: 'info@acme-trading.com', usedGb: 1.2, quotaGb: 30, status: 'active' },
  { address: 'sales@acme-trading.com', usedGb: 8.7, quotaGb: 30, status: 'active' },
  { address: 'hr@acme-trading.com', usedGb: 0.3, quotaGb: 5, status: 'active' },
];

export const hosting: { plan: string; domain: string; diskGb: number; usedGb: number; status: Status }[] = [
  { plan: 'Business', domain: 'acme-trading.com', diskGb: 50, usedGb: 12.4, status: 'active' },
  { plan: 'Start', domain: 'acmeshop.net', diskGb: 10, usedGb: 0.8, status: 'pending' },
];

export const servers: { name: string; ip: string; spec: string; cpu: number; ram: number; status: Status }[] = [
  { name: 'app-prod-01', ip: '203.0.113.21', spec: '2 vCPU · 4 GB · 80 GB', cpu: 34, ram: 61, status: 'active' },
  { name: 'db-prod-01', ip: '203.0.113.22', spec: '4 vCPU · 8 GB · 160 GB', cpu: 12, ram: 48, status: 'active' },
  { name: 'staging-01', ip: '203.0.113.23', spec: '1 vCPU · 2 GB · 40 GB', cpu: 0, ram: 0, status: 'stopped' },
];

export const invoices: { id: string; date: string; item: Bi; amount: number; status: 'paid' | 'due' }[] = [
  { id: 'INV-1042', date: '2026-10-01', item: { ar: 'استضافة Business', en: 'Business hosting' }, amount: 169, status: 'due' },
  { id: 'INV-1038', date: '2026-09-01', item: { ar: 'استضافة Business', en: 'Business hosting' }, amount: 169, status: 'paid' },
  { id: 'INV-1021', date: '2026-08-14', item: { ar: 'تسجيل acmeshop.net', en: 'acmeshop.net registration' }, amount: 649, status: 'paid' },
];

export const tickets: { id: string; subject: Bi; updated: string; status: 'open' | 'answered' | 'closed' }[] = [
  { id: 'TKT-311', subject: { ar: 'نقل دومين acme.com.eg', en: 'Transfer acme.com.eg' }, updated: '2026-10-11', status: 'answered' },
  { id: 'TKT-298', subject: { ar: 'زيادة مساحة الإيميل', en: 'Increase mailbox quota' }, updated: '2026-09-28', status: 'closed' },
];
