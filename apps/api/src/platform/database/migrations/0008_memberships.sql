CREATE TYPE property_role AS ENUM ('owner', 'manager', 'front_desk');

-- Who works at a property, and as what.
CREATE TABLE property_members (
  property_id uuid NOT NULL REFERENCES properties (id),
  user_id     uuid NOT NULL REFERENCES users (id),
  role        property_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, user_id)
);

-- A host's properties, for the dashboard's property list.
CREATE INDEX property_members_user_id_idx ON property_members (user_id);

-- Two owners demoting each other at once would each still see the other as owner and both
-- commit, leaving none. Locking the property first makes the second change wait and see the first.
CREATE FUNCTION keep_an_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM FROM properties WHERE id = OLD.property_id FOR NO KEY UPDATE;
  IF NOT EXISTS (
    SELECT FROM property_members WHERE property_id = OLD.property_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'property % must keep an owner', OLD.property_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'property_members_keep_an_owner';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER property_members_keep_an_owner AFTER UPDATE OF role OR DELETE ON property_members
  FOR EACH ROW WHEN (OLD.role = 'owner') EXECUTE FUNCTION keep_an_owner();
