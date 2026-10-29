import { NextResponse, type NextRequest } from 'next/server';
import { hasSessionCookie } from './api/session-cookie';

/**
 * Sends a visitor with no session straight to sign-in, keeping the page they asked for. The host
 * layout still asks the API, since a cookie can outlive its session.
 */
export function proxy(request: NextRequest) {
  if (hasSessionCookie(request.cookies)) return NextResponse.next();
  const signIn = new URL('/sign-in', request.url);
  signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = { matcher: '/host/:path*' };
