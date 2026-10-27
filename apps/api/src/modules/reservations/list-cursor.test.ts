import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './list-cursor.js';

const position = {
  createdAt: '2026-10-27T10:00:00.123456Z',
  id: '019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b',
};

describe('list cursor', () => {
  it('gives back the position it was made from, to the microsecond', () => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('is safe to put in a URL as it is', () => {
    expect(encodeCursor(position)).toMatch(/^[\w-]+$/);
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    [
      'a position rounded to milliseconds',
      encodeCursor({ ...position, createdAt: '2026-10-27T10:00:00.123Z' }),
    ],
    ['an id that is not a UUID', encodeCursor({ ...position, id: '1 OR 1=1' })],
  ])('rejects %s with INVALID_CURSOR', (_name, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
  });
});
