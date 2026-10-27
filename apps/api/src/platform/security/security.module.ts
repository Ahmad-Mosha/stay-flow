import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CrossOriginGuard } from './cross-origin.guard.js';

@Module({
  providers: [{ provide: APP_GUARD, useClass: CrossOriginGuard }],
})
export class SecurityModule {}
