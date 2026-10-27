import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  type GuestCancelRequest,
  guestCancelRequestSchema,
  type GuestReservationResponse,
} from '@stay-flow/contracts';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { GuestAccess, GuestReservationId } from '../guest-access/guest-access.guard.js';
import { GuestReservationsService } from './guest-reservations.service.js';
import { toGuestReservationResponse } from './reservation-response.js';

/** The manage-booking link's API. The token decides the reservation, so the path names none. */
@Controller('guest/reservation')
@GuestAccess()
export class GuestReservationsController {
  constructor(private readonly reservations: GuestReservationsService) {}

  @Get()
  async get(@GuestReservationId() id: string): Promise<GuestReservationResponse> {
    return toGuestReservationResponse(await this.reservations.get(id));
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(
    @GuestReservationId() id: string,
    @Body(new ZodValidationPipe(guestCancelRequestSchema)) body: GuestCancelRequest,
  ): Promise<GuestReservationResponse> {
    await this.reservations.cancel(id, {
      expectedRefundMinor: body.expectedRefundMinor,
      reason: body.reason,
    });
    return toGuestReservationResponse(await this.reservations.get(id));
  }
}
