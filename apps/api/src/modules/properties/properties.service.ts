import { Inject, Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Clock } from '../../platform/time/clock.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { MembershipsService } from '../access/memberships.service.js';
import type { PropertyRole } from '../access/policy.js';
import { type NewProperty, PropertiesRepository } from './properties.repository.js';
import type { Property } from './property.js';
import { checkStay } from './stay-rules.js';

export interface MemberProperty {
  readonly property: Property;
  readonly role: PropertyRole;
}

/** The properties module's public API for other modules. */
@Injectable()
export class PropertiesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly properties: PropertiesRepository,
    private readonly memberships: MembershipsService,
    private readonly clock: Clock,
  ) {}

  /** Creates a property owned by the user who creates it. */
  async create(property: NewProperty, ownerId: string): Promise<Property> {
    return this.db.transaction().execute(async (trx) => {
      const created = await this.properties.insert(trx, property);
      if (created === undefined) {
        throw new AppError('SLUG_TAKEN', 'Another property already uses this slug.');
      }
      await this.memberships.addOwner(trx, created.id, ownerId);
      return created;
    });
  }

  /** The properties the user works at, with their role at each. */
  async listForMember(userId: string): Promise<MemberProperty[]> {
    const memberships = await this.memberships.propertiesOf(userId);
    const properties = await this.properties.findByIds(memberships.map((m) => m.propertyId));
    const byId = new Map(properties.map((property) => [property.id, property]));
    return memberships.flatMap(({ propertyId, role }) => {
      const property = byId.get(propertyId);
      return property === undefined ? [] : [{ property, role }];
    });
  }

  async getById(id: string): Promise<Property> {
    const [property] = await this.properties.findByIds([id]);
    if (property === undefined) {
      throw new AppError('NOT_FOUND', 'No property has this id.');
    }
    return property;
  }

  /** Pass `trx` when calling from inside a transaction. */
  async getBySlug(slug: string, trx?: Transaction): Promise<Property> {
    const property = await this.properties.findBySlug(slug, trx);
    if (property === undefined) {
      throw new AppError('NOT_FOUND', 'No property has this slug.');
    }
    return property;
  }

  /** Today's date where the property is, which is what its stay rules count from. */
  today(property: Property): Temporal.PlainDate {
    return this.clock.today(property.timeZone);
  }

  assertStayAllowed(property: Property, stay: DateSpan): void {
    const violation = checkStay(property.stayRules, stay, this.today(property));
    if (violation !== undefined) {
      throw new AppError(violation.code, violation.detail);
    }
  }
}
