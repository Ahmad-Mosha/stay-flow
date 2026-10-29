'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria-components';
import { ApiError, isApiError } from '@/api/client';
import { locale } from '@/lib/format';
import { routes } from '@/lib/routes';

declare module 'react-aria-components' {
  interface RouterConfig {
    href: Route;
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>['push']>[1]>;
  }
}

// A session can end while a page is open (signed out in another tab, say): sign in again, then
// come back to the same page.
function signInAgain(error: Error) {
  if (!isApiError(error, 'UNAUTHENTICATED')) return;
  window.location.assign(routes.signIn(window.location.pathname + window.location.search));
}

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: signInAgain }),
    mutationCache: new MutationCache({ onError: signInAgain }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // A 4xx answer will not change on retry; a dropped connection or a 5xx might.
        retry: (failures, error) =>
          failures < 2 && !(error instanceof ApiError && error.status < 500),
      },
    },
  });
}

/**
 * Sends every React Aria link through the Next.js router, fixes the locale so the server and
 * the browser format dates alike, and shares one query cache.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={locale}>
        <RouterProvider
          navigate={(href, options) => {
            router.push(href, options);
          }}
        >
          {children}
        </RouterProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
