import { fromAbsolute, toCalendarDate } from '@internationalized/date';
import { serverNow } from '@/api/server-clock';

/** Today's date at the property, by the server's clock, as `2026-10-29`. */
export function todayAt(timeZone: string, now = serverNow()): string {
  return toCalendarDate(fromAbsolute(now, timeZone)).toString();
}
