// Import of a prepared national 2027 OZ bundle (migration 009). One advisory lock, one transaction, an audit row in
// research_import_runs, and a replay when the same content-addressed run already exists, exactly as
// scripts/oz-eb5-import-core.mjs does for the 2018 screen. Nothing here reaches the network.
import { randomUUID } from 'node:crypto';
import { OZ2027_CONFIDENCE, OZ2027_ROUTES, OZ2027_SHIPPABLE_PUBLISHERS, OZ2027_SIGNAL_TIERS, OZ2027_STATE_STATUSES, OZ2027_TIERS, headlineOf, sha256 } from './oz2027-lib.mjs';

export const OZ2027_PARSER_VERSION = 'oz2027-import-1';
const TRACT_COLUMNS = ['geoid_2020', 'state', 'state_fips', 'county', 'county_fips', 'cbsa', 'poverty_rate', 'mfi_ratio', 'mfi_ub_ratio', 'temp_displacement', 'eligibility_route',
  'rural_status', 'in_april_appendix', 'headline_status', 'headline_confidence', 'headline_source_id', 'signal_count', 'overlap_2018_land_pct', 'min_lon', 'min_lat', 'max_lon', 'max_lat', 'label_lon', 'label_lat'];
const SIGNAL_COLUMNS = ['geoid_2020', 'source_id', 'state', 'status', 'jurisdiction', 'source_url', 'source_date', 'confidence', 'receipt_sha256', 'on_eligible_list', 'notes'];
const STATE_COLUMNS = ['state', 'status', 'nominated_date', 'certified_date', 'cap', 'eligible_count', 'eligible_rural_count', 'nominated_count', 'tract_signal_count', 'list_url', 'source_url', 'confidence', 'deadline_track', 'notes'];
const LINK_COLUMNS = ['geoid_2010', 'geoid_2020', 'land_part_sqm', 'share_of_2010_pct', 'share_of_2020_pct'];
const HEX = /^[a-f0-9]{64}$/, GEOID = /^\d{11}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, URL = /^https?:\/\/\S{1,990}$/;
// A stored jurisdiction is a government body or municipality. Anything that looks like contact data is refused outright.
const CONTACT = /@|\b\d{3}[-. )]\s*\d{3}[-. ]\d{4}\b|https?:\/\//i;

const isNumberIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const optionalNumberIn = (v, min, max) => v === null || isNumberIn(v, min, max);
function exactKeys(row, columns, what) {
  const keys = Object.keys(row);
  for (const key of keys) if (!columns.includes(key)) throw new Error(`${what} carries an undocumented field ${key}.`);
  for (const column of columns) if (!(column in row)) throw new Error(`${what} is missing ${column}.`);
}

