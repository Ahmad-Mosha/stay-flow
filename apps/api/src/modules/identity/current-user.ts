import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from './user.js';

const signedInUsers = new WeakMap<Request, User>();

export function setCurrentUser(request: Request, user: User): void {
  signedInUsers.set(request, user);
}

/** The user the SessionGuard signed in for this request. */
export function currentUserOf(request: Request): User {
  const user = signedInUsers.get(request);
  if (user === undefined) {
    throw new Error('The route needs the SessionGuard before this point');
  }
  return user;
}

/** The signed-in user. Use on routes behind the SessionGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): User =>
  currentUserOf(context.switchToHttp().getRequest<Request>()),
);
