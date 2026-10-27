import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors/app-error.js';
import { currentUserOf } from '../identity/current-user.js';
import { SessionGuard } from '../identity/session.guard.js';
import { MembershipsService } from './memberships.service.js';
import { can, type Permission } from './policy.js';
import { grantPropertyAccess } from './property-access.js';

const PERMISSION = Symbol('permission');

const propertyIdSchema = z.uuid();

/** Lets through members of the route's property whose role has the route's permission. */
@Injectable()
export class PropertyAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly memberships: MembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<Permission | undefined>(PERMISSION, context.getHandler());
    if (permission === undefined) {
      throw new Error('PropertyAccessGuard needs @HostAccess() on the route');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const user = currentUserOf(request);

    const { data: propertyId } = propertyIdSchema.safeParse(request.params.propertyId);
    const role =
      propertyId === undefined ? undefined : await this.memberships.roleOf(propertyId, user.id);
    // Outsiders get the same answer as for a property that does not exist.
    if (propertyId === undefined || role === undefined) {
      throw new AppError('NOT_FOUND', 'You have no property with this id.');
    }
    if (!can(role, permission)) {
      throw new AppError(
        'INSUFFICIENT_ROLE',
        `Your role here (${role.replace('_', ' ')}) does not allow this.`,
      );
    }

    grantPropertyAccess(request, { propertyId, userId: user.id, role });
    return true;
  }
}

/** Requires a signed-in member of the route's `:propertyId` whose role has `permission`. */
export function HostAccess(permission: Permission): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(PERMISSION, permission),
    UseGuards(SessionGuard, PropertyAccessGuard),
  );
}
