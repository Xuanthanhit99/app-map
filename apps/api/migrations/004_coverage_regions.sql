-- Coverage regions are operator configuration (where ingestion runs), not world data.
ALTER TABLE areas ALTER COLUMN source_id DROP NOT NULL;
ALTER TABLE areas ADD COLUMN defined_by text NOT NULL DEFAULT 'COVERAGE_CONFIG' CHECK (defined_by IN ('COVERAGE_CONFIG','SOURCE'));
ALTER TABLE areas ADD COLUMN bbox geography(Polygon, 4326);
ALTER TABLE areas ADD COLUMN description text;
