import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MembershipsRepository } from './memberships.repository.js';
import { MembershipsService } from './memberships.service.js';
import { PropertyAccessGuard } from './property-access.guard.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

/** Who may do what at each property: memberships, roles and the guard that checks them. */
@Module({
  imports: [IdentityModule],
  controllers: [TeamController],
  providers: [MembershipsRepository, MembershipsService, PropertyAccessGuard, TeamService],
  // Modules that put @HostAccess() on their routes also need the guards' dependencies.
  exports: [IdentityModule, MembershipsService],
})
export class AccessModule {}
