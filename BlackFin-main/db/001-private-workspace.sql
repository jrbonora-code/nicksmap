-- One shared workspace. Identity and membership are checked in the server DAL.
-- Migrations are explicit; the application does not run DDL at startup.
CREATE TABLE workspace_counties (
  fips text PRIMARY KEY CHECK (fips ~ '^12[0-9]{3}$'),
  name text NOT NULL UNIQUE
);

CREATE TABLE workspace_deals (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL DEFAULT 'primary' CHECK (workspace_id = 'primary'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 500),
  county_fips text NOT NULL REFERENCES workspace_counties(fips),
  strategy text NOT NULL CHECK (strategy IN ('acquisition','recapitalization','completion','incentives','land')),
  stage text NOT NULL CHECK (stage IN ('research','screening','diligence','passed','closed')),
  unit_count integer CHECK (unit_count > 0),
  latitude double precision CHECK (latitude BETWEEN 24 AND 31.1),
  longitude double precision CHECK (longitude BETWEEN -87.8 AND -79.8),
  asking_price_cents bigint CHECK (asking_price_cents BETWEEN 0 AND 9007199254740991),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  next_action text NOT NULL DEFAULT '' CHECK (length(next_action) <= 1000),
  next_action_due date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  UNIQUE (workspace_id, id)
);
CREATE INDEX workspace_deals_county ON workspace_deals(workspace_id, county_fips);
CREATE INDEX workspace_deals_recent ON workspace_deals(workspace_id, updated_at DESC);

CREATE TABLE workspace_evidence (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL DEFAULT 'primary' CHECK (workspace_id = 'primary'),
  deal_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  source_url text CHECK (length(source_url) <= 2000 AND source_url ~ '^https?://'),
  source_type text NOT NULL CHECK (source_type IN ('public_record','broker','owner','estimate','other')),
  effective_date date NOT NULL,
  retrieved_at timestamptz NOT NULL,
  notes text NOT NULL CHECK (length(notes) BETWEEN 1 AND 20000),
  review_status text NOT NULL CHECK (review_status IN ('unreviewed','reviewed','conflict')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  UNIQUE (workspace_id, deal_id, id),
  FOREIGN KEY (workspace_id, deal_id) REFERENCES workspace_deals(workspace_id, id)
);
CREATE INDEX workspace_evidence_deal ON workspace_evidence(workspace_id, deal_id);

CREATE TABLE workspace_mandate (
  workspace_id text PRIMARY KEY DEFAULT 'primary' CHECK (workspace_id = 'primary'),
  status text NOT NULL CHECK (status IN ('unconfigured','draft')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  updated_at timestamptz,
  updated_by text
);
INSERT INTO workspace_mandate(workspace_id, status) VALUES ('primary', 'unconfigured');

CREATE TABLE workspace_screening_snapshots (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL DEFAULT 'primary' CHECK (workspace_id = 'primary'),
  deal_id uuid NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 180),
  model_version text NOT NULL,
  inputs jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND result->>'ok' = 'true'),
  evidence_ids uuid[] NOT NULL CHECK (cardinality(evidence_ids) BETWEEN 1 AND 100),
  evidence_snapshots jsonb NOT NULL CHECK (jsonb_typeof(evidence_snapshots) = 'array'),
  deal_snapshot jsonb NOT NULL CHECK (jsonb_typeof(deal_snapshot) = 'object'),
  mandate_snapshot jsonb NOT NULL CHECK (jsonb_typeof(mandate_snapshot) = 'object'),
  decision text NOT NULL CHECK (decision IN ('research','advance','pass')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  FOREIGN KEY (workspace_id, deal_id) REFERENCES workspace_deals(workspace_id, id)
);
CREATE INDEX workspace_snapshots_deal ON workspace_screening_snapshots(workspace_id, deal_id, created_at DESC);

CREATE TABLE workspace_audit (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL DEFAULT 'primary' CHECK (workspace_id = 'primary'),
  actor_id text NOT NULL,
  actor_login text NOT NULL,
  event text NOT NULL CHECK (event IN ('deal.created','deal.updated','evidence.added','screening.saved','mandate.drafted')),
  entity_id text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_requests (
  actor_id text NOT NULL,
  request_id uuid NOT NULL,
  operation text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_id)
);

CREATE FUNCTION workspace_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical workspace records are append-only';
END;
$$;
CREATE TRIGGER workspace_snapshots_immutable BEFORE UPDATE OR DELETE ON workspace_screening_snapshots FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER workspace_audit_immutable BEFORE UPDATE OR DELETE ON workspace_audit FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER workspace_evidence_immutable BEFORE UPDATE OR DELETE ON workspace_evidence FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();

-- Official Census county catalogue, not a claim of property/source verification.
INSERT INTO workspace_counties(fips, name) VALUES
('12001', 'Alachua'),('12003', 'Baker'),('12005', 'Bay'),('12007', 'Bradford'),
('12009', 'Brevard'),('12011', 'Broward'),('12013', 'Calhoun'),('12015', 'Charlotte'),
('12017', 'Citrus'),('12019', 'Clay'),('12021', 'Collier'),('12023', 'Columbia'),
('12027', 'DeSoto'),('12029', 'Dixie'),('12031', 'Duval'),('12033', 'Escambia'),
('12035', 'Flagler'),('12037', 'Franklin'),('12039', 'Gadsden'),('12041', 'Gilchrist'),
('12043', 'Glades'),('12045', 'Gulf'),('12047', 'Hamilton'),('12049', 'Hardee'),
('12051', 'Hendry'),('12053', 'Hernando'),('12055', 'Highlands'),('12057', 'Hillsborough'),
('12059', 'Holmes'),('12061', 'Indian River'),('12063', 'Jackson'),('12065', 'Jefferson'),
('12067', 'Lafayette'),('12069', 'Lake'),('12071', 'Lee'),('12073', 'Leon'),
('12075', 'Levy'),('12077', 'Liberty'),('12079', 'Madison'),('12081', 'Manatee'),
('12083', 'Marion'),('12085', 'Martin'),('12086', 'Miami-Dade'),('12087', 'Monroe'),
('12089', 'Nassau'),('12091', 'Okaloosa'),('12093', 'Okeechobee'),('12095', 'Orange'),
('12097', 'Osceola'),('12099', 'Palm Beach'),('12101', 'Pasco'),('12103', 'Pinellas'),
('12105', 'Polk'),('12107', 'Putnam'),('12113', 'Santa Rosa'),('12115', 'Sarasota'),
('12117', 'Seminole'),('12109', 'St. Johns'),('12111', 'St. Lucie'),('12119', 'Sumter'),
('12121', 'Suwannee'),('12123', 'Taylor'),('12125', 'Union'),('12127', 'Volusia'),
('12129', 'Wakulla'),('12131', 'Walton'),('12133', 'Washington');
