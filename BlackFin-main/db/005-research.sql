-- Additive research storage. Run explicitly with db:migrate before enabling research.
-- Existing workspace, accounts, manual deals and immutable decision history are untouched.
CREATE TABLE research_snapshots (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  parser_version text NOT NULL,
  source_date timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  manifest jsonb NOT NULL
);
CREATE TABLE research_import_runs (
  id uuid PRIMARY KEY,
  snapshot_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK(status IN ('running','imported','replayed','failed')),
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE research_current (
  workspace_id text PRIMARY KEY CHECK(workspace_id='primary'),
  snapshot_id text NOT NULL REFERENCES research_snapshots(id)
);
CREATE TABLE research_properties (
  id text PRIMARY KEY,
  identity_basis text NOT NULL CHECK(identity_basis='provider_record'),
  provider text NOT NULL,
  provider_id text NOT NULL,
  UNIQUE(provider, provider_id)
);
CREATE TABLE research_sources (
  snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  id text NOT NULL,
  provider text NOT NULL,
  url text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  date_basis text NOT NULL,
  sha256 text NOT NULL,
  locator text NOT NULL,
  content text NOT NULL,
  PRIMARY KEY(snapshot_id,id)
);
CREATE TABLE research_observations (
  snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  kind text NOT NULL CHECK(kind IN ('license','property','mortgage','association')),
  native_id text NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(snapshot_id,kind,native_id),
  FOREIGN KEY(snapshot_id,source_id) REFERENCES research_sources(snapshot_id,id)
);
CREATE TABLE research_snapshot_properties (
  snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  property_id text NOT NULL REFERENCES research_properties(id),
  county_fips text,
  in_region boolean NOT NULL,
  record jsonb NOT NULL,
  detail jsonb NOT NULL,
  PRIMARY KEY(snapshot_id,property_id)
);
CREATE INDEX research_snapshot_region ON research_snapshot_properties(snapshot_id,in_region,county_fips);
CREATE TABLE research_tracts (
  snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  geoid text NOT NULL,
  eligible boolean NOT NULL,
  rural boolean NOT NULL,
  geometry jsonb NOT NULL,
  display_geometry jsonb NOT NULL,
  source jsonb NOT NULL,
  PRIMARY KEY(snapshot_id,geoid)
);
CREATE TABLE research_saved_analyses (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL CHECK(workspace_id='primary'),
  actor_id text NOT NULL,
  snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
  query jsonb NOT NULL,
  scenario jsonb NOT NULL,
  model_version text NOT NULL,
  result jsonb NOT NULL
);
