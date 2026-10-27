import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { GuestReservationsController } from './guest-reservations.controller.js';
import { GuestReservationsService } from './guest-reservations.service.js';
import { HoldSweeper } from './hold-sweeper.js';
import { HoldsController } from './holds.controller.js';
import { HostReservationsController } from './host-reservations.controller.js';
import { HostReservationsRepository } from './host-reservations.repository.js';
import { HostReservationsService } from './host-reservations.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsRepository } from './reservations.repository.js';
import { ReservationsService } from './reservations.service.js';
import { StayLifecycleService } from './stay-lifecycle.service.js';

@Module({
  imports: [AccessModule, GuestAccessModule, PropertiesModule, InventoryModule],
  controllers: [
    HoldsController,
    ReservationsController,
    HostReservationsController,
    GuestReservationsController,
  ],
  providers: [
    ReservationsRepository,
    ReservationsService,
    HoldSweeper,
    HostReservationsRepository,
    HostReservationsService,
    StayLifecycleService,
    GuestReservationsService,
  ],
  exports: [
    ReservationsService,
    HostReservationsService,
    StayLifecycleService,
    GuestReservationsService,
    // Run by the worker's scheduler.
    HoldSweeper,
  ],
})
export class ReservationsModule {}
