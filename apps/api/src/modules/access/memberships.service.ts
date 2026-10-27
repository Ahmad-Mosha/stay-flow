import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../platform/database/database.js';
import { type Membership, MembershipsRepository } from './memberships.repository.js';
import type { PropertyRole } from './policy.js';

/** The access module's public API for other modules. */
@Injectable()
export class MembershipsService {
  constructor(private readonly memberships: MembershipsRepository) {}

  async roleOf(propertyId: string, userId: string): Promise<PropertyRole | undefined> {
    return this.memberships.findRole(propertyId, userId);
  }

  async propertiesOf(userId: string): Promise<Membership[]> {
    return this.memberships.listByUser(userId);
  }

  /** Makes the creator of a new property its owner, in the transaction that creates it. */
  async addOwner(trx: Transaction, propertyId: string, userId: string): Promise<void> {
    await this.memberships.insert({ propertyId, userId, role: 'owner' }, trx);
  }
}
