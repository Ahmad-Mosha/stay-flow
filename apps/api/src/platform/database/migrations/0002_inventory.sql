-- A bounded, non-empty range of calendar dates, end exclusive: [check-in, check-out).
CREATE DOMAIN date_span AS daterange
  CHECK (NOT isempty(VALUE) AND NOT lower_inf(VALUE) AND NOT upper_inf(VALUE));

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- A CHECK constraint must be immutable, and the time zone list is not, so a trigger validates it.
CREATE FUNCTION check_time_zone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'unknown time zone "%"', NEW.time_zone USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TABLE properties (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  slug                    text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name                    text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  time_zone               text NOT NULL,
  currency                text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  check_in_time           time NOT NULL DEFAULT '15:00',
  check_out_time          time NOT NULL DEFAULT '11:00',
  min_nights              int NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  max_nights              int NOT NULL DEFAULT 30 CHECK (max_nights >= min_nights),
  booking_window_days     int NOT NULL DEFAULT 365 CHECK (booking_window_days BETWEEN 1 AND 730),
  free_cancellation_hours int NOT NULL DEFAULT 48 CHECK (free_cancellation_hours >= 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER properties_time_zone BEFORE INSERT OR UPDATE OF time_zone ON properties
  FOR EACH ROW EXECUTE FUNCTION check_time_zone();
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE unit_types (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  property_id     uuid NOT NULL REFERENCES properties (id),
  slug            text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description     text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  max_guests      int NOT NULL CHECK (max_guests BETWEEN 1 AND 20),
  base_rate_minor bigint NOT NULL CHECK (base_rate_minor >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, slug),
  -- Target for composite foreign keys that keep related rows in the same property.
  UNIQUE (property_id, id)
);

CREATE TRIGGER unit_types_updated_at BEFORE UPDATE ON unit_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE units (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  property_id  uuid NOT NULL,
  unit_type_id uuid NOT NULL,
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, name),
  UNIQUE (property_id, id),
  FOREIGN KEY (property_id, unit_type_id) REFERENCES unit_types (property_id, id)
);

CREATE INDEX units_unit_type_id_idx ON units (unit_type_id);

CREATE TRIGGER units_updated_at BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rate_overrides (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  unit_type_id uuid NOT NULL REFERENCES unit_types (id),
  nights       date_span NOT NULL,
  rate_minor   bigint NOT NULL CHECK (rate_minor >= 0),
  label        text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_overrides_no_overlap EXCLUDE USING gist (unit_type_id WITH =, nights WITH &&)
);

CREATE TRIGGER rate_overrides_updated_at BEFORE UPDATE ON rate_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
