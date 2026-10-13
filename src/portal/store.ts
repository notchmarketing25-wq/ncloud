import { useCallback, useState } from 'react';

/** Demo persistence: state lives in this browser's localStorage so the static demo feels real. */
export function useStore<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
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
  return [value, set];
}
