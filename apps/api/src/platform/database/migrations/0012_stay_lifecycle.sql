-- What a cancellation paid back, worked out from the policy the guest booked under.
ALTER TABLE reservations ADD COLUMN refund_minor bigint;

-- Cancellations from before refunds were recorded count as fully refunded.
UPDATE reservations SET refund_minor = total_minor WHERE status = 'cancelled';

ALTER TABLE reservations ADD CONSTRAINT reservations_refund CHECK (
  (status = 'cancelled') = (refund_minor IS NOT NULL) AND refund_minor BETWEEN 0 AND total_minor
);

-- The staff member behind a host's change, for the booking's history. Host changes from before
-- this column have none.
ALTER TABLE reservation_events
  ADD COLUMN user_id uuid REFERENCES users (id),
  ADD CONSTRAINT reservation_events_user_is_host CHECK (user_id IS NULL OR actor = 'host');
