'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api/client';

/** Ends the session and goes back to sign-in. */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('signOut'),
    // Nothing read under this session stays behind for whoever uses the device next.
    onSettled: () => {
      queryClient.clear();
      router.replace('/sign-in');
      router.refresh();
    },
  });
}
