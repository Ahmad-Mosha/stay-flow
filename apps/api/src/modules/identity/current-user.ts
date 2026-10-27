import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from './user.js';

const signedInUsers = new WeakMap<Request, User>();

export function setCurrentUser(request: Request, user: User): void {
  signedInUsers.set(request, user);
}

/** The signed-in user. Use on routes behind the SessionGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const user = signedInUsers.get(context.switchToHttp().getRequest<Request>());
    if (user === undefined) {
      throw new Error('@CurrentUser() needs the SessionGuard on the route');
    }
    return user;
  },
);
