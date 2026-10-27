import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { HoldSweeper } from './hold-sweeper.js';
import { HoldsController } from './holds.controller.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsRepository } from './reservations.repository.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [PropertiesModule, InventoryModule],
  controllers: [HoldsController, ReservationsController],
  providers: [ReservationsRepository, ReservationsService, HoldSweeper],
})
export class ReservationsModule {}
