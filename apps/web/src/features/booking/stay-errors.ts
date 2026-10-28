import type { PropertyResponse } from '@stay-flow/contracts';
import { isApiError } from '@/api/client';
import { plural } from '@/lib/format';

/** What a search error means for the guest, in their words, from the API's stable codes. */
export function searchErrorCopy(error: unknown, property: PropertyResponse): string {
  const rules = property.stayRules;
  if (isApiError(error, 'CHECK_IN_PASSED'))
    return 'That check-in date has passed. Pick a date from today on.';
  if (isApiError(error, 'CHECK_IN_TOO_FAR'))
    return `Bookings open ${plural(rules.bookingWindowDays, 'day')} ahead. Pick an earlier check-in.`;
  if (isApiError(error, 'STAY_TOO_SHORT'))
    return `Stays here are at least ${plural(rules.minNights, 'night')}.`;
  if (isApiError(error, 'STAY_TOO_LONG'))
    return `Stays here are at most ${plural(rules.maxNights, 'night')}. Pick a shorter stay.`;
  return 'We could not load the rooms. Check your connection and try again.';
}
