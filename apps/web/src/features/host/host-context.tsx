'use client';

import type { HostPropertyResponse, UserResponse } from '@stay-flow/contracts';
import { createContext, use } from 'react';

export interface HostSession {
  user: UserResponse;
  /** The property in the address, as its staff see it, with the user's role there. */
  property: HostPropertyResponse;
}

export const HostContext = createContext<HostSession | null>(null);

export function useHost(): HostSession {
  const session = use(HostContext);
  if (!session) throw new Error('useHost needs a HostShell above it');
  return session;
}
