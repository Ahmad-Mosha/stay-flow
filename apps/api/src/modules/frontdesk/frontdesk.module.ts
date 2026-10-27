import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';

/** The host's daily work across rooms and bookings. */
@Module({
  imports: [AccessModule, PropertiesModule, InventoryModule, ReservationsModule],
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class FrontdeskModule {}
