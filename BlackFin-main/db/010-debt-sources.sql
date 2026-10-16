-- Loan sources for the property research workspace, read-only inside the workspace.
-- Additive; run explicitly with db:migrate. Nothing here is written during a request: scripts/debt-refresh.mjs builds a
-- bundle offline and scripts/debt-import.mjs loads it under an explicit operator command, in one transaction under an
-- advisory lock. A run is content addressed by the SHA-256 of its manifest; re-importing the same bundle replays and
-- re-points research_debt_current instead of writing a second copy. Runs and their rows are append-only.
--
-- Sources: HUD's FHA-insured multifamily mortgages (active and terminated, national), CMBS loans from SEC Form ABS-EE
-- Exhibit EX-102 (multifamily property records, national), and satisfactions and releases from the Hillsborough and
-- Pinellas clerks' daily official-records indexes. No person's name is stored: lenders, holders and servicers are kept
-- only when they are organizations, and borrower parties are never kept.
CREATE TABLE research_debt_runs (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by text NOT NULL CHECK (length(imported_by) BETWEEN 1 AND 160),
  parser_version text NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 40),
  script_sha256 text NOT NULL CHECK (script_sha256 ~ '^[a-f0-9]{64}$'),
  -- The property snapshot the links were made against; links name stable property ids, so they read on later snapshots.
  research_snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'object'),
  counts jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  rule text NOT NULL CHECK (length(rule) BETWEEN 1 AND 4000)
);

CREATE TABLE research_debt_hud_loans (
  run_id text NOT NULL REFERENCES research_debt_runs(id),
  seq integer NOT NULL CHECK (seq >= 0),
  project text NOT NULL CHECK (project ~ '^[0-9]{8}$'),
  status text NOT NULL CHECK (status IN ('active','terminated')),
  property_name text, city text, state text CHECK (state IS NULL OR length(state) <= 4), zip text CHECK (zip IS NULL OR zip ~ '^[0-9]{5}$'),
  units integer CHECK (units IS NULL OR units >= 0),
  initial_endorsement date, final_endorsement date,
  original_amount_cents bigint CHECK (original_amount_cents IS NULL OR original_amount_cents > 0),
  first_payment date, maturity date, term_months integer, rate_pct numeric CHECK (rate_pct IS NULL OR rate_pct BETWEEN 0 AND 30),
  monthly_payment_cents bigint, balance_cents bigint CHECK (balance_cents IS NULL OR balance_cents >= 0),
  holder text, servicer text, section_code text, section_category text, business_type text,
  termination_type text, claim boolean, terminated date,
  PRIMARY KEY (run_id, seq),
  CHECK (status = 'terminated' OR (termination_type IS NULL AND terminated IS NULL))
);
CREATE INDEX research_debt_hud_zip ON research_debt_hud_loans(run_id, state, zip);

