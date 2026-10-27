-- The transactional outbox: side effects, such as emails, that the worker delivers after the
-- change that caused them commits. An event is written in the same transaction as its change,
-- so the two commit or roll back together.
CREATE TABLE outbox_events (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  type         text NOT NULL CHECK (type ~ '^[a-z]+(\.[a-z_]+)+$'),
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- When a worker may take the event next: at once when new, later after a failure, and at the
  -- end of the lease while a worker holds it.
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts     int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   text,
  processed_at timestamptz,
  -- Set when the worker gives up. Dead events wait for a person to look at them.
  dead_at      timestamptz,
  CHECK (processed_at IS NULL OR dead_at IS NULL)
);

-- The claim reads only events still waiting, the longest due first.
CREATE INDEX outbox_events_due_idx ON outbox_events (available_at)
  WHERE processed_at IS NULL AND dead_at IS NULL;
