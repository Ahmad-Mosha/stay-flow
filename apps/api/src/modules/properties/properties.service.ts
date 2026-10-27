import { Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import { AppError } from '../../platform/errors/app-error.js';
import { Clock } from '../../platform/time/clock.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { PropertiesRepository } from './properties.repository.js';
import type { Property } from './property.js';
import { checkStay } from './stay-rules.js';

/** The properties module's public API for other modules. */
@Injectable()
export class PropertiesService {
  constructor(
    private readonly properties: PropertiesRepository,
    private readonly clock: Clock,
  ) {}

  async getBySlug(slug: string): Promise<Property> {
    const property = await this.properties.findBySlug(slug);
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
