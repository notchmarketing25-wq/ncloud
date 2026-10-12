import { useCallback, useState } from 'react';
import { dnsRecords, domains, invoices, mailboxes, servers } from './data';

/** Demo persistence: state lives in this browser's localStorage so the client area feels real. Swap for the API later. */
export function useStore<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const k = `ncloud-demo-${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw) as T;
    } catch { /* blocked or corrupt */ }
    return initial;
  });
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
      return v;
    });
  }, [k]);
  const reset = useCallback(() => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
    setValue(initial);
  }, [k, initial]);
  return [value, set, reset];
}

export type DnsRec = { type: string; host: string; value: string; ttl: number };
export type Server = (typeof servers)[number] & { snapshots: number };

const initialServers: Server[] = servers.map((s) => ({ ...s, snapshots: 0 }));
const initialDns: Record<string, DnsRec[]> = { [domains[0].name]: dnsRecords };

export const useDns = () => useStore<Record<string, DnsRec[]>>('dns', initialDns);
export const useMailboxes = () => useStore('mailboxes', mailboxes);
export const useServers = () => useStore<Server[]>('servers', initialServers);
export const useInvoices = () => useStore('invoices', invoices);
