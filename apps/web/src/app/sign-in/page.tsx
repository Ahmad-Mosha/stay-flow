import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api } from '@/api/client';
import { hasSessionCookie, sessionCookieHeader } from '@/api/session-cookie';
import { SignInScreen } from '@/features/auth/sign-in-screen';
import { returnPath } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Sign in to the front desk',
  robots: { index: false },
};

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const { next } = await searchParams;
  const target = returnPath(typeof next === 'string' ? next : undefined);

  // Someone already signed in goes straight on.
  const jar = await cookies();
  if (hasSessionCookie(jar)) {
    const user = await api('currentUser', { cookie: sessionCookieHeader(jar) }).catch(() => null);
    if (user) redirect(target);
  }
  return <SignInScreen next={target} />;
}
