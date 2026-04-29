const PROXY_BASE = '/api/proxy';

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Set to true while a 401 redirect is in flight to avoid stampeding the
// /login route with multiple concurrent expired requests.
let isRedirectingToLogin = false;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${PROXY_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    // Centralized 401 handling — clear the cookie session and bounce to /login
    // so individual hooks/mutations don't have to surface a generic toast and
    // leave the user wondering why their click did nothing.
    if (res.status === 401 && typeof window !== 'undefined' && !isRedirectingToLogin) {
      isRedirectingToLogin = true;
      try { await authApi.clearSession(); } catch { /* best effort */ }
      const here = window.location.pathname + window.location.search;
      const isAuthRoute = here.startsWith('/login') || here.startsWith('/api/auth');
      if (!isAuthRoute) {
        const params = new URLSearchParams({ expired: '1', redirect: here });
        window.location.assign(`/login?${params.toString()}`);
      }
    }
    throw new ApiError(res.status, body.message || res.statusText, body.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Auth-specific calls (not proxied — go to Next.js API routes)
export const authApi = {
  setSession: (token: string) =>
    fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  clearSession: () =>
    fetch('/api/auth/session', { method: 'DELETE' }),
  getSession: () =>
    fetch('/api/auth/session').then(r => r.json()) as Promise<{ authenticated: boolean }>,
};

export { ApiError };