/** Every check a bundle must pass before a single row is written. */
export function validateOz2027Bundle(b) {
  if (!b || b.parserVersion !== OZ2027_PARSER_VERSION || !b.manifest || sha256(JSON.stringify(b.manifest)) !== b.id) throw new Error('Invalid OZ 2027 import manifest.');
  if (![b.tracts, b.signals, b.states, b.links].every(Array.isArray)) throw new Error('Invalid OZ 2027 import shape.');
  if (b.tracts.length === 0 || b.tracts.length > 40000 || b.signals.length > 100000 || b.states.length === 0 || b.states.length > 60 || b.links.length > 200000) throw new Error('OZ 2027 import is outside the supported size.');
  if (sha256(JSON.stringify({ tracts: b.tracts, signals: b.signals, states: b.states, links: b.links })) !== b.manifest.transformedHash) throw new Error('Transformed rows do not match the manifest.');
  if (!HEX.test(b.manifest.refreshScriptSha256 ?? '') || !HEX.test(b.manifest.federal?.treasury?.sha256 ?? '')) throw new Error('The manifest does not name the refresh script and the Treasury file these rows came from.');
  const counts = b.manifest.counts ?? {};
  if (counts.tracts !== b.tracts.length || counts.signals !== b.signals.length || counts.states !== b.states.length || counts.links !== b.links.length) throw new Error('OZ 2027 import count mismatch.');
  if (!Array.isArray(b.manifest.sources)) throw new Error('The manifest lists no sources.');
  const sources = new Map(b.manifest.sources.map(s => [s.id, s]));

  // Signals: one per tract per shipped source, at that source's tier and confidence.
  const signalKeys = new Set();
  const signalsBy = new Map();
  for (const s of b.signals) {
    exactKeys(s, SIGNAL_COLUMNS, 'A signal');
    const key = `${s.geoid_2020}:${s.source_id}`;
    if (!GEOID.test(s.geoid_2020) || signalKeys.has(key)) throw new Error(`Duplicate or invalid signal ${key}.`);
    signalKeys.add(key);
    const source = sources.get(s.source_id);
    if (!source || !source.shipped || !OZ2027_SHIPPABLE_PUBLISHERS.has(source.publisherClass)) throw new Error(`Signal ${key} names a source that may not be shipped (D06).`);
    if (!OZ2027_SIGNAL_TIERS.includes(s.status) || s.status !== source.tier) throw new Error(`Signal ${key} carries a tier its source does not.`);
    if (!OZ2027_CONFIDENCE.includes(s.confidence) || s.confidence !== source.confidence) throw new Error(`Signal ${key} carries a confidence its source does not.`);
    if (!HEX.test(s.receipt_sha256) || !URL.test(s.source_url) || (s.source_date !== null && !DATE.test(s.source_date))) throw new Error(`Signal ${key} lacks a usable receipt, URL or date.`);
    if (typeof s.on_eligible_list !== 'boolean' || typeof s.jurisdiction !== 'string' || s.jurisdiction.length > 200 || typeof s.notes !== 'string' || s.notes.length > 2000) throw new Error(`Signal ${key} is malformed.`);
    if (CONTACT.test(s.jurisdiction)) throw new Error(`Signal ${key} carries what looks like contact data in its jurisdiction.`);
    if (!signalsBy.has(s.geoid_2020)) signalsBy.set(s.geoid_2020, []);
    signalsBy.get(s.geoid_2020).push(s);
  }

  // Tracts: Treasury's eligible list, each with a headline that the signals reproduce.
  const ids = new Set();
  const perState = new Map();
  for (const t of b.tracts) {
    exactKeys(t, [...TRACT_COLUMNS, 'display_geometry'], `Tract ${t.geoid_2020}`);
    if (!GEOID.test(t.geoid_2020) || ids.has(t.geoid_2020)) throw new Error('Duplicate or invalid 2020 tract id.');
    ids.add(t.geoid_2020);
    if (t.state_fips !== t.geoid_2020.slice(0, 2) || t.county_fips !== t.geoid_2020.slice(0, 5)) throw new Error(`State or county code does not agree with tract ${t.geoid_2020}.`);
    if (!t.state || typeof t.county !== 'string' || typeof t.cbsa !== 'string') throw new Error(`Tract ${t.geoid_2020} is missing a state, county or CBSA field.`);
    if (!optionalNumberIn(t.poverty_rate, 0, 100) || !optionalNumberIn(t.mfi_ratio, 0, 1e6) || !optionalNumberIn(t.mfi_ub_ratio, 0, 1e6)) throw new Error(`Tract ${t.geoid_2020}: a Treasury measure is out of range.`);
    if (typeof t.temp_displacement !== 'boolean' || typeof t.in_april_appendix !== 'boolean' || ![0, 1].includes(t.rural_status) || !OZ2027_ROUTES.includes(t.eligibility_route)) throw new Error(`Tract ${t.geoid_2020}: an eligibility field is malformed.`);
    if (!OZ2027_TIERS.includes(t.headline_status)) throw new Error(`Tract ${t.geoid_2020} carries an unknown headline status.`);
    const own = signalsBy.get(t.geoid_2020) ?? [];
    const expected = headlineOf(own);
    if (t.headline_status !== expected.status || t.headline_confidence !== expected.confidence || t.headline_source_id !== expected.sourceId || t.signal_count !== own.length) throw new Error(`Tract ${t.geoid_2020}: the headline status does not follow from its signals.`);
    if (!isNumberIn(t.overlap_2018_land_pct, 0, 100) || !isNumberIn(t.min_lon, -180, 180) || !isNumberIn(t.max_lon, -180, 180) || !isNumberIn(t.min_lat, -90, 90) || !isNumberIn(t.max_lat, -90, 90) || t.min_lon > t.max_lon || t.min_lat > t.max_lat || !(t.label_lon >= t.min_lon && t.label_lon <= t.max_lon && t.label_lat >= t.min_lat && t.label_lat <= t.max_lat)) throw new Error(`Tract ${t.geoid_2020}: overlap or bounding box out of range.`);
    const g = t.display_geometry;
    if (!g || !['Polygon', 'MultiPolygon'].includes(g.type) || !Array.isArray(g.coordinates) || !g.coordinates.length) throw new Error(`Invalid display geometry for tract ${t.geoid_2020}.`);
    const entry = perState.get(t.state) ?? { eligible: 0, rural: 0, signalled: 0 };
    entry.eligible++; entry.rural += t.rural_status; entry.signalled += own.length ? 1 : 0;
    perState.set(t.state, entry);
  }
  for (const s of b.signals) if (s.on_eligible_list !== ids.has(s.geoid_2020)) throw new Error(`Signal ${s.geoid_2020}:${s.source_id} misstates whether the tract is on Treasury's eligible list.`);

  const stateNames = new Set();
  for (const s of b.states) {
    exactKeys(s, STATE_COLUMNS, `State ${s.state}`);
    if (!s.state || stateNames.has(s.state)) throw new Error('Duplicate or missing jurisdiction.');
    stateNames.add(s.state);
    if (!OZ2027_STATE_STATUSES.includes(s.status) || !OZ2027_CONFIDENCE.includes(s.confidence)) throw new Error(`${s.state}: unknown status or confidence.`);
    for (const d of [s.nominated_date, s.certified_date]) if (d !== null && !DATE.test(d)) throw new Error(`${s.state}: invalid date.`);
    const mine = perState.get(s.state) ?? { eligible: 0, rural: 0, signalled: 0 };
    if (s.eligible_count !== mine.eligible || s.eligible_rural_count !== mine.rural || s.tract_signal_count !== mine.signalled) throw new Error(`${s.state}: state counts do not agree with the tract rows.`);
    if (!URL.test(s.source_url) || (s.list_url && !URL.test(s.list_url))) throw new Error(`${s.state}: invalid source or list URL.`);
  }
  for (const state of perState.keys()) if (!stateNames.has(state)) throw new Error(`Tracts name ${state}, which has no state row.`);

  const linkKeys = new Set();
  for (const l of b.links) {
    exactKeys(l, LINK_COLUMNS, 'A link');
    const key = `${l.geoid_2010}:${l.geoid_2020}`;
    if (!GEOID.test(l.geoid_2010) || !GEOID.test(l.geoid_2020) || linkKeys.has(key)) throw new Error(`Duplicate or invalid link ${key}.`);
    linkKeys.add(key);
    if (!Number.isInteger(l.land_part_sqm) || l.land_part_sqm < 0 || !isNumberIn(l.share_of_2010_pct, 0, 100) || !isNumberIn(l.share_of_2020_pct, 0, 100)) throw new Error(`Link ${key} carries an out-of-range share.`);
  }
}

