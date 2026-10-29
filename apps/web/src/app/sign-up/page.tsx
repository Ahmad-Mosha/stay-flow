import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api } from '@/api/client';
import { hasSessionCookie, sessionCookieHeader } from '@/api/session-cookie';
import { AuthScreen } from '@/features/auth/auth-screen';
import { SignUpForm } from '@/features/auth/sign-up-form';

export const metadata: Metadata = {
  title: 'Create a host account',
  description: 'Open your property’s booking page and front desk on Stay Flow.',
};

export default async function SignUpPage() {
  // Someone already signed in goes straight to their properties.
  const jar = await cookies();
  if (hasSessionCookie(jar)) {
    const user = await api('currentUser', { cookie: sessionCookieHeader(jar) }).catch(() => null);
    if (user) redirect('/host');
  }
  return (
    <AuthScreen
      eyebrow="New host"
      title="Create your account"
      intro="For hosts who want their own booking page and front desk. You set up your property right after."
    >
      <SignUpForm />
    </AuthScreen>
  );
}
