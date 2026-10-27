import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository.js';
import { OutboxService } from './outbox.service.js';

@Global()
@Module({
  providers: [OutboxRepository, OutboxService],
  // The repository is for the worker process.
  exports: [OutboxService, OutboxRepository],
})
export class OutboxModule {}
