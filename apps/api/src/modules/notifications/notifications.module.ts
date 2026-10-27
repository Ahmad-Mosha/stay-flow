import { Module } from '@nestjs/common';
import { OUTBOX_HANDLERS, type OutboxHandler } from '../../platform/outbox/outbox-event.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { CancellationEmailHandler, ConfirmationEmailHandler } from './booking-email.handlers.js';
import { Mailer } from './mailer.js';

/** The emails guests get. Runs in the worker process, as handlers of outbox events. */
@Module({
  imports: [ReservationsModule],
  providers: [
    Mailer,
    ConfirmationEmailHandler,
    CancellationEmailHandler,
    {
      provide: OUTBOX_HANDLERS,
      inject: [ConfirmationEmailHandler, CancellationEmailHandler],
      useFactory: (...handlers: OutboxHandler[]) => handlers,
    },
  ],
  exports: [OUTBOX_HANDLERS],
})
export class NotificationsModule {}
