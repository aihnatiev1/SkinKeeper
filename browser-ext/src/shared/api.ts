const API_BASE = 'https://api.skinkeeper.store/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function getToken(): Promise<string | null> {
  const { sk_token } = await chrome.storage.local.get('sk_token');
  return sk_token || null;
}

export async function apiRequest<T>(path: string, opts: ApiOptions = {}): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Source': 'extension',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) return null;
    if (res.status === 204) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ sk_token: token });
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove('sk_token');
}
