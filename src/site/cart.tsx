import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** One thing in the cart: a plan (qty = periods) or a domain registration (qty = years). Prices are never stored here: the server recomputes them at checkout. */
export type CartItem = { kind: 'plan'; id: string; qty: number } | { kind: 'domain'; name: string; qty: number } | { kind: 'transfer'; name: string; qty: number };
type Ctx = { items: CartItem[]; count: number; addPlan: (id: string) => void; addDomain: (name: string) => void; addTransfer: (name: string) => void; removeWhere: (fn: (x: CartItem) => boolean) => void; replacePlan: (oldIds: string[], id: string) => void; setQty: (i: number, qty: number) => void; remove: (i: number) => void; clear: () => void; has: (key: string) => boolean };
const KEY = 'nc-cart';
const C = createContext<Ctx>({ items: [], count: 0, addPlan: () => {}, addDomain: () => {}, addTransfer: () => {}, removeWhere: () => {}, replacePlan: () => {}, setQty: () => {}, remove: () => {}, clear: () => {}, has: () => false });
export const useCart = () => useContext(C);

const load = (): CartItem[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => x && (x.kind === 'plan' || x.kind === 'domain' || x.kind === 'transfer')).slice(0, 20) : []; } catch { return []; } };

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode */ } }, [items]);
  const k = (x: CartItem) => (x.kind === 'plan' ? `p:${x.id}` : x.kind === 'transfer' ? `t:${x.name}` : `d:${x.name}`);
  const addPlan = useCallback((id: string) => setItems((c) => (c.some((x) => x.kind === 'plan' && x.id === id) ? c : [...c, { kind: 'plan', id, qty: 1 }])), []);
  const addDomain = useCallback((name: string) => setItems((c) => (c.some((x) => x.kind === 'domain' && x.name === name) ? c : [...c, { kind: 'domain', name, qty: 1 }])), []);
  const addTransfer = useCallback((name: string) => setItems((c) => (c.some((x) => x.kind === 'transfer' && x.name === name) ? c : [...c, { kind: 'transfer', name, qty: 1 }])), []);
  const removeWhere = useCallback((fn: (x: CartItem) => boolean) => setItems((c) => c.filter((x) => !fn(x))), []);
  const replacePlan = useCallback((oldIds: string[], id: string) => setItems((c) => [...c.filter((x) => !(x.kind === 'plan' && oldIds.includes(x.id))), ...(id ? [{ kind: 'plan' as const, id, qty: 1 }] : [])]), []);
  const setQty = useCallback((i: number, qty: number) => setItems((c) => c.map((x, j) => (j === i ? { ...x, qty: Math.max(1, qty) } : x))), []);
  const remove = useCallback((i: number) => setItems((c) => c.filter((_, j) => j !== i)), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo<Ctx>(() => ({ items, count: items.length, addPlan, addDomain, addTransfer, removeWhere, replacePlan, setQty, remove, clear, has: (key) => items.some((x) => k(x) === key) }), [items, addPlan, addDomain, addTransfer, removeWhere, replacePlan, setQty, remove, clear]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
