import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { IdentityService } from './identity.service.js';
import { SessionCookie } from './session-cookie.js';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

@Module({
  controllers: [AuthController],
  providers: [IdentityService, SessionCookie, SessionGuard, SessionsRepository, UsersRepository],
  exports: [IdentityService, SessionCookie, SessionGuard],
})
export class IdentityModule {}
