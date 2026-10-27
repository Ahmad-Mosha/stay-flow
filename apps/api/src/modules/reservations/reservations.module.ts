import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { HoldSweeper } from './hold-sweeper.js';
import { HoldsController } from './holds.controller.js';
import { HostReservationsController } from './host-reservations.controller.js';
import { HostReservationsRepository } from './host-reservations.repository.js';
import { HostReservationsService } from './host-reservations.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsRepository } from './reservations.repository.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [AccessModule, PropertiesModule, InventoryModule],
  controllers: [HoldsController, ReservationsController, HostReservationsController],
  providers: [
    ReservationsRepository,
    ReservationsService,
    HoldSweeper,
    HostReservationsRepository,
    HostReservationsService,
  ],
  exports: [ReservationsService, HostReservationsService],
})
export class ReservationsModule {}
