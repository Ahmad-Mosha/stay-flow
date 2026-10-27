import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../platform/database/database.js';
import type { User } from './user.js';

/** A session lasts 30 days, and starts over when used in its second half. */
const SESSION_DAYS = 30;
const RENEW_WITHIN_DAYS = 15;

export interface ActiveSession {
  readonly id: string;
  readonly user: User;
  readonly renewalDue: boolean;
}

@Injectable()
export class SessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Starts a session and returns when it expires, by the database clock. */
  async insert(userId: string, tokenHash: Buffer, db: Database = this.db): Promise<Date> {
    const { expiresAt } = await db
      .insertInto('sessions')
      .values({
        userId,
        tokenHash,
        expiresAt: sql<Date>`now() + make_interval(days => ${SESSION_DAYS})`,
      })
      .returning('expiresAt')
      .executeTakeFirstOrThrow();
    return expiresAt;
  }

  async findActive(tokenHash: Buffer): Promise<ActiveSession | undefined> {
    const row = await this.db
      .selectFrom('sessions as s')
      .innerJoin('users as u', 'u.id', 's.userId')
      .select(['s.id', 'u.id as userId', 'u.name', 'u.email'])
      .select(
        sql<boolean>`s.expires_at < now() + make_interval(days => ${RENEW_WITHIN_DAYS})`.as(
          'renewalDue',
        ),
      )
      .where('s.tokenHash', '=', tokenHash)
      .where('s.expiresAt', '>', sql<Date>`now()`)
      .executeTakeFirst();
    if (row === undefined) {
      return undefined;
    }
    return {
      id: row.id,
      user: { id: row.userId, name: row.name, email: row.email },
      renewalDue: row.renewalDue,
    };
  }

  /** Pushes the expiry a full session length ahead, and returns it. */
  async renew(id: string): Promise<Date | undefined> {
    const row = await this.db
      .updateTable('sessions')
      .set({ expiresAt: sql<Date>`now() + make_interval(days => ${SESSION_DAYS})` })
      .where('id', '=', id)
      .returning('expiresAt')
      .executeTakeFirst();
    return row?.expiresAt;
  }

  async delete(tokenHash: Buffer): Promise<void> {
    await this.db.deleteFrom('sessions').where('tokenHash', '=', tokenHash).execute();
  }
}
