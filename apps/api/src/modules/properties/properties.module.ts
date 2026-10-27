import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller.js';
import { PropertiesRepository } from './properties.repository.js';
import { PropertiesService } from './properties.service.js';

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesRepository, PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
