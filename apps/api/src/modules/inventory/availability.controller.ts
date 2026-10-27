import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type AvailabilityCalendarQuery,
  type AvailabilityCalendarResponse,
  availabilityCalendarQuerySchema,
  type AvailabilityQuery,
  type AvailabilityResponse,
  availabilityQuerySchema,
} from '@stay-flow/contracts';
import { Temporal } from 'temporal-polyfill';
import { dateSpan, nightCount } from '../../platform/time/date-span.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import {
  type AvailabilityCalendar,
  AvailabilityService,
  type StaySearch,
} from './availability.service.js';

@Controller('properties/:slug/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  async search(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    const stay = dateSpan(
      Temporal.PlainDate.from(query.checkIn),
      Temporal.PlainDate.from(query.checkOut),
    );
    return toAvailabilityResponse(await this.availability.search(slug, stay, query.guests));
  }

  @Get('calendar')
  async calendar(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(availabilityCalendarQuerySchema)) query: AvailabilityCalendarQuery,
  ): Promise<AvailabilityCalendarResponse> {
    const month = Temporal.PlainYearMonth.from(query.month);
    return toCalendarResponse(await this.availability.calendar(slug, month, query.guests));
  }
}

function toAvailabilityResponse({
  property,
  stay,
  guests,
  offers,
}: StaySearch): AvailabilityResponse {
  return {
    checkIn: stay.start.toString(),
    checkOut: stay.end.toString(),
    nights: nightCount(stay),
    guests,
    currency: property.currency,
    unitTypes: offers.map((offer) => ({
      slug: offer.slug,
      name: offer.name,
      description: offer.description,
      maxGuests: offer.maxGuests,
      freeUnits: offer.freeUnits,
      nightlyRates: offer.nightlyRates.map((night) => ({
        date: night.date.toString(),
        rateMinor: night.rateMinor,
      })),
      totalMinor: offer.totalMinor,
    })),
  };
}

function toCalendarResponse(calendar: AvailabilityCalendar): AvailabilityCalendarResponse {
  return {
    month: calendar.month.toString(),
    currency: calendar.property.currency,
    checkInWindow: {
      earliest: calendar.checkInWindow.earliest.toString(),
      latest: calendar.checkInWindow.latest.toString(),
    },
    nights: calendar.nights.map((night) => ({
      date: night.date.toString(),
      available: night.available,
      fromRateMinor: night.fromRateMinor,
    })),
  };
}
