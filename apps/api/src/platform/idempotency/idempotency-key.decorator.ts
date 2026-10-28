import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import type { IdempotentResult } from './idempotency.service.js';

// Visible ASCII only, so a key is safe to store and to log.
export const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,255}$/;

/** The required `Idempotency-Key` request header, such as a UUID the client made for this action. */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const key = context.switchToHttp().getRequest<Request>().header('idempotency-key');
    if (key === undefined || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new AppError(
        'IDEMPOTENCY_KEY_INVALID',
        'Send an Idempotency-Key header of 1 to 255 visible ASCII characters, such as a UUID.',
      );
    }
    return key;
  },
);

/** Unwraps the response, marking a replay with `Idempotent-Replayed: true` as Stripe does. */
export function sendIdempotent<T>(response: Response, result: IdempotentResult<T>): T {
  if (result.replayed) {
    response.setHeader('Idempotent-Replayed', 'true');
  }
  return result.response;
}
