import { Temporal } from 'temporal-polyfill';

/** The current time, injected so tests can fix it. */
export abstract class Clock {
  abstract now(): Temporal.Instant;

  /** Today's date in a time zone, such as a property's. */
  today(timeZone: string): Temporal.PlainDate {
    return this.now().toZonedDateTimeISO(timeZone).toPlainDate();
  }
}

export class SystemClock extends Clock {
  now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
}

/** Always returns the same instant. For tests and reproducible scripts. */
export class FixedClock extends Clock {
  constructor(private readonly instant: Temporal.Instant) {
    super();
  }

  now(): Temporal.Instant {
    return this.instant;
  }
}
