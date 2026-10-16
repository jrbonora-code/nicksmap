-- National 2027 Opportunity Zone round, read-only inside the workspace.
-- Additive; run explicitly with db:migrate. Nothing here is written during a request: scripts/oz2027-refresh.mjs builds a
-- bundle offline and scripts/oz2027-import.mjs loads it under an explicit operator command, in one transaction under an
-- advisory lock. A run is content addressed by the SHA-256 of its manifest, so re-importing the same bundle replays and
-- re-points research_oz2027_current instead of writing a second copy. Runs and their rows are append-only.
--
-- The tract universe is Treasury's revised eligible list (OTA, September 23, 2026), on 2020 boundaries keyed as the
-- 2020-2024 ACS keys them (Connecticut on its 2022 planning regions). Eligibility is not nomination, a nomination is not
-- a designation, and nothing here is a property-level tax benefit.
CREATE TABLE research_oz2027_runs (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by text NOT NULL CHECK (length(imported_by) BETWEEN 1 AND 160),
  parser_version text NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 40),
  script_sha256 text NOT NULL CHECK (script_sha256 ~ '^[a-f0-9]{64}$'),
  treasury_sha256 text NOT NULL CHECK (treasury_sha256 ~ '^[a-f0-9]{64}$'),
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
  counts jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  rule text NOT NULL CHECK (length(rule) BETWEEN 1 AND 4000)
);

-- One row per eligible 2020 tract on Treasury's list. headline_status is the best tier among this run's signals for the
-- tract (certified > nominated > state_recommended > draft_for_comment > local_recommended), or `eligible` when no shipped
-- source carries it further; the importer recomputes it from the signals and refuses a bundle that disagrees.
-- overlap_2018_land_pct is the share of this tract's land inside 2018-designated 2010 tracts (research_oz2027_links).
CREATE TABLE research_oz2027_tracts (
  run_id text NOT NULL REFERENCES research_oz2027_runs(id),
  geoid_2020 text NOT NULL CHECK (geoid_2020 ~ '^[0-9]{11}$'),
  state text NOT NULL CHECK (length(state) BETWEEN 1 AND 80),
  state_fips text NOT NULL CHECK (state_fips ~ '^[0-9]{2}$' AND state_fips = substr(geoid_2020, 1, 2)),
  county text NOT NULL,
  county_fips text NOT NULL CHECK (county_fips ~ '^[0-9]{5}$' AND county_fips = substr(geoid_2020, 1, 5)),
  cbsa text NOT NULL,
  poverty_rate numeric CHECK (poverty_rate IS NULL OR poverty_rate BETWEEN 0 AND 100),
  mfi_ratio numeric CHECK (mfi_ratio IS NULL OR mfi_ratio >= 0),
  mfi_ub_ratio numeric CHECK (mfi_ub_ratio IS NULL OR mfi_ub_ratio >= 0),
  temp_displacement boolean NOT NULL,
  eligibility_route text NOT NULL CHECK (eligibility_route IN ('poverty','median_income','poverty_and_median_income','median_income_upper_bound','temporary_displacement','other')),
  rural_status smallint NOT NULL CHECK (rural_status IN (0, 1)),
  in_april_appendix boolean NOT NULL,
  headline_status text NOT NULL CHECK (headline_status IN ('certified','nominated','state_recommended','draft_for_comment','local_recommended','eligible')),
  headline_confidence text CHECK (headline_confidence IS NULL OR headline_confidence IN ('high','medium','low','unverified')),
  headline_source_id text,
  signal_count integer NOT NULL CHECK (signal_count >= 0),
  overlap_2018_land_pct numeric NOT NULL CHECK (overlap_2018_land_pct BETWEEN 0 AND 100),
  min_lon numeric NOT NULL CHECK (min_lon BETWEEN -180 AND 180),
  min_lat numeric NOT NULL CHECK (min_lat BETWEEN -90 AND 90),
  max_lon numeric NOT NULL CHECK (max_lon BETWEEN -180 AND 180),
  max_lat numeric NOT NULL CHECK (max_lat BETWEEN -90 AND 90),
  -- A point inside the tract's largest display polygon, for the national point view and labels.
  label_lon numeric NOT NULL CHECK (label_lon BETWEEN -180 AND 180),
  label_lat numeric NOT NULL CHECK (label_lat BETWEEN -90 AND 90),
  display_geometry jsonb NOT NULL CHECK (display_geometry->>'type' IN ('Polygon','MultiPolygon')),
  PRIMARY KEY (run_id, geoid_2020),
  CHECK ((headline_status = 'eligible') = (headline_source_id IS NULL)),
  CHECK ((headline_status = 'eligible') = (headline_confidence IS NULL))
);
CREATE INDEX research_oz2027_tracts_state ON research_oz2027_tracts(run_id, state, headline_status);
CREATE INDEX research_oz2027_tracts_bbox ON research_oz2027_tracts(run_id, min_lon, max_lon, min_lat, max_lat);

