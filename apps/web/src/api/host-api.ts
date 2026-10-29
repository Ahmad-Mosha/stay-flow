import type { EndpointName } from '@stay-flow/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { routes } from '@/lib/routes';
import { api, isApiError, type ApiArgs, type ApiResponse } from './client';
import { sessionCookieHeader } from './session-cookie';

/**
 * Calls the API as the signed-in host from a server component, forwarding their session cookie.
 * A session that has ended sends them to sign in again.
 */
export async function hostApi<N extends EndpointName>(
  name: N,
  ...[input]: ApiArgs<N>
): Promise<ApiResponse<N>> {
  const cookie = sessionCookieHeader(await cookies());
  try {
    return await api(name, ...([{ ...input, cookie }] as ApiArgs<N>));
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(routes.signIn());
    throw error;
  }
}
