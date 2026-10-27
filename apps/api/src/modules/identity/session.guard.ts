import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../../platform/errors/app-error.js';
import { setCurrentUser } from './current-user.js';
import { IdentityService } from './identity.service.js';
import { SessionCookie } from './session-cookie.js';

/** Lets a request through only with a live session, and keeps an active session from expiring. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityService,
    private readonly cookie: SessionCookie,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const token = this.cookie.read(request);
    const session = token === undefined ? undefined : await this.identity.authenticate(token);
    if (token === undefined || session === undefined) {
      if (token !== undefined) {
        this.cookie.clear(response);
      }
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    }

    if (session.renewedUntil !== undefined) {
      this.cookie.write(response, token, session.renewedUntil);
    }
    setCurrentUser(request, session.user);
    return true;
  }
}
