import type { PropertyResponse } from '@stay-flow/contracts';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { api, isApiError } from '@/api/client';

/** One fetch per request, shared by the page and its metadata. */
export const getProperty = cache(async (slug: string): Promise<PropertyResponse> => {
  try {
    return await api('getProperty', { params: { slug } });
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND', 'VALIDATION_FAILED')) notFound();
    throw error;
  }
});
