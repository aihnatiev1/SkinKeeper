import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/download', '/legal', '/ref', '/privacy-extension', '/opengraph-image', '/sitemap.xml', '/api/auth', '/api/proxy/auth', '/api/proxy/prices'];

// Static asset extensions that are safe to skip auth on. `.includes('.')` was
// too loose — it let any dotted path (e.g. /portfolio.fake) bypass the cookie
// check entirely.
const STATIC_EXT_RE = /\.(svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf|eot|css|js|map|json|txt|xml|mp4|webm)$/i;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths, static files, and API proxy for public endpoints
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    STATIC_EXT_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const token = req.cookies.get('sk_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
