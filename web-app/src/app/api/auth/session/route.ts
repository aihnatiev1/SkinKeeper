import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'sk_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// POST — set JWT token in httpOnly cookie
export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

// GET — check if authenticated
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME);
  return NextResponse.json({ authenticated: !!token?.value });
}

// DELETE — clear session
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
