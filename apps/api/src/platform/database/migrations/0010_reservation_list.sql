-- The host's reservation list, newest first. The id orders reservations made at the same moment.
CREATE INDEX reservations_newest_idx ON reservations (property_id, created_at DESC, id DESC);
