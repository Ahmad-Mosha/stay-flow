import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { FixedClock } from './clock.js';

const at = (instant: string) => new FixedClock(Temporal.Instant.from(instant));

describe('Clock.today', () => {
  it("returns the date in the given time zone, not the server's", () => {
    // 22:30 UTC is already 01:30 the next day in Cairo (UTC+3 until Egypt's DST ends on Oct 29).
    const clock = at('2026-10-27T22:30:00Z');

    expect(clock.today('Africa/Cairo').toString()).toBe('2026-10-28');
    expect(clock.today('Europe/London').toString()).toBe('2026-10-27');
  });

  it('follows daylight-saving changes', () => {
    // Egypt's clocks move to UTC+3 on the last Friday of April, 2026-04-24.
    expect(at('2026-04-23T21:30:00Z').today('Africa/Cairo').toString()).toBe('2026-04-23');
    expect(at('2026-04-24T21:30:00Z').today('Africa/Cairo').toString()).toBe('2026-04-25');
  });
});
