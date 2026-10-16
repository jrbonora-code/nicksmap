// Explicit operator import of a prepared loan-source bundle. Never invoked at startup or on a schedule.
//
//   node scripts/debt-import.mjs .local/debt/import/debt-<id>.json.gz
//
// Run db:migrate first: 010-debt-sources.sql must be applied before this command or the code that reads it.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createDatabasePool } from '../db/connection.mjs';
import { importDebt } from './debt-import-core.mjs';
const file = process.argv[2];
if (!file) throw new Error('Supply the debt-<id>.json.gz produced by scripts/debt-refresh.mjs.');
let pool;
try {
  const stat = await fs.stat(file);
  if (stat.size > 60e6) throw new Error('Import too large.');
  const raw = await fs.readFile(file);
  const digest = createHash('sha256').update(raw).digest('hex');
  if (process.env.DEBT_BUNDLE_SHA256 && process.env.DEBT_BUNDLE_SHA256 !== digest) throw new Error('Bundle does not match its expected SHA-256.');
  const bundle = JSON.parse(gunzipSync(raw, { maxOutputLength: 600e6 }));
  pool = createDatabasePool();
  console.log(JSON.stringify(await importDebt(pool, bundle, { importedBy: process.env.DEBT_IMPORTED_BY || 'operator-cli' })));
} catch (error) {
  console.error(`Loan-source import failed: ${error instanceof Error ? error.message : 'unknown error'}. The previously imported run is retained; inspect the import history.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
