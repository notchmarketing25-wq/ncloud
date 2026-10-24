/** Thin client for api/index.php. Static hosts (no PHP) answer with HTML/404, which callers treat as "demo mode". */
export type Kyc = { type: 'individual' | 'company'; nationalId: string; commercialReg: string; taxId: string; front: boolean; back: boolean; tax: boolean };
export type TermsStamp = { version: string; at: string; by: string; ip?: string };
export type User = { twoFactor?: boolean; phone?: string; company?: string; kyc?: Kyc; terms?: TermsStamp | null; addr?: Record<string, string>; disabled?: boolean; credit?: number; id: string; name: string; email: string; role: 'admin' | 'client'; created?: string | null };

function base(): string {
  const b = import.meta.env.BASE_URL;
  // Default build uses a relative base ('./'): resolve against the folder the page was opened from.
  return b === './' ? new URL('./', document.baseURI).href : b;
}
type Query = Record<string, string>;
/** Where the backend answers: api/index.php, or nc-api.php next to index.html when a host does not serve the api/ folder. */
let endpoint = 'api/index.php';
export const apiUrl = (route: string, query?: Query, file = endpoint) => {
  const extra = query ? Object.entries(query).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('') : '';
  return `${base()}${file}?r=${encodeURIComponent(route).replace('%2F', '/')}${extra}`;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T = unknown>(route: string, body?: unknown, query?: Query): Promise<T> {
  const init: RequestInit = { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.method = 'POST';
    init.headers = { ...init.headers, 'Content-Type': 'application/json', 'X-NC': '1' };
    init.body = JSON.stringify(body);
  }
  let res = await fetch(apiUrl(route, query), init);
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not JSON: static host or PHP error page */ }
  // The status check is the first call: when api/ is missing (404, not a JSON answer) try the root-level entry once.
  if (route === 'status' && endpoint === 'api/index.php' && (!res.ok || data === null) && (data === null || res.status === 404)) {
    try {
      const alt = await fetch(apiUrl(route, { _: String(Date.now()) }, 'nc-api.php'), init);
      const j = await alt.json();
      if (alt.ok && j) { endpoint = 'nc-api.php'; res = alt; data = j; }
    } catch { /* keep the first failure */ }
  }
  if (!res.ok || data === null) {
    const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/** POST with an empty JSON body (logout etc.). */
export const post = <T = unknown>(route: string, body: unknown = {}, query?: Query) => api<T>(route, body, query);
