import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [PropertiesModule],
  controllers: [AvailabilityController],
  providers: [InventoryRepository, AvailabilityService, InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
