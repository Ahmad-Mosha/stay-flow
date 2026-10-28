import { describe, expect, it } from 'vitest';
import { readStaySearch, staySearchQuery } from './stay-search';

const read = (query: string) => readStaySearch(new URLSearchParams(query));

describe('readStaySearch', () => {
  it('reads a stay from the query string', () => {
    expect(read('checkIn=2026-12-16&checkOut=2026-12-20&guests=3')).toEqual({
      checkIn: '2026-12-16',
      checkOut: '2026-12-20',
      guests: 3,
    });
  });

  it('treats malformed or backwards dates as not chosen yet, keeping the guests', () => {
    expect(read('checkIn=2026-12-20&checkOut=2026-12-16&guests=3')).toEqual({
      checkIn: null,
      checkOut: null,
      guests: 3,
    });
    expect(read('checkIn=tomorrow&checkOut=2026-12-16')).toMatchObject({ checkIn: null });
  });

  it('falls back to two guests when the count is missing or out of range', () => {
    expect(read('').guests).toBe(2);
    expect(read('guests=0').guests).toBe(2);
    expect(read('guests=9').guests).toBe(2);
    expect(read('guests=1.5').guests).toBe(2);
  });
});

describe('staySearchQuery', () => {
  it('writes both dates or neither', () => {
    expect(staySearchQuery({ checkIn: '2026-12-16', checkOut: '2026-12-20', guests: 2 })).toBe(
      'checkIn=2026-12-16&checkOut=2026-12-20&guests=2',
    );
    expect(staySearchQuery({ checkIn: '2026-12-16', checkOut: null, guests: 4 })).toBe('guests=4');
  });
});
