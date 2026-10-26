-- REALITY foundation schema. PostgreSQL 15+ with PostGIS 3.
-- Every table that stores a fact about the world carries provenance (source_id) and an observation time.
-- Geometry is stored as geography(…, 4326) so distances are metres without projection choices.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Immutable wrapper so unaccent can be used in an index expression.
CREATE OR REPLACE FUNCTION reality_fold(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent', replace(replace($1, 'đ', 'd'), 'Đ', 'D'))) $$;

-- ───────────────────────────── Identity ─────────────────────────────
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  email_verified  boolean NOT NULL DEFAULT false,
  password_hash   text,                       -- null for federated-only accounts
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  role            text NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  trust_score     real NOT NULL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  locale          text NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi','en')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE federated_identities (
  provider      text NOT NULL CHECK (provider IN ('google','apple')),
  subject       text NOT NULL,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);

-- Opaque tokens: only SHA-256 hashes are stored. A refresh token is single-use; presenting a
-- rotated (already used) refresh token revokes the whole family (token theft detection).
CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id           uuid NOT NULL,
  access_token_hash   bytea NOT NULL UNIQUE,
  refresh_token_hash  bytea NOT NULL UNIQUE,
  access_expires_at   timestamptz NOT NULL,
  refresh_expires_at  timestamptz NOT NULL,
  rotated_at          timestamptz,
  revoked_at          timestamptz,
  revoke_reason       text,
  client              text NOT NULL DEFAULT 'unknown' CHECK (char_length(client) <= 40),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_family_idx ON sessions (family_id);

-- Versioned, append-only consent ledger; the latest row per (user, purpose) is authoritative.
CREATE TABLE consents (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN (
                'location_foreground','location_background','context_personalization',
                'notifications','analytics','journey_sharing','contribution_public')),
  granted     boolean NOT NULL,
  policy_version text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_lookup_idx ON consents (user_id, purpose, created_at DESC);

CREATE TABLE user_preferences (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  travel_mode         text NOT NULL DEFAULT 'DRIVING' CHECK (travel_mode IN ('DRIVING','WALKING','CYCLING','MOTORBIKE')),
  accessibility_needs text[] NOT NULL DEFAULT '{}',
  preferred_categories text[] NOT NULL DEFAULT '{}',
  notify_min_severity text NOT NULL DEFAULT 'SIGNIFICANT' CHECK (notify_min_severity IN ('INFO','MINOR','SIGNIFICANT','SAFETY_CRITICAL')),
  quiet_hours         int4range,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Sources & provenance ─────────────────────────────
CREATE TABLE data_sources (
  id                text PRIMARY KEY,           -- stable slug, e.g. 'osm-overpass'
  name              text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('OFFICIAL_PROVIDER','OPEN_DATA','COMMERCIAL_API','SENSOR','COMMUNITY','ROUTING_ENGINE','MODEL')),
  domains           text[] NOT NULL,
  license           text NOT NULL,
  attribution       text NOT NULL,
  commercial_use    text NOT NULL CHECK (commercial_use IN ('ALLOWED','RESTRICTED','PROHIBITED','UNVERIFIED')),
  update_frequency  text NOT NULL,
  data_nature       text NOT NULL CHECK (data_nature IN ('LIVE_OBSERVATION','FORECAST','MODEL_ESTIMATE','STATIC_REFERENCE','COMMUNITY_REPORT')),
  reliability       real NOT NULL CHECK (reliability BETWEEN 0 AND 1),
  enabled           boolean NOT NULL DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One row per fetch: the provenance record every observation/place points at.
CREATE TABLE ingestion_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     text NOT NULL REFERENCES data_sources(id),
  job_key       text NOT NULL,                -- idempotency key (source + scope + window)
  scope         jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  records_in    integer NOT NULL DEFAULT 0,
  records_upserted integer NOT NULL DEFAULT 0,
  records_rejected integer NOT NULL DEFAULT 0,
  error_code    text,
  attempt       integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ingestion_runs_idempotent ON ingestion_runs (job_key) WHERE status IN ('RUNNING','SUCCEEDED');
CREATE INDEX ingestion_runs_source_idx ON ingestion_runs (source_id, started_at DESC);

CREATE TABLE source_health (
  source_id          text PRIMARY KEY REFERENCES data_sources(id),
  circuit_state      text NOT NULL DEFAULT 'CLOSED' CHECK (circuit_state IN ('CLOSED','OPEN','HALF_OPEN')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  opened_at          timestamptz,
  last_success_at    timestamptz,
  last_failure_at    timestamptz,
  last_error_code    text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Geography ─────────────────────────────
CREATE TABLE areas (
  id          text PRIMARY KEY,                 -- slug, e.g. 'ha-noi'
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('CITY','DISTRICT','WARD','REGION')),
  parent_id   text REFERENCES areas(id),
  geom        geography(MultiPolygon, 4326),
  centroid    geography(Point, 4326) NOT NULL,
  source_id   text NOT NULL REFERENCES data_sources(id),
  indexable   boolean NOT NULL DEFAULT false,   -- SEO: only areas with meaningful verified content
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX areas_geom_idx ON areas USING gist (geom);

CREATE TABLE places (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 240),
  category      text NOT NULL,
  address       text,
  geom          geography(Point, 4326) NOT NULL,
  area_id       text REFERENCES areas(id),
  opening_hours text,                           -- raw OSM opening_hours; never presented as live status
  website       text,
  phone         text,
  wheelchair    text CHECK (wheelchair IN ('yes','limited','no')),
  tags          jsonb NOT NULL DEFAULT '{}',
  source_id     text NOT NULL REFERENCES data_sources(id),
  source_ref    text NOT NULL,
  ingestion_run_id uuid REFERENCES ingestion_runs(id),
  source_updated_at timestamptz,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','removed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_ref)
);
CREATE INDEX places_geom_idx ON places USING gist (geom);
CREATE INDEX places_category_idx ON places (category);
CREATE INDEX places_name_trgm_idx ON places USING gin (reality_fold(name) gin_trgm_ops);

CREATE TABLE road_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  geom        geography(LineString, 4326) NOT NULL,
  road_class  text,
  source_id   text NOT NULL REFERENCES data_sources(id),
  source_ref  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_ref)
);
CREATE INDEX road_segments_geom_idx ON road_segments USING gist (geom);

