import { Module } from '@nestjs/common';
import { GuestAccessGuard } from './guest-access.guard.js';
import { GuestAccessRepository } from './guest-access.repository.js';
import { GuestAccessService } from './guest-access.service.js';

/** Manage-booking links: the tokens and the guard that checks them. */
@Module({
  providers: [GuestAccessRepository, GuestAccessService, GuestAccessGuard],
  // Modules that put @GuestAccess() on their routes also need the guard's dependency.
  exports: [GuestAccessService],
})
export class GuestAccessModule {}
