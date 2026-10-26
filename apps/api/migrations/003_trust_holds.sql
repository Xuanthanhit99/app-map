-- Reports from low-trust or newly flagged accounts are held: stored, visible to moderators,
-- but excluded from corroboration and state evaluation until reviewed.
ALTER TABLE reports ADD COLUMN held_for_review boolean NOT NULL DEFAULT false;
ALTER TABLE reports ADD COLUMN confirm_count integer NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN deny_count integer NOT NULL DEFAULT 0;
CREATE INDEX reports_active_idx ON reports (domain, expires_at) WHERE status IN ('PENDING','CORROBORATED','VERIFIED','DISPUTED');
-- Notification cooldown per watch area and subject to avoid spam.
ALTER TABLE notifications ADD COLUMN watch_area_id uuid REFERENCES watch_areas(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN journey_id uuid REFERENCES journeys(id) ON DELETE CASCADE;
