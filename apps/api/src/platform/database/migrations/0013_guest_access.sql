-- A manage-booking link. The link carries a random token and only its SHA-256 is stored, so
-- reading this table opens no booking. A reservation can have several links, one per email.
CREATE TABLE guest_access_tokens (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  reservation_id uuid NOT NULL REFERENCES reservations (id),
  token_hash     bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL
);
