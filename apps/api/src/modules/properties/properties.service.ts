import { Inject, Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import { isPgError, PgErrorCode } from '../../platform/database/pg-errors.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Clock } from '../../platform/time/clock.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { MembershipsService } from '../access/memberships.service.js';
import type { PropertyRole } from '../access/policy.js';
import {
  type NewProperty,
  PropertiesRepository,
  type PropertyChanges,
} from './properties.repository.js';
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

  /** Changes the settings. Bookings already made keep the terms in their policy snapshot. */
  async update(id: string, changes: PropertyChanges): Promise<Property> {
    try {
      return (await this.properties.update(id, changes)) ?? notFound();
    } catch (error) {
      // Only reachable when one side of the rule comes from the request and the other is stored.
      if (isPgError(error, PgErrorCode.CheckViolation, 'properties_stay_lengths')) {
        throw new AppError(
          'STAY_RULES_CONFLICT',
          'The longest stay cannot be shorter than the shortest stay.',
        );
      }
      throw error;
    }
  }

  async getById(id: string): Promise<Property> {
    const [property] = await this.properties.findByIds([id]);
    return property ?? notFound();
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

function notFound(): never {
  throw new AppError('NOT_FOUND', 'No property has this id.');
}
