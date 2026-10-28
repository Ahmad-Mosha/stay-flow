import { availabilityQuerySchema } from '@stay-flow/contracts';

export interface StaySearch {
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
}

export const DEFAULT_GUESTS = 2;
export const MAX_GUESTS = 8;

/** Reads the stay from the page's query string. Anything malformed is treated as not chosen yet. */
export function readStaySearch(params: URLSearchParams): StaySearch {
  const guests = Number(params.get('guests'));
  const search = {
    checkIn: params.get('checkIn'),
    checkOut: params.get('checkOut'),
    guests:
      Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS ? guests : DEFAULT_GUESTS,
  };
  const valid = availabilityQuerySchema.safeParse(search).success;
  return valid ? search : { checkIn: null, checkOut: null, guests: search.guests };
}

export function staySearchQuery(search: StaySearch): string {
  const params = new URLSearchParams();
  if (search.checkIn && search.checkOut) {
    params.set('checkIn', search.checkIn);
    params.set('checkOut', search.checkOut);
  }
  params.set('guests', String(search.guests));
  return params.toString();
}
