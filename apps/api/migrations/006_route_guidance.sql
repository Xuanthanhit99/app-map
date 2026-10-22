-- Provider-issued turn-by-turn guidance stored with the route revision it belongs to.
-- NULL means the provider returned no guidance (route-only navigation is shown truthfully).
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS route_instructions jsonb;
