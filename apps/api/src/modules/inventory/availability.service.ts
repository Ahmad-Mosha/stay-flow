import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { dateSpan, type DateSpan } from '../../platform/time/date-span.js';
import { PropertiesService } from '../properties/properties.service.js';
import type { Property } from '../properties/property.js';
import { type CheckInWindow, checkInWindow } from '../properties/stay-rules.js';
import {
  type CalendarNight,
  calendarNights,
  offersFor,
  type UnitTypeOffer,
} from './availability.js';
import { InventoryRepository } from './inventory.repository.js';

export interface StaySearch {
  readonly property: Property;
  readonly stay: DateSpan;
  readonly guests: number;
  readonly offers: readonly UnitTypeOffer[];
}

export interface AvailabilityCalendar {
  readonly property: Property;
  readonly month: Temporal.PlainYearMonth;
  readonly checkInWindow: CheckInWindow;
  readonly nights: readonly CalendarNight[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly properties: PropertiesService,
    private readonly inventory: InventoryRepository,
  ) {}

  /** Free rooms and prices for one stay. Rejects stays the property's rules do not allow. */
  async search(slug: string, stay: DateSpan, guests: number): Promise<StaySearch> {
    const property = await this.properties.getBySlug(slug);
    this.properties.assertStayAllowed(property, stay);

    const [unitTypes, overrides] = await Promise.all([
      this.inventory.unitTypesFreeFor(property.id, stay, guests),
      this.inventory.rateOverrides(property.id, stay),
    ]);
    return { property, stay, guests, offers: offersFor(stay, unitTypes, overrides) };
  }

  /** Night-by-night availability for a month, for the date picker. */
  async calendar(
    slug: string,
    month: Temporal.PlainYearMonth,
    guests: number,
  ): Promise<AvailabilityCalendar> {
    const property = await this.properties.getBySlug(slug);
    const today = this.properties.today(property);
    const firstDay = month.toPlainDate({ day: 1 });
    const span = dateSpan(firstDay, firstDay.add({ months: 1 }));

    const [freeUnits, overrides] = await Promise.all([
      this.inventory.freeUnitsByNight(property.id, span, guests),
      this.inventory.rateOverrides(property.id, span),
    ]);
    return {
      property,
      month,
      checkInWindow: checkInWindow(property.stayRules, today),
      nights: calendarNights(span, freeUnits, overrides, today),
    };
  }
}
