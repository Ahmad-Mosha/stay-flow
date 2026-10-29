import { describe, expect, it } from 'vitest';
import { filtersFromSearch, listQuery } from './reservation-filters';

describe('filtersFromSearch', () => {
  it('reads the search and the status from the address', () => {
    expect(filtersFromSearch(new URLSearchParams('q=+lind+&status=checked_in'))).toEqual({
      q: 'lind',
      status: 'checked_in',
    });
  });

  it('lists every booking when the address asks for nothing it can read', () => {
    expect(filtersFromSearch(new URLSearchParams('q=+&status=expired'))).toEqual({
      q: null,
      status: null,
    });
    expect(filtersFromSearch(new URLSearchParams('status=all'))).toEqual({ q: null, status: null });
  });
});

describe('listQuery', () => {
  it('sends only the filters that are set', () => {
    expect(listQuery({ q: null, status: null })).toEqual({});
    expect(listQuery({ q: 'lind', status: 'confirmed' }, 'next-page')).toEqual({
      q: 'lind',
      status: 'confirmed',
      cursor: 'next-page',
    });
  });
});
