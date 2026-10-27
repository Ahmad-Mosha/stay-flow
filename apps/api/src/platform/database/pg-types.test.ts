import { describe, expect, it } from 'vitest';
import { parseInt8 } from './pg-types.js';

describe('parseInt8', () => {
  it('parses money in minor units as a number', () => {
    expect(parseInt8('520000')).toBe(520_000);
  });

  it('refuses a value that a JavaScript number cannot hold exactly', () => {
    expect(() => parseInt8('9007199254740993')).toThrow(RangeError);
  });
});
