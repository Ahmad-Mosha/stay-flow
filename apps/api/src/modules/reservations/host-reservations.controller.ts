import { Controller, Get, Query } from '@nestjs/common';
import {
  type ReservationListQuery,
  reservationListQuerySchema,
  type ReservationListResponse,
} from '@stay-flow/contracts';
import { Temporal } from 'temporal-polyfill';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { HostReservationsService } from './host-reservations.service.js';
import { toHostReservationResponse } from './reservation-response.js';

@Controller('host/properties/:propertyId/reservations')
export class HostReservationsController {
  constructor(private readonly reservations: HostReservationsService) {}

  @Get()
  @HostAccess('property.view')
  async list(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Query(new ZodValidationPipe(reservationListQuerySchema)) query: ReservationListQuery,
  ): Promise<ReservationListResponse> {
    const page = await this.reservations.list(
      propertyId,
      {
        statuses: query.status,
        from: toDate(query.from),
        to: toDate(query.to),
        search: query.q,
      },
      { limit: query.limit, cursor: query.cursor },
    );
    return {
      reservations: page.reservations.map(toHostReservationResponse),
      nextCursor: page.nextCursor,
    };
  }
}

function toDate(value: string | undefined): Temporal.PlainDate | undefined {
  return value === undefined ? undefined : Temporal.PlainDate.from(value);
}
