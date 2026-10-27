import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import type { User } from './user.js';

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
}

export interface UserWithPassword extends User {
  readonly passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Inserts the user, or returns undefined if the email already has an account. */
  async insert(trx: Transaction, user: NewUser): Promise<User | undefined> {
    return trx
      .insertInto('users')
      .values(user)
      .onConflict((conflict) => conflict.expression(sql`lower(email)`).doNothing())
      .returning(['id', 'name', 'email'])
      .executeTakeFirst();
  }

  async findByEmail(email: string): Promise<UserWithPassword | undefined> {
    return this.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'passwordHash'])
      .where(sql<string>`lower(email)`, '=', email.toLowerCase())
      .executeTakeFirst();
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.updateTable('users').set({ passwordHash }).where('id', '=', id).execute();
  }
}
