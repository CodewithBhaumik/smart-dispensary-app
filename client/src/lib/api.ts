import type { ApiErrorBody } from '@shared/types';

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Token storage: per-tab (sessionStorage) so two windows can be signed in as
// different demo users, with localStorage as the fallback for new tabs.
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'sd.token';

export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      const current = sessionStorage.getItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      if (!current || localStorage.getItem(TOKEN_KEY) === current) localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`/api${path.startsWith('/') ? path : `/${path}`}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

interface RequestOptions {
  query?: Query;
  body?: unknown;
  formData?: FormData;
  asBlob?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the Smart Dispensary server. Is it running?');
  }

  if (!res.ok) {
    let payload: ApiErrorBody | null = null;
    try {
      payload = (await res.json()) as ApiErrorBody;
    } catch {
      /* not JSON */
    }
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/demo-login')) {
      unauthorizedHandler?.();
    }
    throw new ApiError(
      res.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? `Request failed (${res.status})`,
      payload?.error?.fields,
    );
  }

  if (opts.asBlob) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, { query }),
  upload: <T>(path: string, formData: FormData) => request<T>('POST', path, { formData }),
  blob: (path: string) => request<Blob>('GET', path, { asBlob: true }),
};

/** Friendly message for toasts. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Opens an authenticated file (e.g. a medical record) in a new tab. */
export async function openProtectedFile(path: string): Promise<void> {
  const popup = window.open('', '_blank');
  try {
    const blob = await api.blob(path);
    const url = URL.createObjectURL(blob);
    if (popup) popup.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    popup?.close();
    throw e;
  }
}
