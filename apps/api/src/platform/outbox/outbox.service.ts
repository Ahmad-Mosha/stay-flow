import { Injectable } from '@nestjs/common';
import type { Transaction } from '../database/database.js';
import { currentRequestId } from '../logging/request-context.js';
import type { NewOutboxEvent } from './outbox-event.js';
import { OutboxRepository } from './outbox.repository.js';

/** How modules report a change's side effects. The worker delivers them once the change commits. */
@Injectable()
export class OutboxService {
  constructor(private readonly outbox: OutboxRepository) {}

  /**
   * Writes the event in the caller's transaction, so it exists exactly when the change does. It
   * keeps the id of the request being served, so the worker logs the delivery under that id.
   */
  async enqueue(trx: Transaction, event: NewOutboxEvent): Promise<void> {
    await this.outbox.insert(trx, event, currentRequestId() ?? null);
  }
}
