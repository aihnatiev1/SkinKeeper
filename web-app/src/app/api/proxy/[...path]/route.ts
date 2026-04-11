import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'https://api.skinkeeper.store';
const COOKIE_NAME = 'sk_token';

async function proxyRequest(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  const backendPath = `/api/${path.join('/')}`;
  const url = new URL(backendPath, BACKEND_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual', // Don't follow redirects — pass them through to the client
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text();
    if (body) fetchOptions.body = body;
  }

  const backendRes = await fetch(url.toString(), fetchOptions);

  // Forward redirects (e.g. Steam callback → /login/success)
  if (backendRes.status >= 300 && backendRes.status < 400) {
    const location = backendRes.headers.get('location');
    if (location) {
      return NextResponse.redirect(location, backendRes.status as 301 | 302 | 303 | 307 | 308);
    }
  }

  const contentType = backendRes.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  }

  const text = await backendRes.text();
  return new NextResponse(text, {
    status: backendRes.status,
    headers: { 'Content-Type': contentType },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