-- One row per tract per source: a claim above eligibility, from a source the manifest ships (D06: government publishers
-- and government documents hosted elsewhere; tracker and other third-party lists are never stored here). An off-list
-- tract a list names is kept with on_eligible_list = false rather than dropped, so it is not a foreign key to the tracts.
-- jurisdiction is a government body or municipality, or empty; no person, company or contact field is stored.
CREATE TABLE research_oz2027_signals (
  run_id text NOT NULL REFERENCES research_oz2027_runs(id),
  geoid_2020 text NOT NULL CHECK (geoid_2020 ~ '^[0-9]{11}$'),
  source_id text NOT NULL CHECK (source_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  state text NOT NULL CHECK (length(state) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('certified','nominated','state_recommended','draft_for_comment','local_recommended')),
  jurisdiction text NOT NULL CHECK (length(jurisdiction) <= 200),
  source_url text NOT NULL CHECK (source_url ~ '^https?://' AND length(source_url) <= 1000),
  source_date date,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low','unverified')),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  on_eligible_list boolean NOT NULL,
  notes text NOT NULL CHECK (length(notes) <= 2000),
  PRIMARY KEY (run_id, geoid_2020, source_id)
);
CREATE INDEX research_oz2027_signals_source ON research_oz2027_signals(run_id, source_id);

-- One row per jurisdiction (50 states, DC and five territories). A state-level claim may rest on a tracker; its
-- confidence is then `unverified`, and the withheld list is named in notes rather than stored as tract rows.
CREATE TABLE research_oz2027_states (
  run_id text NOT NULL REFERENCES research_oz2027_runs(id),
  state text NOT NULL CHECK (length(state) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('certified','nominated','state_recommended','draft_for_comment','local_recommended','extension','unknown')),
  nominated_date date,
  certified_date date,
  cap integer CHECK (cap IS NULL OR cap >= 0),
  eligible_count integer NOT NULL CHECK (eligible_count >= 0),
  eligible_rural_count integer NOT NULL CHECK (eligible_rural_count >= 0 AND eligible_rural_count <= eligible_count),
  nominated_count integer CHECK (nominated_count IS NULL OR nominated_count >= 0),
  tract_signal_count integer NOT NULL CHECK (tract_signal_count >= 0),
  list_url text NOT NULL CHECK (length(list_url) <= 1000),
  source_url text NOT NULL CHECK (source_url ~ '^https?://' AND length(source_url) <= 1000),
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low','unverified')),
  deadline_track text NOT NULL,
  notes text NOT NULL CHECK (length(notes) <= 4000),
  PRIMARY KEY (run_id, state)
);

-- 2010 to 2020 bridge for every 2018-designated 2010 tract (CDFI list, December 14, 2018) to each 2020 successor in the
-- Census relationship file, slivers included, keyed on the 2020 GEOID as Treasury keys it. Shares are land shares of the
-- relationship-file part: share_of_2010_pct of the 2010 tract's land, share_of_2020_pct of the 2020 tract's land.
CREATE TABLE research_oz2027_links (
  run_id text NOT NULL REFERENCES research_oz2027_runs(id),
  geoid_2010 text NOT NULL CHECK (geoid_2010 ~ '^[0-9]{11}$'),
  geoid_2020 text NOT NULL CHECK (geoid_2020 ~ '^[0-9]{11}$'),
  land_part_sqm bigint NOT NULL CHECK (land_part_sqm >= 0),
  share_of_2010_pct numeric NOT NULL CHECK (share_of_2010_pct BETWEEN 0 AND 100),
  share_of_2020_pct numeric NOT NULL CHECK (share_of_2020_pct BETWEEN 0 AND 100),
  PRIMARY KEY (run_id, geoid_2010, geoid_2020)
);
CREATE INDEX research_oz2027_links_2020 ON research_oz2027_links(run_id, geoid_2020);

CREATE TABLE research_oz2027_current (
  workspace_id text PRIMARY KEY CHECK (workspace_id = 'primary'),
  run_id text NOT NULL REFERENCES research_oz2027_runs(id)
);

CREATE TRIGGER research_oz2027_runs_immutable BEFORE UPDATE OR DELETE ON research_oz2027_runs FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_oz2027_tracts_immutable BEFORE UPDATE OR DELETE ON research_oz2027_tracts FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_oz2027_signals_immutable BEFORE UPDATE OR DELETE ON research_oz2027_signals FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_oz2027_states_immutable BEFORE UPDATE OR DELETE ON research_oz2027_states FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_oz2027_links_immutable BEFORE UPDATE OR DELETE ON research_oz2027_links FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
