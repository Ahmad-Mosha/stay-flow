import { parseDateTime, toZoned } from '@internationalized/date';

/** When free cancellation ends: the check-in time on the arrival day, minus the policy's hours. */
export function freeCancellationEnds(
  checkIn: string,
  checkInTime: string,
  timeZone: string,
  freeCancellationHours: number,
): Date {
  return toZoned(parseDateTime(`${checkIn}T${checkInTime}`), timeZone)
    .subtract({ hours: freeCancellationHours })
    .toDate();
}