CREATE TABLE research_debt_cmbs_loans (
  run_id text NOT NULL REFERENCES research_debt_runs(id),
  seq integer NOT NULL CHECK (seq >= 0),
  trust text NOT NULL, cik text NOT NULL CHECK (cik ~ '^[0-9]{1,10}$'), accession text NOT NULL CHECK (accession ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  filed date NOT NULL, asset text, property_index integer NOT NULL CHECK (property_index >= 0), period_end date,
  property_name text, address text, city text, state text, zip text CHECK (zip IS NULL OR zip ~ '^[0-9]{5}$'), county text,
  units integer, year_built integer,
  original_amount_cents bigint, originated date, maturity date, rate_pct numeric, balance_cents bigint CHECK (balance_cents IS NULL OR balance_cents >= 0),
  paid_through date, payment_status text, special_servicing boolean NOT NULL, special_servicer_transfer date, master_servicer_return date,
  workout_strategy text, modified boolean NOT NULL, modification_code text, last_modification date, payoff_code text, payoff_date date,
  interest_only boolean, amortization_months integer, servicer text, originator text, property_count integer NOT NULL CHECK (property_count >= 1),
  occupancy_pct numeric, occupancy_date date, dscr_ncf numeric, dscr_noi numeric, valuation_cents bigint, valuation_date date,
  lon numeric CHECK (lon IS NULL OR lon BETWEEN -180 AND 180), lat numeric CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  geocode text NOT NULL CHECK (geocode IN ('census_address','zip_centroid','none')),
  PRIMARY KEY (run_id, seq),
  CHECK ((geocode = 'none') = (lon IS NULL))
);
CREATE INDEX research_debt_cmbs_place ON research_debt_cmbs_loans(run_id, state, zip);

CREATE TABLE research_debt_releases (
  run_id text NOT NULL REFERENCES research_debt_runs(id),
  county_fips text NOT NULL CHECK (county_fips IN ('12057','12103')),
  instrument text NOT NULL CHECK (instrument ~ '^[0-9]{6,13}$'),
  doc_type text NOT NULL CHECK (length(doc_type) BETWEEN 1 AND 12),
  recorded date,
  amount_cents bigint CHECK (amount_cents IS NULL OR amount_cents > 0),
  cited_instrument text CHECK (cited_instrument IS NULL OR cited_instrument ~ '^[0-9]{6,13}$'),
  cited_book text, cited_page text,
  -- Organizations only (banks, lenders, servicers, public bodies). An individual's name is never written.
  lenders jsonb NOT NULL CHECK (jsonb_typeof(lenders) = 'array'),
  PRIMARY KEY (run_id, county_fips, instrument)
);
CREATE INDEX research_debt_releases_cited ON research_debt_releases(run_id, county_fips, cited_instrument);

CREATE TABLE research_debt_clerk_days (
  run_id text NOT NULL REFERENCES research_debt_runs(id),
  county_fips text NOT NULL CHECK (county_fips IN ('12057','12103')),
  day date NOT NULL,
  file text NOT NULL CHECK (length(file) BETWEEN 1 AND 40),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  releases integer NOT NULL CHECK (releases >= 0),
  PRIMARY KEY (run_id, county_fips, file)
);

-- A property-to-source link. Every link can be withdrawn by importing a run without it; nothing is merged or overwritten.
CREATE TABLE research_debt_links (
  run_id text NOT NULL REFERENCES research_debt_runs(id),
  property_id text NOT NULL CHECK (property_id ~ '^reapi:[A-Za-z0-9_-]{1,80}$'),
  source text NOT NULL CHECK (source IN ('hud','cmbs','release')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 60),
  debt_id text,
  confidence text NOT NULL CHECK (confidence IN ('confirmed','probable')),
  method text NOT NULL CHECK (length(method) BETWEEN 1 AND 200),
  detail jsonb NOT NULL CHECK (jsonb_typeof(detail) = 'object'),
  PRIMARY KEY (run_id, property_id, source, source_key)
);
CREATE INDEX research_debt_links_source ON research_debt_links(run_id, source, source_key);

CREATE TABLE research_debt_current (
  workspace_id text PRIMARY KEY CHECK (workspace_id = 'primary'),
  run_id text NOT NULL REFERENCES research_debt_runs(id)
);

CREATE TRIGGER research_debt_runs_immutable BEFORE UPDATE OR DELETE ON research_debt_runs FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_debt_hud_loans_immutable BEFORE UPDATE OR DELETE ON research_debt_hud_loans FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_debt_cmbs_loans_immutable BEFORE UPDATE OR DELETE ON research_debt_cmbs_loans FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_debt_releases_immutable BEFORE UPDATE OR DELETE ON research_debt_releases FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_debt_clerk_days_immutable BEFORE UPDATE OR DELETE ON research_debt_clerk_days FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_debt_links_immutable BEFORE UPDATE OR DELETE ON research_debt_links FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
