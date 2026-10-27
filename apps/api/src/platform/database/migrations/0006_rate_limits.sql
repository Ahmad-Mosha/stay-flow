-- Request counts in fixed windows, shared by every API instance.
CREATE TABLE rate_limits (
  key          text PRIMARY KEY CHECK (length(key) <= 400),
  window_start timestamptz NOT NULL,
  hits         int NOT NULL CHECK (hits >= 1)
);
