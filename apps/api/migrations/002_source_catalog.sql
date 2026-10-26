-- Source catalog: metadata about evaluated providers (licence, nature, cost). This is not world data.
-- `enabled` only means the adapter may run; coverage is measured by the Data Readiness report.
INSERT INTO data_sources (id, name, kind, domains, license, attribution, commercial_use, update_frequency, data_nature, reliability, enabled, notes) VALUES
 ('osm-overpass', 'OpenStreetMap (Overpass API)', 'OPEN_DATA', ARRAY['PLACES','ROADS','AREAS'],
  'ODbL-1.0', '© OpenStreetMap contributors', 'ALLOWED', 'on-demand / daily refresh', 'STATIC_REFERENCE', 0.7, true,
  'Share-alike applies to derived databases. Public Overpass instances are rate-limited and intended for light use; production volume requires a self-hosted Overpass or planet extract. opening_hours is a schedule, never a live open/closed observation.'),
 ('open-meteo', 'Open-Meteo forecast API', 'MODEL', ARRAY['WEATHER'],
  'CC-BY-4.0 (data); API terms: free tier non-commercial', 'Weather data by Open-Meteo.com', 'RESTRICTED', '15 min model update', 'FORECAST', 0.6, true,
  '"current" values are model nowcasts, not sensor observations: presented as FORECAST. Commercial use requires a paid Open-Meteo plan (owner decision).'),
 ('community', 'REALITY community reports', 'COMMUNITY', ARRAY['ROAD','PARKING','CROWD','QUEUE','PLACE_OPEN','WEATHER'],
  'REALITY contributor terms', 'Người dùng REALITY', 'ALLOWED', 'continuous', 'COMMUNITY_REPORT', 0.4, true,
  'A single unverified report never becomes authoritative; see Trust policy.'),
 ('reality-moderation', 'REALITY moderator verification', 'OFFICIAL_PROVIDER', ARRAY['ROAD','PARKING','CROWD','QUEUE','PLACE_OPEN'],
  'Internal', 'Đội kiểm duyệt REALITY', 'ALLOWED', 'manual', 'LIVE_OBSERVATION', 0.85, true,
  'Created only when a moderator verifies a community report cluster.'),
 ('tomtom-routing', 'TomTom Routing API', 'ROUTING_ENGINE', ARRAY['ROUTING'],
  'TomTom Developer terms', '© TomTom', 'RESTRICTED', 'per request', 'MODEL_ESTIMATE', 0.8, false,
  'Requires TOMTOM_API_KEY. Results may not be stored beyond the journey they were requested for.'),
 ('tomtom-search', 'TomTom Search API', 'COMMERCIAL_API', ARRAY['PLACES'],
  'TomTom Developer terms', '© TomTom', 'RESTRICTED', 'per request', 'STATIC_REFERENCE', 0.75, false,
  'Pass-through search only; results are not persisted into the places table (licence).'),
 ('legacy-evidence-feed', 'Configured evidence feed (P0)', 'OFFICIAL_PROVIDER', ARRAY['PLACES'],
  'Unverified', 'Configured feed', 'UNVERIFIED', 'unknown', 'LIVE_OBSERVATION', 0.5, false,
  'Kept for backward compatibility with EVIDENCE_FEED_URL. Licence must be verified before enabling.');

INSERT INTO source_health (source_id) SELECT id FROM data_sources;

INSERT INTO feature_flags (key, enabled, description) VALUES
 ('ai_assistant', false, 'Optional AI Reality Assistant (requires ANTHROPIC_API_KEY and owner approval)'),
 ('journey_sharing', false, 'Time-limited, revocable ETA sharing'),
 ('report_photos', false, 'Photo evidence on reports (requires object storage)'),
 ('push_notifications', false, 'Expo push delivery for watch-area notifications'),
 ('google_sign_in', false, 'Google sign-in (requires GOOGLE_CLIENT_IDS)'),
 ('apple_sign_in', false, 'Apple sign-in (requires APPLE_CLIENT_IDS)');
