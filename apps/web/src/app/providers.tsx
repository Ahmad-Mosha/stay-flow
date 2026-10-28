'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';

declare module 'react-aria-components' {
  interface RouterConfig {
    href: Route;
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>['push']>[1]>;
  }
}

/** Sends every React Aria link through the Next.js router, so navigation stays client-side. */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <RouterProvider
      navigate={(href, options) => {
        router.push(href, options);
      }}
    >
      {children}
    </RouterProvider>
  );
}
