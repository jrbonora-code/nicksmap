-- Designated Opportunity Zone x EB-5 rural screen, read-only inside the workspace.
-- Additive; run explicitly with db:migrate. Nothing here is written during a request: the offline
-- preparer builds a bundle and scripts/import-oz-eb5.mjs loads it under an explicit operator command.
-- A run is content addressed by the SHA-256 of its import manifest, so re-importing the same screen
-- output replays instead of duplicating, and research_oz_eb5_current switches pointers atomically.
CREATE TABLE research_oz_eb5_runs (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by text NOT NULL CHECK (length(imported_by) BETWEEN 1 AND 160),
  script_sha256 text NOT NULL CHECK (script_sha256 ~ '^[a-f0-9]{64}$'),
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'object'),
  counts jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  rule text NOT NULL CHECK (length(rule) BETWEEN 1 AND 4000)
);

-- One row per designated 2010 tract on the CDFI list. Every column of the offline oz-eb5-tracts.csv is
-- preserved verbatim; display_geometry is the simplified HUD 2010 polygon and is NULL for metropolitan
-- tracts, which are carried as rows without geometry and are never drawn on the map.
CREATE TABLE research_oz_eb5_tracts (
  run_id text NOT NULL REFERENCES research_oz_eb5_runs(id),
  geoid_2010 text NOT NULL CHECK (geoid_2010 ~ '^[0-9]{11}$'),
  state text NOT NULL CHECK (length(state) BETWEEN 1 AND 80),
  county_name text NOT NULL,
  county_fips text NOT NULL CHECK (county_fips ~ '^[0-9]{5}$'),
  tract_type text NOT NULL,
  oz_status text NOT NULL,
  oz_authority text NOT NULL,
  geoid_2010_geometry_alias text NOT NULL,
  cbsa_code text NOT NULL,
  cbsa_title text NOT NULL,
  cbsa_type text NOT NULL,
  msa_basis text NOT NULL,
  town_basis text NOT NULL,
  bridge_type text NOT NULL,
  tracts_2020 text NOT NULL,
  dropped_successors text NOT NULL,
  iiusa_rows integer NOT NULL,
  iiusa_coverage_pct numeric NOT NULL,
  iiusa_rural_tea text NOT NULL,
  iiusa_msa text NOT NULL,
  place_20k_names text NOT NULL,
  place_20k_kind text NOT NULL,
  place_20k_successor_land_pct numeric NOT NULL,
  eb5_rural_class text NOT NULL CHECK (eb5_rural_class IN ('rural_clear','rural_interpretation_dependent','not_rural_place_per_iiusa','not_rural_msa','unknown')),
  class_reason text NOT NULL,
  notes text NOT NULL,
  display_geometry jsonb,
  PRIMARY KEY (run_id, geoid_2010)
);
CREATE INDEX research_oz_eb5_tracts_state ON research_oz_eb5_tracts(run_id, state);
CREATE INDEX research_oz_eb5_tracts_class ON research_oz_eb5_tracts(run_id, eb5_rural_class);

-- OMB Bulletin 23-01 List 1, county (Connecticut: planning region) to core based statistical area.
-- Carried with the run so the server-side site test answers the metropolitan leg for any United States
-- county, not only the counties that happen to contain a designated tract. A county absent from List 1
-- is outside every CBSA. Micropolitan membership does not exclude under the EB-5 rural test.
CREATE TABLE research_oz_eb5_cbsa_counties (
  run_id text NOT NULL REFERENCES research_oz_eb5_runs(id),
  county_fips text NOT NULL CHECK (county_fips ~ '^[0-9]{5}$'),
  county_name text NOT NULL,
  cbsa_code text NOT NULL,
  cbsa_title text NOT NULL,
  cbsa_type text NOT NULL CHECK (cbsa_type IN ('metropolitan','micropolitan')),
  PRIMARY KEY (run_id, county_fips)
);

CREATE TABLE research_oz_eb5_current (
  workspace_id text PRIMARY KEY CHECK (workspace_id = 'primary'),
  run_id text NOT NULL REFERENCES research_oz_eb5_runs(id)
);

CREATE TRIGGER research_oz_eb5_runs_immutable BEFORE UPDATE OR DELETE ON research_oz_eb5_runs FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_oz_eb5_tracts_immutable BEFORE UPDATE OR DELETE ON research_oz_eb5_tracts FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_oz_eb5_cbsa_counties_immutable BEFORE UPDATE OR DELETE ON research_oz_eb5_cbsa_counties FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
