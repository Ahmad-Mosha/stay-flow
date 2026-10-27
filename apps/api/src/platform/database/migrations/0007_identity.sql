CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  email         text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One account per address, whatever its case.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A signed-in browser. Only the token's SHA-256 is stored, so reading this table signs nobody in.
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES users (id),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
