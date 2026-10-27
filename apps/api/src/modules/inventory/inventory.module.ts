import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { HostInventoryRepository } from './host-inventory.repository.js';
import { HostInventoryService } from './host-inventory.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';
import { RateOverridesController } from './rate-overrides.controller.js';
import { UnitTypesController } from './unit-types.controller.js';
import { UnitsController } from './units.controller.js';

@Module({
  imports: [AccessModule, PropertiesModule],
  controllers: [
    AvailabilityController,
    UnitTypesController,
    UnitsController,
    RateOverridesController,
  ],
  providers: [
    InventoryRepository,
    AvailabilityService,
    InventoryService,
    HostInventoryRepository,
    HostInventoryService,
  ],
  exports: [InventoryService, HostInventoryService],
})
export class InventoryModule {}
