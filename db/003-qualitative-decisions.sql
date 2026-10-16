-- Forward-only expansion: a qualitative research/pass decision preserves unknown finances.
ALTER TABLE workspace_screening_snapshots DROP CONSTRAINT workspace_screening_snapshots_result_check;
ALTER TABLE workspace_screening_snapshots ADD CONSTRAINT workspace_screening_snapshots_result_check CHECK (
  jsonb_typeof(result) = 'object' AND (
    result @> '{"ok":true}'::jsonb OR (
      model_version = 'research-decision-1.0.0'
      AND decision IN ('research','pass')
      AND result @> '{"availability":"not_calculated"}'::jsonb
      AND inputs = '{}'::jsonb
    )
  )
);
