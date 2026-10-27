import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './retry-policy.js';

describe('retryDelayMs', () => {
  it('doubles the wait after each failure', () => {
    const ceilings = [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, () => 1));

    expect(ceilings).toEqual([5_000, 10_000, 20_000, 40_000]);
  });

  it('waits between half and all of it, at random', () => {
    expect(retryDelayMs(3, () => 0)).toBe(10_000);
    expect(retryDelayMs(3, () => 0.5)).toBe(15_000);
  });

  it('never waits more than an hour', () => {
    expect(retryDelayMs(20, () => 1)).toBe(3_600_000);
  });
});
