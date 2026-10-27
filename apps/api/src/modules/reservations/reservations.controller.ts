import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import {
  type ConfirmReservationRequest,
  confirmReservationRequestSchema,
  type ReservationResponse,
} from '@stay-flow/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import {
  IdempotencyKey,
  sendIdempotent,
} from '../../platform/idempotency/idempotency-key.decorator.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { ReservationsService } from './reservations.service.js';

const reservationParamsSchema = z.object({ id: z.uuid() });

type ReservationParams = z.infer<typeof reservationParamsSchema>;

@Controller('reservations/:id')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Param(new ZodValidationPipe(reservationParamsSchema)) { id }: ReservationParams,
    @Body(new ZodValidationPipe(confirmReservationRequestSchema)) body: ConfirmReservationRequest,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReservationResponse> {
    const guest = { name: body.guestName, email: body.guestEmail };
    return sendIdempotent(response, await this.reservations.confirm(id, guest, idempotencyKey));
  }

  @Post('release')
  @HttpCode(204)
  async release(
    @Param(new ZodValidationPipe(reservationParamsSchema)) { id }: ReservationParams,
  ): Promise<void> {
    await this.reservations.release(id);
  }
}
