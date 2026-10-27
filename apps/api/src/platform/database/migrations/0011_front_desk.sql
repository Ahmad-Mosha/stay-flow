-- Today's arrivals and departures.
CREATE INDEX reservations_check_in_idx ON reservations (property_id, lower(nights));
CREATE INDEX reservations_check_out_idx ON reservations (property_id, upper(nights));

-- The room calendar shows why a room is blocked. New columns of a view go last.
CREATE OR REPLACE VIEW blocking_occupancies AS
SELECT o.id, o.property_id, o.unit_id, o.nights, o.reservation_id, o.block_reason
FROM occupancies o
LEFT JOIN reservations r ON r.id = o.reservation_id
WHERE o.released_at IS NULL
  AND (r.status IS DISTINCT FROM 'held' OR r.hold_expires_at > now());
