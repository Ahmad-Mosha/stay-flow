import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import {
  type PlaceHoldRequest,
  placeHoldRequestSchema,
  type ReservationResponse,
} from '@stay-flow/contracts';
import type { Response } from 'express';
import { Temporal } from 'temporal-polyfill';
import {
  IdempotencyKey,
  sendIdempotent,
} from '../../platform/idempotency/idempotency-key.decorator.js';
import { dateSpan } from '../../platform/time/date-span.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { ReservationsService } from './reservations.service.js';

@Controller('properties/:slug/holds')
export class HoldsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  async place(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(placeHoldRequestSchema)) body: PlaceHoldRequest,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReservationResponse> {
    const hold = {
      unitType: body.unitType,
      stay: dateSpan(Temporal.PlainDate.from(body.checkIn), Temporal.PlainDate.from(body.checkOut)),
      guests: body.guests,
    };
    return sendIdempotent(response, await this.reservations.placeHold(slug, hold, idempotencyKey));
  }
}
