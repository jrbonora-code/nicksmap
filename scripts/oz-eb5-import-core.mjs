import { createHash, randomUUID } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
export const OZ_EB5_PARSER_VERSION = 'oz-eb5-import-2';
const CLASSES = new Set(['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'not_rural_msa', 'unknown']);
const CBSA_TYPES = new Set(['metropolitan', 'micropolitan']);
const TRACT_COLUMNS = ['geoid_2010', 'state', 'county_name', 'county_fips', 'tract_type', 'oz_status', 'oz_authority', 'geoid_2010_geometry_alias', 'cbsa_code', 'cbsa_title', 'cbsa_type', 'msa_basis', 'town_basis', 'bridge_type', 'tracts_2020', 'dropped_successors', 'iiusa_rows', 'iiusa_coverage_pct', 'iiusa_rural_tea', 'iiusa_msa', 'place_20k_names', 'place_20k_kind', 'place_20k_successor_land_pct', 'eb5_rural_class', 'class_reason', 'notes'];
// The twenty-six columns the offline screen appended after `notes`, with what each may hold. A value is a
// number or null for the measured columns, one of the listed words or null for the verdict columns, and a
// string for the basis columns. Migration 008 carries the same domains as CHECK constraints.
const PCT = { kind: 'number', min: 0, max: 100 };
const NONNEG = { kind: 'number', min: 0, max: Infinity };
const COUNT = { kind: 'integer', min: 0, max: 1e9 };
const TEXT = { kind: 'text' };
const words = (...list) => ({ kind: 'enum', values: new Set(list) });
export const EXTENSION_COLUMNS = {
  oz2027_eligible_land_pct: PCT, oz2027_status: words('fully_eligible', 'partially_eligible', 'not_eligible', 'unknown'),
  oz2027_rural_land_pct: PCT, oz2027_rural_flag: words('rural', 'non_rural', 'mixed', 'not_eligible', 'unknown'), oz2027_basis: TEXT,
  lihtc_qct_2026_land_pct: PCT, lihtc_qct_2026: words('yes', 'partial', 'no', 'unknown'), lihtc_qct_2026_basis: TEXT,
  lihtc_dda_2026: words('yes', 'no', 'metro_zcta_not_evaluated', 'unknown'), lihtc_dda_2026_basis: TEXT,
  nmtc_lic_land_pct: PCT, nmtc_lic_eligible: words('yes', 'partial', 'no', 'unknown'), nmtc_poverty_rate: PCT, nmtc_mfi_ratio_pct: NONNEG, nmtc_basis: TEXT,
  acs2015_poverty_rate: PCT, acs2015_mfi_ratio_pct: NONNEG, acs2015_poverty_universe_pop: COUNT, acs2015_lic_eligible: words('yes', 'no', 'unknown'), acs2015_basis: TEXT,
  acs2024_coverage: words('whole', 'containing_tract', 'partial', 'unknown'), acs2024_population: COUNT, acs2024_poverty_universe_pop: COUNT,
  acs2024_poverty_rate: PCT, acs2024_median_family_income_usd: COUNT, acs2024_basis: TEXT,
};
const EXTENSION_NAMES = Object.keys(EXTENSION_COLUMNS);
// Layer 4, one row per source property. Every column of the offline oz-eb5-assets.csv, none of them an
// owner, agent, phone or email field.
export const ASSET_SOURCES = new Set(['hud_assisted', 'usda_rural', 'hud_lihtc']);
const EXPIRATION_STATUSES = new Set(['none', 'later', 'expires_by_2030', 'expired']);
const ASSET_TEXT = ['source_property_id', 'property_name', 'address', 'city', 'state_abbr', 'zip', 'tract_state', 'tract_county_name', 'cbsa_type', 'cbsa_title', 'assisted_units_basis', 'program_or_designation', 'program_2', 'contract_or_restriction_expiration_raw', 'second_expiration_raw', 'source_layer', 'retrieved_utc'];
const ASSET_INTEGER_OR_NULL = ['total_units', 'assisted_units', 'contract_or_restriction_expiration_year', 'loan_maturity_year', 'effective_year'];
export const ASSET_COLUMNS = ['source', 'source_object_id', 'source_property_id', 'property_name', 'address', 'city', 'state_abbr', 'zip', 'latitude', 'longitude', 'geoid_2010', 'tract_state', 'tract_county_name', 'eb5_rural_class', 'cbsa_type', 'cbsa_title', 'total_units', 'assisted_units', 'assisted_units_basis', 'program_or_designation', 'program_2', 'contract_or_restriction_expiration_raw', 'contract_or_restriction_expiration_year', 'expiration_status', 'second_expiration_raw', 'loan_maturity_year', 'effective_year', 'source_layer', 'retrieved_utc'];
const CHUNK = 100;

function checkExtension(t, column, rule) {
  const value = t[column];
  if (value === undefined) throw new Error(`Tract ${t.geoid_2010} is missing ${column}.`);
  if (rule.kind === 'text') { if (typeof value !== 'string') throw new Error(`Tract ${t.geoid_2010}: ${column} must be text.`); return; }
  if (value === null) return;
  if (rule.kind === 'enum') { if (!rule.values.has(value)) throw new Error(`Tract ${t.geoid_2010}: ${column} carries an undocumented value.`); return; }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min || value > rule.max) throw new Error(`Tract ${t.geoid_2010}: ${column} is out of range.`);
  if (rule.kind === 'integer' && !Number.isInteger(value)) throw new Error(`Tract ${t.geoid_2010}: ${column} must be a whole number.`);
}

/** Every check a bundle must pass before a single row is written. Nothing here reaches the network. */
export function validateOzEb5Bundle(b) {
  if (!b || b.parserVersion !== OZ_EB5_PARSER_VERSION || sha(JSON.stringify(b.manifest)) !== b.id) throw new Error('Invalid OZ / EB-5 import manifest.');
  if (!Array.isArray(b.tracts) || !Array.isArray(b.omb) || !Array.isArray(b.assets) || !b.geometry || typeof b.geometry !== 'object') throw new Error('Invalid OZ / EB-5 import shape.');
  if (b.tracts.length === 0 || b.tracts.length > 20000 || b.omb.length === 0 || b.omb.length > 5000 || b.assets.length > 100000) throw new Error('OZ / EB-5 import is outside the supported size.');
  if (sha(JSON.stringify({ tracts: b.tracts, geometry: b.geometry, omb: b.omb, assets: b.assets })) !== b.manifest.transformedHash) throw new Error('Transformed rows do not match the manifest.');
  if (!/^[a-f0-9]{64}$/.test(b.manifest.screenScriptSha256 ?? '')) throw new Error('The manifest does not name the screen script that produced these rows.');
  const counts = b.manifest.counts ?? {};
  const geometryKeys = Object.keys(b.geometry);
  if (counts.tracts !== b.tracts.length || counts.withGeometry !== geometryKeys.length || counts.ombCounties !== b.omb.length || counts.assets !== b.assets.length) throw new Error('OZ / EB-5 import count mismatch.');
  const ids = new Set();
  const classOf = new Map();
  for (const t of b.tracts) {
    if (!/^\d{11}$/.test(t.geoid_2010 ?? '') || ids.has(t.geoid_2010)) throw new Error('Duplicate or invalid designated tract id.');
    if (!/^\d{5}$/.test(t.county_fips ?? '') || t.county_fips !== t.geoid_2010.slice(0, 5)) throw new Error(`County code does not agree with tract ${t.geoid_2010}.`);
    if (!CLASSES.has(t.eb5_rural_class)) throw new Error(`Unknown EB-5 rural class on tract ${t.geoid_2010}.`);
    if (!t.state || !t.class_reason) throw new Error(`Tract ${t.geoid_2010} is missing a state or a class reason.`);
    for (const column of TRACT_COLUMNS) if (t[column] === undefined || t[column] === null) throw new Error(`Tract ${t.geoid_2010} is missing ${column}.`);
    for (const [column, rule] of Object.entries(EXTENSION_COLUMNS)) checkExtension(t, column, rule);
    ids.add(t.geoid_2010);
    classOf.set(t.geoid_2010, t.eb5_rural_class);
  }
  for (const geoid of geometryKeys) {
    if (!ids.has(geoid)) throw new Error(`Geometry supplied for tract ${geoid}, which is not in the table.`);
    const g = b.geometry[geoid];
    if (!g || !['Polygon', 'MultiPolygon'].includes(g.type) || !Array.isArray(g.coordinates)) throw new Error(`Invalid display geometry for tract ${geoid}.`);
  }
  // A metropolitan tract fails the rural test on the MSA leg regardless of place, so it is carried without geometry.
  for (const t of b.tracts) if (t.eb5_rural_class !== 'not_rural_msa' && !(t.geoid_2010 in b.geometry)) throw new Error(`Tract ${t.geoid_2010} is not metropolitan but carries no geometry.`);
  const countyIds = new Set();
  for (const c of b.omb) {
    if (!/^\d{5}$/.test(c.countyFips ?? '') || countyIds.has(c.countyFips)) throw new Error('Duplicate or invalid OMB county code.');
    if (!CBSA_TYPES.has(c.cbsaType)) throw new Error(`Unknown CBSA type for county ${c.countyFips}.`);
    countyIds.add(c.countyFips);
  }
  // Assets sit in a designated tract of this run and carry that tract's class as the screen wrote it. A row
  // whose class disagrees with its tract means the assets mode ran against a different tract table.
  const assetKeys = new Set();
  for (const a of b.assets) {
    if (!ASSET_SOURCES.has(a.source)) throw new Error('Unknown asset source.');
    if (typeof a.source_object_id !== 'string' || a.source_object_id.length < 1 || a.source_object_id.length > 40) throw new Error(`Invalid asset object id under ${a.source}.`);
    const key = `${a.source}:${a.source_object_id}`;
    if (assetKeys.has(key)) throw new Error(`Duplicate asset ${key}.`);
    assetKeys.add(key);
    if (!ids.has(a.geoid_2010)) throw new Error(`Asset ${key} names tract ${a.geoid_2010}, which is not in the table.`);
    if (a.eb5_rural_class !== classOf.get(a.geoid_2010)) throw new Error(`Asset ${key} carries a class that disagrees with its tract ${a.geoid_2010}; rerun the assets mode against the current tract table.`);
    if (!EXPIRATION_STATUSES.has(a.expiration_status)) throw new Error(`Asset ${key} carries an undocumented expiration status.`);
    for (const column of ASSET_TEXT) if (typeof a[column] !== 'string') throw new Error(`Asset ${key} is missing ${column}.`);
    if (a.source_property_id.length < 1 || a.source_property_id.length > 80 || a.state_abbr.length > 2 || a.zip.length > 10) throw new Error(`Asset ${key} carries an out-of-range identifier.`);
    if (typeof a.latitude !== 'number' || typeof a.longitude !== 'number' || !(a.latitude >= -90 && a.latitude <= 90) || !(a.longitude >= -180 && a.longitude <= 180)) throw new Error(`Asset ${key} carries no usable coordinates.`);
    for (const column of ASSET_INTEGER_OR_NULL) {
      const value = a[column];
      if (value === null) continue;
      if (!Number.isInteger(value) || value < 0 || value > 1e9) throw new Error(`Asset ${key}: ${column} must be a whole number or null.`);
      if (column.endsWith('_year') && (value < 1900 || value > 2200)) throw new Error(`Asset ${key}: ${column} is not a plausible year.`);
    }
  }
}

// Parameterized multi-row inserts in fixed chunks. Column lists are constants in this file; every value is bound.
async function insertChunks(client, table, columns, rows, values) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const params = [];
    const placeholders = rows.slice(i, i + CHUNK).map(row => `(${values(row).map(value => `$${params.push(value)}`).join(',')})`);
    await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES ${placeholders.join(',')}`, params);
  }
}

/**
 * Explicit operator import. One advisory lock, one transaction, an audit row in research_import_runs, and a
 * replay when the same content-addressed run already exists. A failure rolls the transaction back and leaves
 * the previously imported run live.
 */
export async function importOzEb5(pool, b, { importedBy = 'operator-cli', failAfterTracts = false } = {}) {
  validateOzEb5Bundle(b);
  const auditId = randomUUID();
  const summary = { kind: 'oz_eb5', ...b.manifest.counts };
  await pool.query("INSERT INTO research_import_runs(id,snapshot_id,status,detail) VALUES($1,$2,'running',$3)", [auditId, b.id, JSON.stringify({ kind: 'oz_eb5' })]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(621477013)');
    const prior = await client.query('SELECT id FROM research_oz_eb5_runs WHERE id=$1', [b.id]);
    if (prior.rowCount) {
      const existing = await client.query('SELECT count(*)::int n FROM research_oz_eb5_tracts WHERE run_id=$1', [b.id]);
      if (existing.rows[0].n !== b.tracts.length) throw new Error('A prior import of this run holds a different number of tracts.');
      const existingAssets = await client.query('SELECT count(*)::int n FROM research_oz_eb5_assets WHERE run_id=$1', [b.id]);
      if (existingAssets.rows[0].n !== b.assets.length) throw new Error('A prior import of this run holds a different number of assets.');
      await client.query("INSERT INTO research_oz_eb5_current(workspace_id,run_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET run_id=EXCLUDED.run_id", [b.id]);
      await client.query("UPDATE research_import_runs SET status='replayed',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify(summary)]);
      await client.query('COMMIT');
      return { status: 'replayed', runId: b.id, auditId, counts: b.manifest.counts };
    }
    await client.query('INSERT INTO research_oz_eb5_runs(id,imported_by,script_sha256,sources,counts,rule) VALUES($1,$2,$3,$4,$5,$6)',
      [b.id, importedBy, b.manifest.screenScriptSha256, JSON.stringify(b.manifest.sources), JSON.stringify(b.manifest.counts), b.manifest.rule]);
    await insertChunks(client, 'research_oz_eb5_tracts', ['run_id', ...TRACT_COLUMNS, ...EXTENSION_NAMES, 'display_geometry'], b.tracts,
      t => [b.id, ...TRACT_COLUMNS.map(column => t[column]), ...EXTENSION_NAMES.map(column => t[column]), b.geometry[t.geoid_2010] ? JSON.stringify(b.geometry[t.geoid_2010]) : null]);
    if (failAfterTracts) throw new Error('Controlled OZ / EB-5 import fault.');
    await insertChunks(client, 'research_oz_eb5_cbsa_counties', ['run_id', 'county_fips', 'county_name', 'cbsa_code', 'cbsa_title', 'cbsa_type'], b.omb,
      c => [b.id, c.countyFips, c.countyName, c.cbsaCode, c.cbsaTitle, c.cbsaType]);
    await insertChunks(client, 'research_oz_eb5_assets', ['run_id', ...ASSET_COLUMNS], b.assets, a => [b.id, ...ASSET_COLUMNS.map(column => a[column])]);
    await client.query("INSERT INTO research_oz_eb5_current(workspace_id,run_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET run_id=EXCLUDED.run_id", [b.id]);
    await client.query("UPDATE research_import_runs SET status='imported',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify(summary)]);
    await client.query('COMMIT');
    return { status: 'imported', runId: b.id, auditId, counts: b.manifest.counts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await pool.query("UPDATE research_import_runs SET status='failed',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify({ kind: 'oz_eb5', reason: 'Import rolled back; the previously imported run is retained.' })]);
    throw error;
  } finally {
    client.release();
  }
}
