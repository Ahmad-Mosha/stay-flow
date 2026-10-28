-- The request that caused the event. The worker logs its delivery under the same id, so one id
-- finds a booking's logs in both processes.
ALTER TABLE outbox_events
  ADD COLUMN request_id text CHECK (char_length(request_id) <= 128);