async function insertChunks(client, table, columns, rows, values, chunk) {
  for (let i = 0; i < rows.length; i += chunk) {
    const params = [];
    const placeholders = rows.slice(i, i + chunk).map(row => `(${values(row).map(value => `$${params.push(value)}`).join(',')})`);
    await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES ${placeholders.join(',')}`, params);
  }
}

/**
 * Explicit operator import. A failure rolls the transaction back and leaves the previously imported run live; a
 * replay of the same content-addressed run re-points research_oz2027_current without writing a second copy.
 */
export async function importOz2027(pool, b, { importedBy = 'operator-cli', failAfterTracts = false } = {}) {
  validateOz2027Bundle(b);
  const auditId = randomUUID();
  const summary = { kind: 'oz2027', tracts: b.tracts.length, signals: b.signals.length, states: b.states.length, links: b.links.length };
  await pool.query("INSERT INTO research_import_runs(id,snapshot_id,status,detail) VALUES($1,$2,'running',$3)", [auditId, b.id, JSON.stringify({ kind: 'oz2027' })]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(621477014)');
    const prior = await client.query('SELECT id FROM research_oz2027_runs WHERE id=$1', [b.id]);
    if (prior.rowCount) {
      for (const [table, expected] of [['research_oz2027_tracts', b.tracts.length], ['research_oz2027_signals', b.signals.length], ['research_oz2027_states', b.states.length], ['research_oz2027_links', b.links.length]]) {
        const found = await client.query(`SELECT count(*)::int n FROM ${table} WHERE run_id=$1`, [b.id]);
        if (found.rows[0].n !== expected) throw new Error(`A prior import of this run holds a different number of rows in ${table}.`);
      }
      await client.query("INSERT INTO research_oz2027_current(workspace_id,run_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET run_id=EXCLUDED.run_id", [b.id]);
      await client.query("UPDATE research_import_runs SET status='replayed',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify(summary)]);
      await client.query('COMMIT');
      return { status: 'replayed', runId: b.id, auditId, counts: b.manifest.counts };
    }
    await client.query('INSERT INTO research_oz2027_runs(id,imported_by,parser_version,script_sha256,treasury_sha256,sources,counts,rule) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [b.id, importedBy, b.parserVersion, b.manifest.refreshScriptSha256, b.manifest.federal.treasury.sha256, JSON.stringify(b.manifest.sources), JSON.stringify(b.manifest.counts), b.manifest.rule]);
    await insertChunks(client, 'research_oz2027_tracts', ['run_id', ...TRACT_COLUMNS, 'display_geometry'], b.tracts,
      t => [b.id, ...TRACT_COLUMNS.map(c => t[c]), JSON.stringify(t.display_geometry)], 100);
    if (failAfterTracts) throw new Error('Controlled OZ 2027 import fault.');
    await insertChunks(client, 'research_oz2027_signals', ['run_id', ...SIGNAL_COLUMNS], b.signals, s => [b.id, ...SIGNAL_COLUMNS.map(c => s[c])], 300);
    await insertChunks(client, 'research_oz2027_states', ['run_id', ...STATE_COLUMNS], b.states, s => [b.id, ...STATE_COLUMNS.map(c => s[c])], 60);
    await insertChunks(client, 'research_oz2027_links', ['run_id', ...LINK_COLUMNS], b.links, l => [b.id, ...LINK_COLUMNS.map(c => l[c])], 1000);
    await client.query("INSERT INTO research_oz2027_current(workspace_id,run_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET run_id=EXCLUDED.run_id", [b.id]);
    await client.query("UPDATE research_import_runs SET status='imported',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify(summary)]);
    await client.query('COMMIT');
    return { status: 'imported', runId: b.id, auditId, counts: b.manifest.counts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await pool.query("UPDATE research_import_runs SET status='failed',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify({ kind: 'oz2027', reason: 'Import rolled back; the previously imported run is retained.' })]);
    throw error;
  } finally {
    client.release();
  }
}
