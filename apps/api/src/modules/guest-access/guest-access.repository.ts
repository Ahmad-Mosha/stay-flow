import { Inject, Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database } from '../../platform/database/database.js';

export interface NewGuestAccessToken {
  readonly reservationId: string;
  readonly tokenHash: Buffer;
  readonly expiresAt: Temporal.Instant;
}

@Injectable()
export class GuestAccessRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(token: NewGuestAccessToken): Promise<void> {
    await this.db
      .insertInto('guestAccessTokens')
      .values({
        reservationId: token.reservationId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt.toString(),
      })
      .execute();
  }

  /** The reservation a token opens, if the token is still valid at `at`. */
  async findReservationId(tokenHash: Buffer, at: Temporal.Instant): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('guestAccessTokens')
      .select('reservationId')
      .where('tokenHash', '=', tokenHash)
      .where('expiresAt', '>', new Date(at.epochMilliseconds))
      .executeTakeFirst();
    return row?.reservationId;
  }
}
