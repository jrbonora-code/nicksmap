// Import of a prepared loan-source bundle (migration 010). One advisory lock, one transaction, an audit row in
// research_import_runs. The bundle is checked before any write: its id is the hash of its manifest, its data hash
// matches, every link points at a row in the bundle, and no stored name fails the organization test (a person's
// name refuses the whole bundle).
import { createHash, randomUUID } from 'node:crypto';
import { isOrganization } from './debt-lib.mjs';

export const DEBT_PARSER_VERSION = 'debt-sources-1';
const sha = v => createHash('sha256').update(v).digest('hex');
const snake = s => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
export const HUD_COLUMNS = ['project', 'status', 'propertyName', 'city', 'state', 'zip', 'units', 'initialEndorsement', 'finalEndorsement', 'originalAmountCents', 'firstPayment', 'maturity', 'termMonths', 'ratePct', 'monthlyPaymentCents', 'balanceCents', 'holder', 'servicer', 'sectionCode', 'sectionCategory', 'businessType', 'terminationType', 'claim', 'terminated'];
export const CMBS_COLUMNS = ['trust', 'cik', 'accession', 'filed', 'asset', 'propertyIndex', 'periodEnd', 'propertyName', 'address', 'city', 'state', 'zip', 'county', 'units', 'yearBuilt', 'originalAmountCents', 'originated', 'maturity', 'ratePct', 'balanceCents', 'paidThrough', 'paymentStatus', 'specialServicing', 'specialServicerTransfer', 'masterServicerReturn', 'workoutStrategy', 'modified', 'modificationCode', 'lastModification', 'payoffCode', 'payoffDate', 'interestOnly', 'amortizationMonths', 'servicer', 'originator', 'propertyCount', 'occupancyPct', 'occupancyDate', 'dscrNcf', 'dscrNoi', 'valuationCents', 'valuationDate', 'lon', 'lat', 'geocode'];
const RELEASE_KEYS = ['county', 'instrument', 'type', 'recorded', 'amountCents', 'citedInstrument', 'citedBook', 'citedPage', 'lenders'];
const int = v => (v === null || v === undefined ? null : Math.round(Number(v)));
const INTEGER = new Set(['units', 'termMonths', 'yearBuilt', 'amortizationMonths', 'propertyIndex', 'propertyCount']);