-- ───────────────────────────── Observations & state ─────────────────────────────
-- An observation is evidence, never a verdict. The state engine derives truth from the active set.
CREATE TABLE observations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text NOT NULL CHECK (domain IN ('ROAD','WEATHER','PARKING','PLACE_OPEN','CROWD','QUEUE','PRICE','ACTIVITY','VEHICLE')),
  value         text NOT NULL,                  -- domain state code, e.g. FLOODED_MODERATE
  detail        jsonb NOT NULL DEFAULT '{}',    -- numeric measurements, units, forecast horizon
  subject_type  text NOT NULL CHECK (subject_type IN ('PLACE','ROAD_SEGMENT','POINT','AREA_CELL')),
  place_id      uuid REFERENCES places(id) ON DELETE CASCADE,
  road_segment_id uuid REFERENCES road_segments(id) ON DELETE CASCADE,
  geom          geography(Point, 4326) NOT NULL,
  source_id     text NOT NULL REFERENCES data_sources(id),
  ingestion_run_id uuid REFERENCES ingestion_runs(id),
  report_id     uuid,                           -- set for community observations (FK added below)
  nature        text NOT NULL CHECK (nature IN ('LIVE_OBSERVATION','FORECAST','MODEL_ESTIMATE','STATIC_REFERENCE','COMMUNITY_REPORT')),
  observed_at   timestamptz NOT NULL,
  valid_until   timestamptz NOT NULL,           -- after this the observation no longer contributes
  confidence    real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  dedupe_key    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (observed_at <= created_at + interval '5 minutes'),
  CHECK (valid_until > observed_at)
);
CREATE INDEX observations_geom_idx ON observations USING gist (geom);
CREATE INDEX observations_active_idx ON observations (domain, valid_until DESC);
CREATE INDEX observations_place_idx ON observations (place_id, domain, observed_at DESC);
CREATE UNIQUE INDEX observations_dedupe_idx ON observations (source_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Materialized evaluation snapshots, written by the state engine; used for World Pulse / watch diffs.
CREATE TABLE reality_state_snapshots (
  id            bigserial PRIMARY KEY,
  subject_key   text NOT NULL,                  -- e.g. place:<uuid>:PLACE_OPEN, cell:<geohash6>:WEATHER
  domain        text NOT NULL,
  geom          geography(Point, 4326) NOT NULL,
  truth         text NOT NULL CHECK (truth IN ('KNOWN','UNKNOWN','CONFLICT')),
  value         text,
  freshness     text CHECK (freshness IN ('FRESH','AGING','STALE')),
  safety        text NOT NULL CHECK (safety IN ('NONE','CAUTION','AVOID','BLOCKED')),
  confidence    real NOT NULL,
  evidence_ids  uuid[] NOT NULL DEFAULT '{}',
  evaluated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX state_snapshots_subject_idx ON reality_state_snapshots (subject_key, evaluated_at DESC);
CREATE INDEX state_snapshots_geom_idx ON reality_state_snapshots USING gist (geom);
CREATE INDEX state_snapshots_time_idx ON reality_state_snapshots (evaluated_at DESC);

-- ───────────────────────────── Contribution & trust ─────────────────────────────
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid REFERENCES users(id) ON DELETE SET NULL,   -- anonymised on account deletion
  domain        text NOT NULL,
  value         text NOT NULL,
  note          text CHECK (char_length(note) <= 500),
  geom          geography(Point, 4326) NOT NULL,                -- precise; never returned publicly
  public_cell   text NOT NULL,                                  -- geohash-7 (~150 m) for public display
  place_id      uuid REFERENCES places(id) ON DELETE SET NULL,
  cluster_id    uuid,                                           -- first report of a corroboration cluster
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CORROBORATED','VERIFIED','DISPUTED','REJECTED','EXPIRED','DUPLICATE','HIDDEN')),
  moving_submission boolean NOT NULL DEFAULT false,
  observed_at   timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_geom_idx ON reports USING gist (geom);
CREATE INDEX reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX reports_reporter_idx ON reports (reporter_id, created_at DESC);
CREATE INDEX reports_cluster_idx ON reports (cluster_id);
ALTER TABLE observations ADD CONSTRAINT observations_report_fk FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

CREATE TABLE report_evidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('PHOTO')),
  storage_key text NOT NULL,                    -- object storage key; served via signed URL only
  content_type text NOT NULL,
  bytes       integer NOT NULL CHECK (bytes > 0 AND bytes <= 5242880),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_votes (
  report_id   uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  voter_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote        text NOT NULL CHECK (vote IN ('CONFIRM','DENY')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, voter_id)
);

CREATE TABLE moderation_actions (
  id          bigserial PRIMARY KEY,
  target_type text NOT NULL CHECK (target_type IN ('REPORT','STORY','USER','PLACE','CONFLICT')),
  target_id   text NOT NULL,
  moderator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  reason      text CHECK (char_length(reason) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_target_idx ON moderation_actions (target_type, target_id);

-- ───────────────────────────── Stories ─────────────────────────────
CREATE TABLE stories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  place_id    uuid REFERENCES places(id) ON DELETE SET NULL,
  area_id     text REFERENCES areas(id),
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 160),
  summary     text NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 300),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 40 AND 20000),
  sources     jsonb NOT NULL DEFAULT '[]',     -- [{title,url}] attribution, required to publish
  status      text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_REVIEW','PUBLISHED','REJECTED','ARCHIVED')),
  published_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stories_place_idx ON stories (place_id) WHERE status = 'PUBLISHED';

