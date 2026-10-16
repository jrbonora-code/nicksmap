-- Layer-1 extensions and the asset layer of the OZ / EB-5 screen, read-only inside the workspace.
-- Additive; run explicitly with db:migrate after 007. Nothing here is written during a request: the offline
-- preparer (parser oz-eb5-import-2) carries these columns and rows, and scripts/import-oz-eb5.mjs loads them
-- under an explicit operator command in the same transaction as the tract rows.
--
-- The twenty-six tract columns are the ones the offline screen appended after `notes`: the 2027 nomination
-- round, the three LIHTC / NMTC incentive flags, and ACS demographics at designation and latest. They are
-- nullable so a run imported by the earlier parser reads NULL rather than an invented value; the application
-- shows such a run as "not carried by this run". A value's meaning is in its own basis column on the same row.
ALTER TABLE research_oz_eb5_tracts
  ADD COLUMN oz2027_eligible_land_pct numeric CHECK (oz2027_eligible_land_pct IS NULL OR oz2027_eligible_land_pct BETWEEN 0 AND 100),
  ADD COLUMN oz2027_status text CHECK (oz2027_status IS NULL OR oz2027_status IN ('fully_eligible','partially_eligible','not_eligible','unknown')),
  ADD COLUMN oz2027_rural_land_pct numeric CHECK (oz2027_rural_land_pct IS NULL OR oz2027_rural_land_pct BETWEEN 0 AND 100),
  ADD COLUMN oz2027_rural_flag text CHECK (oz2027_rural_flag IS NULL OR oz2027_rural_flag IN ('rural','non_rural','mixed','not_eligible','unknown')),
  ADD COLUMN oz2027_basis text,
  ADD COLUMN lihtc_qct_2026_land_pct numeric CHECK (lihtc_qct_2026_land_pct IS NULL OR lihtc_qct_2026_land_pct BETWEEN 0 AND 100),
  ADD COLUMN lihtc_qct_2026 text CHECK (lihtc_qct_2026 IS NULL OR lihtc_qct_2026 IN ('yes','partial','no','unknown')),
  ADD COLUMN lihtc_qct_2026_basis text,
  ADD COLUMN lihtc_dda_2026 text CHECK (lihtc_dda_2026 IS NULL OR lihtc_dda_2026 IN ('yes','no','metro_zcta_not_evaluated','unknown')),
  ADD COLUMN lihtc_dda_2026_basis text,
  ADD COLUMN nmtc_lic_land_pct numeric CHECK (nmtc_lic_land_pct IS NULL OR nmtc_lic_land_pct BETWEEN 0 AND 100),
  ADD COLUMN nmtc_lic_eligible text CHECK (nmtc_lic_eligible IS NULL OR nmtc_lic_eligible IN ('yes','partial','no','unknown')),
  ADD COLUMN nmtc_poverty_rate numeric CHECK (nmtc_poverty_rate IS NULL OR nmtc_poverty_rate BETWEEN 0 AND 100),
  ADD COLUMN nmtc_mfi_ratio_pct numeric CHECK (nmtc_mfi_ratio_pct IS NULL OR nmtc_mfi_ratio_pct >= 0),
  ADD COLUMN nmtc_basis text,
  ADD COLUMN acs2015_poverty_rate numeric CHECK (acs2015_poverty_rate IS NULL OR acs2015_poverty_rate BETWEEN 0 AND 100),
  ADD COLUMN acs2015_mfi_ratio_pct numeric CHECK (acs2015_mfi_ratio_pct IS NULL OR acs2015_mfi_ratio_pct >= 0),
  ADD COLUMN acs2015_poverty_universe_pop integer CHECK (acs2015_poverty_universe_pop IS NULL OR acs2015_poverty_universe_pop >= 0),
  ADD COLUMN acs2015_lic_eligible text CHECK (acs2015_lic_eligible IS NULL OR acs2015_lic_eligible IN ('yes','no','unknown')),
  ADD COLUMN acs2015_basis text,
  ADD COLUMN acs2024_coverage text CHECK (acs2024_coverage IS NULL OR acs2024_coverage IN ('whole','containing_tract','partial','unknown')),
  ADD COLUMN acs2024_population integer CHECK (acs2024_population IS NULL OR acs2024_population >= 0),
  ADD COLUMN acs2024_poverty_universe_pop integer CHECK (acs2024_poverty_universe_pop IS NULL OR acs2024_poverty_universe_pop >= 0),
  ADD COLUMN acs2024_poverty_rate numeric CHECK (acs2024_poverty_rate IS NULL OR acs2024_poverty_rate BETWEEN 0 AND 100),
  ADD COLUMN acs2024_median_family_income_usd integer CHECK (acs2024_median_family_income_usd IS NULL OR acs2024_median_family_income_usd >= 0),
  ADD COLUMN acs2024_basis text;