export function validateDebtBundle(b) {
  if (!b || b.manifest?.parserVersion !== DEBT_PARSER_VERSION || sha(JSON.stringify(b.manifest)) !== b.id) throw new Error('Invalid loan-source manifest.');
  for (const k of ['hud', 'cmbs', 'releases', 'clerkDays', 'links']) if (!Array.isArray(b[k])) throw new Error(`Missing ${k}.`);
  if (sha(JSON.stringify({ hud: b.hud, cmbs: b.cmbs, releases: b.releases, clerkDays: b.clerkDays, links: b.links })) !== b.manifest.dataSha256) throw new Error('Data does not match the manifest.');
  const c = b.manifest.counts;
  if (b.hud.length !== c.hudLoans || b.cmbs.length !== c.cmbsRecords || b.releases.length !== c.releases || b.links.length !== c.links || b.clerkDays.length !== c.clerkDays) throw new Error('Row counts differ from the manifest.');
  if (!/^[a-f0-9]{64}$/.test(b.manifest.researchSnapshotId ?? '')) throw new Error('Missing research snapshot.');
  // Privacy: only organizations may be named anywhere a party appears; borrower parties never travel.
  const names = [...b.hud.flatMap(l => [l.holder, l.servicer]), ...b.cmbs.flatMap(r => [r.servicer, r.originator]), ...b.releases.flatMap(r => r.lenders)].filter(n => n !== null && n !== undefined);
  const person = names.find(n => !isOrganization(n));
  if (person !== undefined) throw new Error('A stored party name is not an organization; refusing the bundle.');
  for (const r of b.releases) if (Object.keys(r).some(k => !RELEASE_KEYS.includes(k))) throw new Error('A release carries an unexpected field.');
  if (new Set(b.releases.map(r => `${r.county}:${r.instrument}`)).size !== b.releases.length) throw new Error('A release instrument appears twice.');
  const keys = new Set([...b.hud.map((_, i) => `hud:${i}`), ...b.cmbs.map((_, i) => `cmbs:${i}`), ...b.releases.map(r => `${r.county}:${r.instrument}`)]);
  const seen = new Set();
  for (const l of b.links) {
    if (!/^reapi:[A-Za-z0-9_-]{1,80}$/.test(l.propertyId) || !['hud', 'cmbs', 'release'].includes(l.source) || !['confirmed', 'probable'].includes(l.confidence)) throw new Error('Invalid link.');
    if (!keys.has(l.sourceKey)) throw new Error(`Link to a missing row ${l.sourceKey}.`);
    const k = `${l.propertyId}|${l.source}|${l.sourceKey}`;
    if (seen.has(k)) throw new Error('Duplicate link.');
    seen.add(k);
  }
}
async function insertChunks(client, table, columns, rows, values, chunk) {
  for (let i = 0; i < rows.length; i += chunk) {
    const params = [];
    const placeholders = rows.slice(i, i + chunk).map((row, j) => `(${values(row, i + j).map(value => `$${params.push(value)}`).join(',')})`);
    await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES ${placeholders.join(',')}`, params);
  }
}
const value = (row, key) => (INTEGER.has(key) ? int(row[key]) : row[key] ?? null);

/** Explicit operator import. A failure rolls back and leaves the previous run live; a replay re-points the current run. */
export async function importDebt(pool, b, { importedBy = 'operator-cli', failAfterLoans = false } = {}) {
  validateDebtBundle(b);
  const auditId = randomUUID();
  const summary = { kind: 'debt', ...b.manifest.counts };
  await pool.query("INSERT INTO research_import_runs(id,snapshot_id,status,detail) VALUES($1,$2,'running',$3)", [auditId, b.id, JSON.stringify({ kind: 'debt' })]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(621477015)');
    const snapshot = await client.query('SELECT 1 FROM research_snapshots WHERE id=$1', [b.manifest.researchSnapshotId]);
    if (!snapshot.rowCount) throw new Error('The research snapshot these links were made against is not imported.');
    const prior = await client.query('SELECT id FROM research_debt_runs WHERE id=$1', [b.id]);
    if (prior.rowCount) {
      for (const [table, expected] of [['research_debt_hud_loans', b.hud.length], ['research_debt_cmbs_loans', b.cmbs.length], ['research_debt_releases', b.releases.length], ['research_debt_links', b.links.length]]) {
        const found = await client.query(`SELECT count(*)::int n FROM ${table} WHERE run_id=$1`, [b.id]);
        if (found.rows[0].n !== expected) throw new Error(`A prior import of this run holds a different number of rows in ${table}.`);
      }
      await client.query("INSERT INTO research_debt_current(workspace_id,run_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET run_id=EXCLUDED.run_id", [b.id]);
      await client.query("UPDATE research_import_runs SET status='replayed',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify(summary)]);
      await client.query('COMMIT');
      return { status: 'replayed', runId: b.id, auditId, counts: b.manifest.counts };
    }
    await client.query('INSERT INTO research_debt_runs(id,imported_by,parser_version,script_sha256,research_snapshot_id,sources,counts,rule) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [b.id, importedBy, b.manifest.parserVersion, b.manifest.scriptSha256, b.manifest.researchSnapshotId, JSON.stringify(b.manifest.sources), JSON.stringify(b.manifest.counts), b.manifest.rule]);
    await insertChunks(client, 'research_debt_hud_loans', ['run_id', 'seq', ...HUD_COLUMNS.map(snake)], b.hud, (l, i) => [b.id, i, ...HUD_COLUMNS.map(k => value(l, k))], 400);
    if (failAfterLoans) throw new Error('Controlled loan-source import fault.');
    await insertChunks(client, 'research_debt_cmbs_loans', ['run_id', 'seq', ...CMBS_COLUMNS.map(snake)], b.cmbs, (r, i) => [b.id, i, ...CMBS_COLUMNS.map(k => value(r, k))], 200);
    await insertChunks(client, 'research_debt_releases', ['run_id', 'county_fips', 'instrument', 'doc_type', 'recorded', 'amount_cents', 'cited_instrument', 'cited_book', 'cited_page', 'lenders'], b.releases,
      r => [b.id, r.county, r.instrument, r.type, r.recorded, r.amountCents, r.citedInstrument, r.citedBook, r.citedPage, JSON.stringify(r.lenders)], 500);
    await insertChunks(client, 'research_debt_clerk_days', ['run_id', 'county_fips', 'day', 'file', 'sha256', 'releases'], b.clerkDays, d => [b.id, d.county, d.day, d.file, d.sha256, d.releases], 200);
    await insertChunks(client, 'research_debt_links', ['run_id', 'property_id', 'source', 'source_key', 'debt_id', 'confidence', 'method', 'detail'], b.links,
      l => [b.id, l.propertyId, l.source, l.sourceKey, l.debtId, l.confidence, l.method, JSON.stringify(l.detail)], 500);
    await client.query("INSERT INTO research_debt_current(workspace_id,run_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET run_id=EXCLUDED.run_id", [b.id]);
    await client.query("UPDATE research_import_runs SET status='imported',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify(summary)]);
    await client.query('COMMIT');
    return { status: 'imported', runId: b.id, auditId, counts: b.manifest.counts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await pool.query("UPDATE research_import_runs SET status='failed',finished_at=now(),detail=$2 WHERE id=$1", [auditId, JSON.stringify({ kind: 'debt', reason: 'Import rolled back; the previously imported run is retained.' })]);
    throw error;
  } finally {
    client.release();
  }
}
