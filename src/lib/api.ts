/** Thin client for api/index.php. Static hosts (no PHP) answer with HTML/404, which callers treat as "demo mode". */
export type User = { id: string; name: string; email: string; role: 'admin' | 'client'; created?: string | null };

function base(): string {
  const b = import.meta.env.BASE_URL;
  // Default build uses a relative base ('./'): resolve against the folder the page was opened from.
  return b === './' ? new URL('./', document.baseURI).href : b;
}
export const apiUrl = (route: string) => `${base()}api/index.php?r=${encodeURIComponent(route).replace('%2F', '/')}`;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = unknown>(route: string, body?: unknown): Promise<T> {
  const init: RequestInit = { credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.method = 'POST';
    init.headers = { ...init.headers, 'Content-Type': 'application/json', 'X-NC': '1' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(apiUrl(route), init);
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not JSON: static host or PHP error page */ }
  if (!res.ok || data === null) {
    const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/** POST with an empty JSON body (logout etc.). */
export const post = <T = unknown>(route: string, body: unknown = {}) => api<T>(route, body);
