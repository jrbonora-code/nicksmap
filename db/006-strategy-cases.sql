-- Evidence-linked strategy cases. Additive; run explicitly with db:migrate.
-- A case fixes its research origin (snapshot, property record, selected recorded
-- instrument, scenario and threshold at capture) once. Every later analyst decision
-- is an append-only version; nothing here is updated or deleted by the application.
CREATE TABLE research_strategy_cases (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL DEFAULT 'primary' CHECK (workspace_id = 'primary'),
  snapshot_id text NOT NULL REFERENCES research_snapshots(id),
  property_id text NOT NULL REFERENCES research_properties(id),
  debt_id text CHECK (debt_id IS NULL OR length(debt_id) BETWEEN 1 AND 160),
  origin jsonb NOT NULL CHECK (jsonb_typeof(origin) = 'object' AND origin ? 'property' AND origin ? 'trigger' AND origin ? 'scenario' AND origin ? 'query'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  FOREIGN KEY (snapshot_id, property_id) REFERENCES research_snapshot_properties(snapshot_id, property_id)
);
CREATE INDEX research_strategy_cases_property ON research_strategy_cases(workspace_id, property_id);

CREATE TABLE research_strategy_case_versions (
  case_id uuid NOT NULL REFERENCES research_strategy_cases(id),
  version integer NOT NULL CHECK (version >= 1),
  state text NOT NULL CHECK (state IN ('observed_lead','hypothesis','documented_case','executable_proposal','agreed','outcome_recorded','rejected','deferred')),
  lane text NOT NULL CHECK (lane IN ('undetermined','financing_transition','completion_leaseup','recapitalization','affordability_structure','institutional_housing','lender_services','loan_property_purchase')),
  model_version text NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND content ? 'label' AND content ? 'alternatives' AND content ? 'missingInputs' AND content ? 'evidence'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  PRIMARY KEY (case_id, version)
);

CREATE TRIGGER research_strategy_cases_immutable BEFORE UPDATE OR DELETE ON research_strategy_cases FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
CREATE TRIGGER research_strategy_case_versions_immutable BEFORE UPDATE OR DELETE ON research_strategy_case_versions FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();

-- Case actions join the existing actor audit trail.
ALTER TABLE workspace_audit DROP CONSTRAINT workspace_audit_event_check;
ALTER TABLE workspace_audit ADD CONSTRAINT workspace_audit_event_check CHECK (event IN ('deal.created','deal.updated','evidence.added','screening.saved','mandate.drafted','case.created','case.versioned'));
