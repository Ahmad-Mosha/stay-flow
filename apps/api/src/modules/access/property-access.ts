import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PropertyRole } from './policy.js';

/** The property a host route acts on, and the signed-in user and their role there. */
export interface PropertyAccess {
  readonly propertyId: string;
  readonly userId: string;
  readonly role: PropertyRole;
}

const grants = new WeakMap<Request, PropertyAccess>();

export function grantPropertyAccess(request: Request, access: PropertyAccess): void {
  grants.set(request, access);
}

/** The access the PropertyAccessGuard granted. Use on routes marked with @HostAccess(). */
export const CurrentAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PropertyAccess => {
    const access = grants.get(context.switchToHttp().getRequest<Request>());
    if (access === undefined) {
      throw new Error('@CurrentAccess() needs @HostAccess() on the route');
    }
    return access;
  },
);
