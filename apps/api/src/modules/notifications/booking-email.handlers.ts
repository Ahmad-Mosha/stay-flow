import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import {
  type OutboxEvent,
  type OutboxHandler,
  PermanentFailure,
} from '../../platform/outbox/outbox-event.js';
import {
  type GuestReservation,
  GuestReservationsService,
} from '../reservations/guest-reservations.service.js';
import {
  RESERVATION_CANCELLED,
  RESERVATION_CONFIRMED,
  reservationCancelledSchema,
  reservationConfirmedSchema,
} from '../reservations/outbox-events.js';
import { cancellationEmail, confirmationEmail } from './booking-emails.js';
import { type Email, Mailer } from './mailer.js';

/** Emails the guest their confirmation, with a private link to manage the booking. */
@Injectable()
export class ConfirmationEmailHandler implements OutboxHandler {
  readonly type = RESERVATION_CONFIRMED;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reservations: GuestReservationsService,
    private readonly mailer: Mailer,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const { reservationId } = payloadOf(event, reservationConfirmedSchema);
    const booking = await this.reservations.get(reservationId);
    if (booking.reservation.status === 'cancelled') {
      // Cancelled before we got to it: the cancellation email is all the guest needs.
      return;
    }
    const link = await this.reservations.issueLink(reservationId);
    await this.mailer.send(
      emailTo(booking, event, confirmationEmail(booking, manageUrl(this.config, link.token))),
    );
  }
}

/** Tells the guest their booking is cancelled and what they get back. */
@Injectable()
export class CancellationEmailHandler implements OutboxHandler {
  readonly type = RESERVATION_CANCELLED;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reservations: GuestReservationsService,
    private readonly mailer: Mailer,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const { reservationId, cancelledBy } = payloadOf(event, reservationCancelledSchema);
    const booking = await this.reservations.get(reservationId);
    const link = await this.reservations.issueLink(reservationId);
    const url = manageUrl(this.config, link.token);
    await this.mailer.send(emailTo(booking, event, cancellationEmail(booking, cancelledBy, url)));
  }
}

/** A payload that does not parse never will, so the event dies rather than retrying. */
function payloadOf<T>(event: OutboxEvent, schema: z.ZodType<T>): T {
  const result = schema.safeParse(event.payload);
  if (!result.success) {
    throw new PermanentFailure(`Invalid ${event.type} payload: ${result.error.message}`);
  }
  return result.data;
}

function emailTo(
  { reservation }: GuestReservation,
  event: OutboxEvent,
  content: Omit<Email, 'to' | 'messageId'>,
): Email {
  if (reservation.guest === null) {
    throw new PermanentFailure(`Reservation ${reservation.id} has no guest to email`);
  }
  // The event id, so every delivery of the same event carries the same Message-ID.
  return { ...content, to: reservation.guest.email, messageId: `<${event.id}@stay-flow>` };
}

/** The token goes after #, which browsers never send to a server, so no log ever sees it. */
function manageUrl(config: AppConfig, token: string): string {
  return `${config.mail.webUrl}/manage#${token}`;
}