-- ───────────────────────────── Personal ─────────────────────────────
CREATE TABLE saved_places (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  label       text CHECK (char_length(label) <= 60),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);

CREATE TABLE watch_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  kind        text NOT NULL CHECK (kind IN ('CIRCLE','PLACE','ROUTE')),
  geom        geography(Geometry, 4326) NOT NULL,  -- circle centre point, place point, or route line
  radius_m    integer NOT NULL CHECK (radius_m BETWEEN 50 AND 10000),
  place_id    uuid REFERENCES places(id) ON DELETE CASCADE,
  domains     text[] NOT NULL,
  min_severity text NOT NULL DEFAULT 'SIGNIFICANT' CHECK (min_severity IN ('INFO','MINOR','SIGNIFICANT','SAFETY_CRITICAL')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX watch_areas_geom_idx ON watch_areas USING gist (geom) WHERE active;
CREATE INDEX watch_areas_user_idx ON watch_areas (user_id);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('WATCH_CHANGE','JOURNEY_IMPACT','REPORT_OUTCOME','SYSTEM')),
  severity    text NOT NULL CHECK (severity IN ('INFO','MINOR','SIGNIFICANT','SAFETY_CRITICAL')),
  title       text NOT NULL,
  body        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  dedupe_key  text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE push_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    text NOT NULL CHECK (platform IN ('ios','android','web')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Journeys keep only endpoints and the route summary; GPS traces are not persisted.
CREATE TABLE journeys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('PLANNED','ACTIVE','PAUSED','ARRIVED','CANCELLED','STOPPED')),
  mode          text NOT NULL CHECK (mode IN ('DRIVING','WALKING','CYCLING')),
  origin        geography(Point, 4326) NOT NULL,
  destination   geography(Point, 4326) NOT NULL,
  destination_place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  destination_label text,
  route_geom    geography(LineString, 4326),
  route_provider text,
  distance_m    integer,
  duration_s    integer,
  route_revision integer NOT NULL DEFAULT 1,
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journeys_user_idx ON journeys (user_id, created_at DESC);

CREATE TABLE journey_events (
  id          bigserial PRIMARY KEY,
  journey_id  uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  type        text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journey_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id  uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  share_eta_only boolean NOT NULL DEFAULT true,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Operations ─────────────────────────────
CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,                            -- not an FK: audit survives user deletion
  actor_role  text,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  detail      jsonb NOT NULL DEFAULT '{}',     -- never contains coordinates, tokens or passwords
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_time_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, created_at DESC);

CREATE TABLE feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  description text NOT NULL,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('SIGNIFICANT','SAFETY_CRITICAL')),
  status      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','MONITORING','RESOLVED')),
  geom        geography(Point, 4326),
  radius_m    integer CHECK (radius_m BETWEEN 50 AND 50000),
  report_ids  uuid[] NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE rate_limit_buckets (
  key         text PRIMARY KEY,
  count       integer NOT NULL,
  reset_at    timestamptz NOT NULL
);
