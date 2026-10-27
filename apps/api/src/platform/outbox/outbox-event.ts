import type { JsonObject } from '../database/database.generated.js';

/** A side effect of a change, written to the outbox in the change's transaction. */
export interface NewOutboxEvent {
  /** Such as `reservation.confirmed`. */
  readonly type: string;
  readonly payload: JsonObject;
}

/** An event as the worker hands it to its handler. */
export interface OutboxEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  /**
   * Which delivery this is, from 1. Every claim adds one, so it also tells whether the claim that
   * returned this event is still the latest one.
   */
  readonly attempt: number;
}

/**
 * Delivers one type of event. Delivery is at least once: when a worker dies after the side effect
 * but before recording it, or a handler runs past its lease, the event is delivered again. So
 * handlers must tolerate a repeat.
 */
export interface OutboxHandler {
  readonly type: string;
  handle(event: OutboxEvent): Promise<void>;
}

/** The handlers the worker delivers to, one per event type. */
export const OUTBOX_HANDLERS = Symbol('OUTBOX_HANDLERS');

/** A failure that retrying cannot fix, such as a mailbox that does not exist. The event dies. */
export class PermanentFailure extends Error {
  override readonly name = 'PermanentFailure';
}
