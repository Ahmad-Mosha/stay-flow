import { describe, expect, it } from 'vitest';
import {
  guestsQuerySchema,
  guestsSchema,
  isoDateSchema,
  localTimeSchema,
  nightsSchema,
  slugSchema,
  timeZoneSchema,
  yearMonthSchema,
} from './common.js';

describe('isoDateSchema', () => {
  it('accepts real calendar dates, leap days included', () => {
    expect(isoDateSchema.safeParse('2026-12-01').success).toBe(true);
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
  });

  it('rejects days that do not exist and other formats', () => {
    for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-5', '01/12/2026']) {
      expect(isoDateSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe('yearMonthSchema', () => {
  it('accepts a month and rejects anything else', () => {
    expect(yearMonthSchema.safeParse('2026-12').success).toBe(true);
    for (const value of ['2026-13', '2026-00', '0000-01', '2026-12-01']) {
      expect(yearMonthSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe('localTimeSchema', () => {
  it('accepts a 24-hour HH:MM time', () => {
    expect(localTimeSchema.safeParse('15:00').success).toBe(true);
    expect(localTimeSchema.safeParse('24:00').success).toBe(false);
  });
});

describe('guestsSchema', () => {
  it('takes a number, not text, from a JSON body', () => {
    expect(guestsSchema.parse(2)).toBe(2);
    expect(guestsSchema.safeParse('2').success).toBe(false);
  });
});

describe('guestsQuerySchema', () => {
  it('reads a guest count from query string text', () => {
    expect(guestsQuerySchema.parse('2')).toBe(2);
  });

  it('rejects counts that are not whole numbers from 1 to 20', () => {
    for (const value of ['0', '21', '1.5', 'two', '', ['1', '2']]) {
      expect(guestsQuerySchema.safeParse(value).success, String(value)).toBe(false);
    }
  });
});

describe('slugSchema', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(slugSchema.safeParse('garden-double').success).toBe(true);
    for (const value of ['Garden', 'garden--double', '-garden', 'garden double', '']) {
      expect(slugSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe('timeZoneSchema', () => {
  it('accepts IANA time zones', () => {
    for (const zone of ['Africa/Cairo', 'Europe/London', 'America/Argentina/Buenos_Aires', 'UTC']) {
      expect(timeZoneSchema.safeParse(zone).success).toBe(true);
    }
  });

  it('rejects unknown zones and bare offsets', () => {
    for (const zone of ['Africa/Atlantis', '+02:00', 'GMT+2 ', '']) {
      expect(timeZoneSchema.safeParse(zone).success).toBe(false);
    }
  });
});

describe('nightsSchema', () => {
  it('runs from the first night up to the morning after the last', () => {
    expect(nightsSchema.safeParse({ from: '2026-12-18', to: '2026-12-19' }).success).toBe(true);
  });

  it('rejects an empty or backwards span on `to`', () => {
    for (const to of ['2026-12-18', '2026-12-17']) {
      const result = nightsSchema.safeParse({ from: '2026-12-18', to });

      expect(result.error?.issues, to).toMatchObject([{ path: ['to'] }]);
    }
  });

  it('covers at most 730 nights', () => {
    expect(nightsSchema.safeParse({ from: '2026-01-01', to: '2028-01-01' }).success).toBe(true);
    expect(nightsSchema.safeParse({ from: '2026-01-01', to: '2028-01-02' }).success).toBe(false);
  });
});
