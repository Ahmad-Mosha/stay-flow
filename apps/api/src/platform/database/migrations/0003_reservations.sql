CREATE TYPE reservation_status AS ENUM (
  'held', 'confirmed', 'checked_in', 'checked_out', 'expired', 'released', 'cancelled', 'no_show'
);

CREATE TABLE reservations (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  property_id     uuid NOT NULL,
  unit_type_id    uuid NOT NULL,
  -- Crockford base32 without I, L, O and U, so it reads well over the phone.
  reference       text NOT NULL UNIQUE CHECK (reference ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  status          reservation_status NOT NULL,
  nights          date_span NOT NULL,
  guests          int NOT NULL CHECK (guests BETWEEN 1 AND 20),
  guest_name      text NOT NULL CHECK (length(btrim(guest_name)) BETWEEN 1 AND 200),
  guest_email     text NOT NULL CHECK (guest_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(guest_email) <= 254),
  currency        text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor     bigint NOT NULL CHECK (total_minor >= 0),
  price_snapshot  jsonb NOT NULL CHECK (jsonb_typeof(price_snapshot) = 'object'),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  hold_expires_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservations_hold_expiry CHECK (status <> 'held' OR hold_expires_at IS NOT NULL),
  UNIQUE (property_id, id),
  FOREIGN KEY (property_id, unit_type_id) REFERENCES unit_types (property_id, id)
);

CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A room's taken nights: a reservation's stay or a host block. Released rows keep the history.
CREATE TABLE occupancies (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  property_id    uuid NOT NULL,
  unit_id        uuid NOT NULL,
  nights         date_span NOT NULL,
  reservation_id uuid,
  block_reason   text CHECK (length(btrim(block_reason)) BETWEEN 1 AND 200),
  released_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occupancies_reservation_or_block CHECK ((reservation_id IS NULL) <> (block_reason IS NULL)),
  FOREIGN KEY (property_id, unit_id) REFERENCES units (property_id, id),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservations (property_id, id),
  -- The double-booking guard: no two active rows for one room may share a night.
  CONSTRAINT occupancies_no_overlap EXCLUDE USING gist (unit_id WITH =, nights WITH &&)
    WHERE (released_at IS NULL)
);

CREATE UNIQUE INDEX occupancies_one_active_per_reservation ON occupancies (reservation_id)
  WHERE released_at IS NULL;

CREATE TABLE reservation_events (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  reservation_id uuid NOT NULL REFERENCES reservations (id),
  from_status    reservation_status,
  to_status      reservation_status NOT NULL,
  actor          text NOT NULL CHECK (actor IN ('guest', 'host', 'system')),
  note           text CHECK (length(note) <= 500),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (from_status IS DISTINCT FROM to_status)
);

CREATE INDEX reservation_events_reservation_id_idx ON reservation_events (reservation_id, occurred_at);

CREATE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER reservation_events_append_only BEFORE UPDATE OR DELETE ON reservation_events
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER reservation_events_no_truncate BEFORE TRUNCATE ON reservation_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
