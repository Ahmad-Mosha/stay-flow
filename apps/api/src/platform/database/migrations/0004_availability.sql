-- What keeps a room from being sold right now: active blocks and stays, and holds that have not expired.
-- An expired hold still blocks inserts until it is released, but searches already treat it as free.
CREATE VIEW blocking_occupancies AS
SELECT o.id, o.property_id, o.unit_id, o.nights, o.reservation_id
FROM occupancies o
LEFT JOIN reservations r ON r.id = o.reservation_id
WHERE o.released_at IS NULL
  AND (r.status IS DISTINCT FROM 'held' OR r.hold_expires_at > now());
