import type { HostPropertyResponse, StayRules, UpdatePropertyRequest } from '@stay-flow/contracts';
import { plural } from '@/lib/format';

/** The settings a host can change, as the form holds them. */
export interface SettingsDraft {
  name: string;
  checkInTime: string;
  checkOutTime: string;
  stayRules: StayRules;
}

export function draftOf(property: HostPropertyResponse): SettingsDraft {
  const { name, checkInTime, checkOutTime, stayRules } = property;
  return { name, checkInTime, checkOutTime, stayRules: { ...stayRules } };
}

const ruleKeys = [
  'minNights',
  'maxNights',
  'bookingWindowDays',
  'freeCancellationHours',
] as const satisfies readonly (keyof StayRules)[];

/** Only what differs from the saved settings, as the API takes it; null when nothing does. */
export function changesOf(
  saved: SettingsDraft,
  draft: SettingsDraft,
): UpdatePropertyRequest | null {
  const rules = Object.fromEntries(
    ruleKeys
      .filter((key) => draft.stayRules[key] !== saved.stayRules[key])
      .map((key) => [key, draft.stayRules[key]]),
  );
  const changes: UpdatePropertyRequest = {
    ...(draft.name.trim() !== saved.name && { name: draft.name.trim() }),
    ...(draft.checkInTime !== saved.checkInTime && { checkInTime: draft.checkInTime }),
    ...(draft.checkOutTime !== saved.checkOutTime && { checkOutTime: draft.checkOutTime }),
    ...(Object.keys(rules).length > 0 && { stayRules: rules }),
  };
  return Object.keys(changes).length > 0 ? changes : null;
}

export interface SettingsProblems {
  name?: string;
  minNights?: string;
  maxNights?: string;
  bookingWindowDays?: string;
  freeCancellationHours?: string;
}

/** What stops the draft from saving, by field, in words for the host. */
export function problemsOf(draft: SettingsDraft): SettingsProblems {
  const { minNights, maxNights, bookingWindowDays, freeCancellationHours } = draft.stayRules;
  const whole = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;
  return {
    ...(!draft.name.trim() && { name: 'Name the property' }),
    ...(!whole(minNights, 1, 365) && { minNights: 'Between 1 and 365 nights' }),
    ...(!whole(maxNights, 1, 365)
      ? { maxNights: 'Between 1 and 365 nights' }
      : whole(minNights, 1, 365) &&
        maxNights < minNights && { maxNights: 'At least as long as the shortest stay' }),
    ...(!whole(bookingWindowDays, 1, 730) && { bookingWindowDays: 'Between 1 and 730 days' }),
    ...(!whole(freeCancellationHours, 0, 720) && {
      freeCancellationHours: 'Between 0 and 720 hours',
    }),
  };
}

/** The rules as a guest reads them, such as "Stays of 1 to 21 nights, booked up to 365 days ahead." */
export function stayRulesSummary(rules: StayRules): string[] {
  const { minNights, maxNights, bookingWindowDays, freeCancellationHours } = rules;
  const length =
    minNights === maxNights
      ? `Stays of exactly ${plural(minNights, 'night')}`
      : `Stays of ${String(minNights)} to ${plural(maxNights, 'night')}`;
  return [
    `${length}, booked up to ${plural(bookingWindowDays, 'day')} ahead.`,
    freeCancellationHours === 0
      ? 'Free cancellation until check-in.'
      : `Free cancellation until ${plural(freeCancellationHours, 'hour')} before check-in. After that, the first night is not refunded.`,
  ];
}