-- Layer 4: existing subsidized multifamily in designated tracts, from the screen's `assets` mode (three
-- anonymous HUD-hosted layers: HUD-assisted multifamily, USDA rural housing, LIHTC allocation records), one
-- row per source property, keyed to the run and the 2010 tract it sits in. Every column of the offline
-- oz-eb5-assets.csv is preserved verbatim; the tract's class and CBSA are carried as the screen wrote them and
-- the import refuses a row whose class disagrees with its tract. No owner, management-agent, phone or email
-- field exists in the source pull and none is stored. An asset row is a geographic and administrative
-- observation, never evidence of availability, a transaction, an approved incentive or a willing counterparty.
CREATE TABLE research_oz_eb5_assets (
  run_id text NOT NULL REFERENCES research_oz_eb5_runs(id),
  source text NOT NULL CHECK (source IN ('hud_assisted','usda_rural','hud_lihtc')),
  source_object_id text NOT NULL CHECK (length(source_object_id) BETWEEN 1 AND 40),
  source_property_id text NOT NULL CHECK (length(source_property_id) BETWEEN 1 AND 80),
  property_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state_abbr text NOT NULL CHECK (length(state_abbr) <= 2),
  zip text NOT NULL CHECK (length(zip) <= 10),
  latitude numeric NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geoid_2010 text NOT NULL CHECK (geoid_2010 ~ '^[0-9]{11}$'),
  tract_state text NOT NULL,
  tract_county_name text NOT NULL,
  eb5_rural_class text NOT NULL CHECK (eb5_rural_class IN ('rural_clear','rural_interpretation_dependent','not_rural_place_per_iiusa','not_rural_msa','unknown')),
  cbsa_type text NOT NULL,
  cbsa_title text NOT NULL,
  total_units integer CHECK (total_units IS NULL OR total_units >= 0),
  assisted_units integer CHECK (assisted_units IS NULL OR assisted_units >= 0),
  assisted_units_basis text NOT NULL,
  program_or_designation text NOT NULL,
  program_2 text NOT NULL,
  contract_or_restriction_expiration_raw text NOT NULL,
  contract_or_restriction_expiration_year integer CHECK (contract_or_restriction_expiration_year IS NULL OR contract_or_restriction_expiration_year BETWEEN 1900 AND 2200),
  expiration_status text NOT NULL CHECK (expiration_status IN ('none','later','expires_by_2030','expired')),
  second_expiration_raw text NOT NULL,
  loan_maturity_year integer CHECK (loan_maturity_year IS NULL OR loan_maturity_year BETWEEN 1900 AND 2200),
  effective_year integer CHECK (effective_year IS NULL OR effective_year BETWEEN 1900 AND 2200),
  source_layer text NOT NULL,
  retrieved_utc text NOT NULL,
  PRIMARY KEY (run_id, source, source_object_id),
  FOREIGN KEY (run_id, geoid_2010) REFERENCES research_oz_eb5_tracts(run_id, geoid_2010)
);
CREATE INDEX research_oz_eb5_assets_tract ON research_oz_eb5_assets(run_id, geoid_2010);
CREATE INDEX research_oz_eb5_assets_state_class ON research_oz_eb5_assets(run_id, tract_state, eb5_rural_class);

CREATE TRIGGER research_oz_eb5_assets_immutable BEFORE UPDATE OR DELETE ON research_oz_eb5_assets FOR EACH ROW EXECUTE FUNCTION workspace_reject_history_change();
