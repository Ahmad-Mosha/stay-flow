import { describe, expect, it } from 'vitest';
import { newReference } from './reservation-reference.js';

describe('newReference', () => {
  it('makes 8 characters the database accepts', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(newReference()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });
});
