import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { api, post } from '../lib/api';
import type { ClientData, DnsRec } from '../lib/types';
import { demoData } from './data';
import { useStore } from './store';

type Ctx = {
  data: ClientData | null; error: string; reload: () => Promise<void>;
  addDns: (domainId: string, rec: Omit<DnsRec, 'id'>) => Promise<void>;
  delDns: (domainId: string, rid: string) => Promise<void>;
  power: (serverId: string, on: boolean) => Promise<void>;
  snapshot: (serverId: string) => Promise<void>;
  createTicket: (subject: string, text: string) => Promise<void>;
  replyTicket: (id: string, text: string) => Promise<void>;
  closeTicket: (id: string) => Promise<void>;
  /** demo-only conveniences (in server mode the client asks via a ticket / the admin does it) */
  demo: { addMailbox: (address: string, quotaGb: number) => void; delMailbox: (id: string) => void; addServer: () => void; pay: (id: string) => void } | null;
};
const PortalCtx = createContext<Ctx | null>(null);
const rid = () => Math.random().toString(36).slice(2, 10);

export function PortalDataProvider({ children }: { children: ReactNode }) {
  const { mode } = useAuth();
  const [server, setServer] = useState<ClientData | null>(null);
  const [error, setError] = useState('');
  const [demo, setDemo] = useStore<ClientData>('portal2', demoData);

  const reload = useCallback(async () => {
    if (mode !== 'server') return;
    try { setServer(await api<ClientData>('me/data')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'error'); }
  }, [mode]);
  useEffect(() => { void reload(); }, [reload]);

  const isServer = mode === 'server';
  const now = () => new Date().toISOString();
  const withServer = (route: string, body: unknown) => async () => { await post(route, body); await reload(); };

  const value: Ctx = {
    data: isServer ? server : demo, error, reload,
    addDns: async (domainId, rec) => {
      if (isServer) return withServer('svc/dns-save', { id: domainId, ...rec })();
      setDemo((p) => ({ ...p, domains: p.domains.map((d) => (d.id === domainId ? { ...d, dns: [...d.dns, { ...rec, id: rid() }] } : d)) }));
    },
    delDns: async (domainId, recId) => {
      if (isServer) return withServer('svc/dns-delete', { id: domainId, rid: recId })();
      setDemo((p) => ({ ...p, domains: p.domains.map((d) => (d.id === domainId ? { ...d, dns: d.dns.filter((r) => r.id !== recId) } : d)) }));
    },
    power: async (id, on) => {
      if (isServer) return withServer('svc/server-power', { id, on })();
      setDemo((p) => ({ ...p, servers: p.servers.map((s) => (s.id === id ? { ...s, status: on ? 'active' : 'stopped', cpu: on ? 8 : 0, ram: on ? 22 : 0 } : s)) }));
    },
    snapshot: async (id) => {
      if (isServer) return withServer('svc/server-snapshot', { id })();
      setDemo((p) => ({ ...p, servers: p.servers.map((s) => (s.id === id ? { ...s, snapshots: s.snapshots + 1 } : s)) }));
    },
    createTicket: async (subject, text) => {
      if (isServer) return withServer('tickets/create', { subject, text })();
      setDemo((p) => ({ ...p, tickets: [{ id: rid(), subject, status: 'open', updated: now(), messages: [{ from: 'client', name: 'Demo', text, at: now() }] }, ...p.tickets] }));
    },
    replyTicket: async (id, text) => {
      if (isServer) return withServer('tickets/reply', { id, text })();
      setDemo((p) => ({ ...p, tickets: p.tickets.map((t) => (t.id === id ? { ...t, status: 'open', updated: now(), messages: [...t.messages, { from: 'client', name: 'Demo', text, at: now() }] } : t)) }));
    },
    closeTicket: async (id) => {
      if (isServer) return withServer('tickets/status', { id, status: 'closed' })();
      setDemo((p) => ({ ...p, tickets: p.tickets.map((t) => (t.id === id ? { ...t, status: 'closed' } : t)) }));
    },
    demo: isServer ? null : {
      addMailbox: (address, quotaGb) => setDemo((p) => ({ ...p, mailboxes: [...p.mailboxes, { id: rid(), address, quotaGb, usedGb: 0, status: 'active' }] })),
      delMailbox: (id) => setDemo((p) => ({ ...p, mailboxes: p.mailboxes.filter((m) => m.id !== id) })),
      addServer: () => setDemo((p) => ({ ...p, servers: [...p.servers, { id: rid(), name: `vps-${String(p.servers.length + 1).padStart(2, '0')}`, ip: `203.0.113.${30 + p.servers.length}`, spec: '1 vCPU · 2 GB · 40 GB', cpu: 3, ram: 14, status: 'active', snapshots: 0 }] })),
      pay: (id) => setDemo((p) => ({ ...p, invoices: p.invoices.map((i) => (i.id === id ? { ...i, status: 'paid' } : i)) })),
    },
  };
  return <PortalCtx.Provider value={value}>{children}</PortalCtx.Provider>;
}

export function usePortal(): Ctx {
  const v = useContext(PortalCtx);
  if (!v) throw new Error('usePortal outside PortalDataProvider');
  return v;
}
