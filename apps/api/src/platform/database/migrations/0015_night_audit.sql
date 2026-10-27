-- The night audit looks for confirmed bookings by arrival date. Partial, so it holds only the
-- bookings still waiting for their guest, not every stay ever booked.
CREATE INDEX reservations_awaiting_arrival_idx ON reservations (lower(nights))
  WHERE status = 'confirmed';
