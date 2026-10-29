import { describe, expect, it } from 'vitest';
import { hostProperty } from '@/test/fixtures';
import { changesOf, draftOf, problemsOf, stayRulesSummary } from './settings-draft';

const saved = draftOf(hostProperty);

describe('changesOf', () => {
  it('is null while nothing differs', () => {
    expect(changesOf(saved, draftOf(hostProperty))).toBeNull();
  });

  it('sends only the fields and stay rules that changed', () => {
    const draft = {
      ...saved,
      checkInTime: '15:00',
      stayRules: { ...saved.stayRules, maxNights: 14 },
    };

    expect(changesOf(saved, draft)).toEqual({
      checkInTime: '15:00',
      stayRules: { maxNights: 14 },
    });
  });

  it('trims the name, and ignores spaces around it', () => {
    expect(changesOf(saved, { ...saved, name: `  ${saved.name} ` })).toBeNull();
    expect(changesOf(saved, { ...saved, name: ' Dar Nubia ' })).toEqual({ name: 'Dar Nubia' });
  });
});

describe('problemsOf', () => {
  it('finds none in the saved settings', () => {
    expect(problemsOf(saved)).toEqual({});
  });

  it('asks for a name', () => {
    expect(problemsOf({ ...saved, name: '   ' })).toEqual({ name: 'Name the property' });
  });

  it('keeps the longest stay at least as long as the shortest', () => {
    const rules = { ...saved.stayRules, minNights: 5, maxNights: 3 };

    expect(problemsOf({ ...saved, stayRules: rules })).toEqual({
      maxNights: 'At least as long as the shortest stay',
    });
  });

  it('keeps each rule whole and in range', () => {
    const rules = {
      minNights: 0,
      maxNights: 400,
      bookingWindowDays: 1.5,
      freeCancellationHours: Number.NaN,
    };

    expect(problemsOf({ ...saved, stayRules: rules })).toEqual({
      minNights: 'Between 1 and 365 nights',
      maxNights: 'Between 1 and 365 nights',
      bookingWindowDays: 'Between 1 and 730 days',
      freeCancellationHours: 'Between 0 and 720 hours',
    });
  });
});

describe('stayRulesSummary', () => {
  it('reads the rules as a guest would', () => {
    expect(stayRulesSummary(saved.stayRules)).toEqual([
      'Stays of 1 to 21 nights, booked up to 365 days ahead.',
      'Free cancellation until 48 hours before check-in. After that, the first night is not refunded.',
    ]);
  });

  it('handles a fixed length and cancellation up to check-in', () => {
    const rules = { minNights: 1, maxNights: 1, bookingWindowDays: 1, freeCancellationHours: 0 };

    expect(stayRulesSummary(rules)).toEqual([
      'Stays of exactly 1 night, booked up to 1 day ahead.',
      'Free cancellation until check-in.',
    ]);
  });
});
