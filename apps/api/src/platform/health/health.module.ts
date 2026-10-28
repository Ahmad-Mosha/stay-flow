import { Module } from '@nestjs/common';
import { GracefulShutdown } from './graceful-shutdown.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [GracefulShutdown],
})
export class HealthModule {}
