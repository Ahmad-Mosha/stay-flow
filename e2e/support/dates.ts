/** The demo hotel counts its days in Cairo, whatever the time zone of the machine running the tests. */
const hotelTimeZone = 'Africa/Cairo';

/** Today at the demo hotel, as YYYY-MM-DD. */
export function hotelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: hotelTimeZone }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** A date the way the app writes it, such as "29 October 2026". */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
