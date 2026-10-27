import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../platform/errors/app-error.js';
import { GuestAccessService } from './guest-access.service.js';

/** 32 random bytes in base64url. Anything else cannot be a token, so it skips the database. */
const BEARER_TOKEN = /^Bearer ([\w-]{43})$/i;

const grants = new WeakMap<Request, string>();

/**
 * Lets through requests with a live manage-booking token in `Authorization: Bearer`. A header
 * rather than the URL keeps the token out of access logs, browser history and Referer headers.
 */
@Injectable()
export class GuestAccessGuard implements CanActivate {
  constructor(private readonly guestAccess: GuestAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER_TOKEN.exec(request.header('authorization') ?? '')?.[1];
    const reservationId =
      token === undefined ? undefined : await this.guestAccess.authenticate(token);
    if (reservationId === undefined) {
      throw new AppError(
        'INVALID_GUEST_LINK',
        'This booking link is not valid or has expired. Ask the property for a new one.',
      );
    }
    grants.set(request, reservationId);
    return true;
  }
}

/** Requires a manage-booking token. The route acts on the one reservation it opens. */
export function GuestAccess(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(GuestAccessGuard));
}

/** The reservation the GuestAccessGuard opened for this request. */
export const GuestReservationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const reservationId = grants.get(context.switchToHttp().getRequest<Request>());
    if (reservationId === undefined) {
      throw new Error('@GuestReservationId() needs @GuestAccess() on the route');
    }
    return reservationId;
  },
);
