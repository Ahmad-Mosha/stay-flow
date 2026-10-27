import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../platform/database/database.js';
import type { PropertyRole } from './policy.js';

export interface Membership {
  readonly propertyId: string;
  readonly userId: string;
  readonly role: PropertyRole;
  readonly since: Date;
}

const MEMBERSHIP_COLUMNS = ['propertyId', 'userId', 'role', 'createdAt as since'] as const;

@Injectable()
export class MembershipsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findRole(propertyId: string, userId: string): Promise<PropertyRole | undefined> {
    const row = await this.db
      .selectFrom('propertyMembers')
      .select('role')
      .where('propertyId', '=', propertyId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    return row?.role;
  }

  async listByProperty(propertyId: string): Promise<Membership[]> {
    return this.db
      .selectFrom('propertyMembers')
      .select(MEMBERSHIP_COLUMNS)
      .where('propertyId', '=', propertyId)
      .orderBy('createdAt')
      .execute();
  }

  async listByUser(userId: string): Promise<Membership[]> {
    return this.db
      .selectFrom('propertyMembers')
      .select(MEMBERSHIP_COLUMNS)
      .where('userId', '=', userId)
      .orderBy('createdAt')
      .execute();
  }

  /** Adds the member, or returns undefined if they already belong to the property. */
  async insert(
    member: Omit<Membership, 'since'>,
    db: Database = this.db,
  ): Promise<Membership | undefined> {
    return db
      .insertInto('propertyMembers')
      .values(member)
      .onConflict((conflict) => conflict.columns(['propertyId', 'userId']).doNothing())
      .returning(MEMBERSHIP_COLUMNS)
      .executeTakeFirst();
  }

  async updateRole(
    propertyId: string,
    userId: string,
    role: PropertyRole,
  ): Promise<Membership | undefined> {
    return this.db
      .updateTable('propertyMembers')
      .set({ role })
      .where('propertyId', '=', propertyId)
      .where('userId', '=', userId)
      .returning(MEMBERSHIP_COLUMNS)
      .executeTakeFirst();
  }

  async delete(propertyId: string, userId: string): Promise<boolean> {
    const { numDeletedRows } = await this.db
      .deleteFrom('propertyMembers')
      .where('propertyId', '=', propertyId)
      .where('userId', '=', userId)
      .executeTakeFirstOrThrow();
    return numDeletedRows > 0n;
  }
}
