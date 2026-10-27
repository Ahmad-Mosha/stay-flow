import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { hashSecretToken, newSecretToken } from '../../platform/security/secret-token.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { Clock } from '../../platform/time/clock.js';
import { GuestAccessRepository } from './guest-access.repository.js';

/** A link keeps working this long after check-out, so the guest can still see what they paid. */
const DAYS_AFTER_STAY = 30;

/** What goes in a manage-booking link. The token is never stored, so it exists only here. */
export interface GuestLink {
  readonly token: string;
  readonly expiresAt: Temporal.Instant;
}

/** Manage-booking links: a bearer token that opens one reservation, without an account. */
@Injectable()
export class GuestAccessService {
  constructor(
    private readonly tokens: GuestAccessRepository,
    private readonly clock: Clock,
  ) {}

  async issue(reservation: { readonly id: string; readonly stay: DateSpan }): Promise<GuestLink> {
    const token = newSecretToken();
    // Midnight UTC: a few hours either way do not matter a month after the stay.
    const expiresAt = reservation.stay.end
      .add({ days: DAYS_AFTER_STAY })
      .toZonedDateTime('UTC')
      .toInstant();
    await this.tokens.insert({
      reservationId: reservation.id,
      tokenHash: hashSecretToken(token),
      expiresAt,
    });
    return { token, expiresAt };
  }

  /** The reservation a token opens, or undefined for an unknown or expired token. */
  async authenticate(token: string): Promise<string | undefined> {
    return this.tokens.findReservationId(hashSecretToken(token), this.clock.now());
  }
}
