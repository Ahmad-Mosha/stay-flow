import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { HostPropertiesController } from './host-properties.controller.js';
import { PropertiesController } from './properties.controller.js';
import { PropertiesRepository } from './properties.repository.js';
import { PropertiesService } from './properties.service.js';

@Module({
  imports: [AccessModule],
  controllers: [PropertiesController, HostPropertiesController],
  providers: [PropertiesRepository, PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
