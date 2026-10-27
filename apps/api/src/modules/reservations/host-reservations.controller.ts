import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type HostCancelRequest,
  hostCancelRequestSchema,
  type HostReservationDetailResponse,
  type ReservationListQuery,
  reservationListQuerySchema,
  type ReservationListResponse,
} from '@stay-flow/contracts';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { HostReservationsService } from './host-reservations.service.js';
import {
  toHostReservationDetailResponse,
  toHostReservationResponse,
} from './reservation-response.js';
import { StayLifecycleService } from './stay-lifecycle.service.js';

const reservationParamsSchema = z.object({ reservationId: z.uuid() });

type ReservationParams = z.infer<typeof reservationParamsSchema>;

const reservationParams = new ZodValidationPipe(reservationParamsSchema);

@Controller('host/properties/:propertyId/reservations')
export class HostReservationsController {
  constructor(
    private readonly reservations: HostReservationsService,
    private readonly lifecycle: StayLifecycleService,
  ) {}

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

  @Get(':reservationId')
  @HostAccess('property.view')
  async get(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(reservationParams) { reservationId }: ReservationParams,
  ): Promise<HostReservationDetailResponse> {
    return this.detail(propertyId, reservationId);
  }

  @Post(':reservationId/check-in')
  @HttpCode(200)
  @HostAccess('reservations.manage')
  async checkIn(
    @CurrentAccess() { propertyId, userId }: PropertyAccess,
    @Param(reservationParams) { reservationId }: ReservationParams,
  ): Promise<HostReservationDetailResponse> {
    await this.lifecycle.checkIn(propertyId, reservationId, { actor: 'host', userId });
    return this.detail(propertyId, reservationId);
  }

  @Post(':reservationId/check-out')
  @HttpCode(200)
  @HostAccess('reservations.manage')
  async checkOut(
    @CurrentAccess() { propertyId, userId }: PropertyAccess,
    @Param(reservationParams) { reservationId }: ReservationParams,
  ): Promise<HostReservationDetailResponse> {
    await this.lifecycle.checkOut(propertyId, reservationId, { actor: 'host', userId });
    return this.detail(propertyId, reservationId);
  }

  @Post(':reservationId/no-show')
  @HttpCode(200)
  @HostAccess('reservations.manage')
  async markNoShow(
    @CurrentAccess() { propertyId, userId }: PropertyAccess,
    @Param(reservationParams) { reservationId }: ReservationParams,
  ): Promise<HostReservationDetailResponse> {
    await this.lifecycle.markNoShow(propertyId, reservationId, { actor: 'host', userId });
    return this.detail(propertyId, reservationId);
  }

  @Post(':reservationId/cancel')
  @HttpCode(200)
  @HostAccess('reservations.manage')
  async cancel(
    @CurrentAccess() { propertyId, userId }: PropertyAccess,
    @Param(reservationParams) { reservationId }: ReservationParams,
    @Body(new ZodValidationPipe(hostCancelRequestSchema)) body: HostCancelRequest,
  ): Promise<HostReservationDetailResponse> {
    await this.lifecycle.cancel(propertyId, reservationId, {
      actor: 'host',
      userId,
      reason: body.reason,
      waiveFee: body.waiveFee,
    });
    return this.detail(propertyId, reservationId);
  }

  private async detail(propertyId: string, id: string): Promise<HostReservationDetailResponse> {
    return toHostReservationDetailResponse(await this.reservations.get(propertyId, id));
  }
}

function toDate(value: string | undefined): Temporal.PlainDate | undefined {
  return value === undefined ? undefined : Temporal.PlainDate.from(value);
}
