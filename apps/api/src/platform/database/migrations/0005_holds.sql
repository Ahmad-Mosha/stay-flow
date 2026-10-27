-- A hold comes first; the guest gives their name and email when they confirm.
ALTER TABLE reservations
  ALTER COLUMN guest_name DROP NOT NULL,
  ALTER COLUMN guest_email DROP NOT NULL,
  ADD CONSTRAINT reservations_guest_details CHECK (
    status IN ('held', 'expired', 'released')
    OR (guest_name IS NOT NULL AND guest_email IS NOT NULL)
  );

-- Due holds, for the expiry sweeper and the lazy expiry before a booking.
CREATE INDEX reservations_hold_expiry_idx ON reservations (hold_expires_at) WHERE status = 'held';

-- The first successful response to a request, replayed when the client retries with the same key.
CREATE TABLE idempotency_keys (
  scope        text NOT NULL,
  key          text NOT NULL CHECK (length(key) BETWEEN 1 AND 255),
  request_hash text NOT NULL,
  response     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
