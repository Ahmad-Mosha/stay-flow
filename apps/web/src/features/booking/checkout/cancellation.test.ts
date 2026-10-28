import { describe, expect, it } from 'vitest';
import { freeCancellationEnds } from './cancellation';

describe('freeCancellationEnds', () => {
  it('counts back from check-in time in the property time zone', () => {
    // Cairo is UTC+2 in December: 14:00 local on the 16th, less 48 hours.
    expect(freeCancellationEnds('2026-12-16', '14:00', 'Africa/Cairo', 48).toISOString()).toBe(
      '2026-12-14T12:00:00.000Z',
    );
  });

  it('follows daylight saving time where the property observes it', () => {
    // Cairo is UTC+3 in summer.
    expect(freeCancellationEnds('2027-07-10', '14:00', 'Africa/Cairo', 24).toISOString()).toBe(
      '2027-07-09T11:00:00.000Z',
    );
  });

  it('ends at check-in itself when there is no free period', () => {
    expect(freeCancellationEnds('2026-12-16', '15:00', 'Europe/London', 0).toISOString()).toBe(
      '2026-12-16T15:00:00.000Z',
    );
  });
});
