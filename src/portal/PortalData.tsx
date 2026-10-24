import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { api, post } from '../lib/api';
import type { ClientData, DnsRec } from '../lib/types';

type Ctx = {
  data: ClientData | null; error: string; reload: () => Promise<void>;
  addDns: (domainId: string, rec: Omit<DnsRec, 'id'>) => Promise<void>;
  delDns: (domainId: string, rid: string) => Promise<void>;
  power: (serverId: string, on: boolean) => Promise<void>;
  snapshot: (serverId: string) => Promise<void>;
  createTicket: (subject: string, text: string) => Promise<void>;
  replyTicket: (id: string, text: string) => Promise<void>;
  closeTicket: (id: string) => Promise<void>;
};
const PortalCtx = createContext<Ctx | null>(null);

export function PortalDataProvider({ children }: { children: ReactNode }) {
  const { mode } = useAuth();
  const [data, setData] = useState<ClientData | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (mode !== 'server') return;
    try { setData(await api<ClientData>('me/data')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'error'); }
  }, [mode]);
  useEffect(() => { void reload(); }, [reload]);

  const act = (route: string, body: unknown) => async () => { await post(route, body); await reload(); };
  const value: Ctx = {
    data, error, reload,
    addDns: (domainId, rec) => act('svc/dns-save', { id: domainId, ...rec })(),
    delDns: (domainId, recId) => act('svc/dns-delete', { id: domainId, rid: recId })(),
    power: (id, on) => act('svc/server-power', { id, on })(),
    snapshot: (id) => act('svc/server-snapshot', { id })(),
    createTicket: (subject, text) => act('tickets/create', { subject, text })(),
    replyTicket: (id, text) => act('tickets/reply', { id, text })(),
    closeTicket: (id) => act('tickets/status', { id, status: 'closed' })(),
  };
  return <PortalCtx.Provider value={value}>{children}</PortalCtx.Provider>;
}

export function usePortal(): Ctx {
  const v = useContext(PortalCtx);
  if (!v) throw new Error('usePortal outside PortalDataProvider');
  return v;
}
