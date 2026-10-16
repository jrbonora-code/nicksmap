// Explicit operator import of a prepared national 2027 OZ bundle. Never invoked at startup or on a schedule.
//
//   node scripts/oz2027-import.mjs .local/oz2027/import/oz2027-import.json.gz
//
// Run db:migrate first: 009-oz-2027.sql must be applied before this command or the code that reads it.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createDatabasePool } from '../db/connection.mjs';
import { importOz2027 } from './oz2027-import-core.mjs';
const file = process.argv[2];
if (!file) throw new Error('Supply the oz2027-import.json.gz produced by scripts/oz2027-refresh.mjs.');
let pool;
try {
  const stat = await fs.stat(file);
  if (stat.size > 40e6) throw new Error('Import too large.');
  const raw = await fs.readFile(file);
  const digest = createHash('sha256').update(raw).digest('hex');
  // The bundle's bytes are verified against its manifest (beside it) or an explicit OZ2027_BUNDLE_SHA256 before parsing.
  const expected = process.env.OZ2027_BUNDLE_SHA256 ?? await fs.readFile(`${file}.manifest.json`, 'utf8').then(text => JSON.parse(text).bundleSha256, error => { if (error?.code === 'ENOENT') return null; throw error; });
  if (expected && expected !== digest) throw new Error('Bundle does not match its expected SHA-256.');
  const bundle = JSON.parse(gunzipSync(raw, { maxOutputLength: 400e6 }));
  pool = createDatabasePool();
  console.log(JSON.stringify(await importOz2027(pool, bundle, { importedBy: process.env.OZ2027_IMPORTED_BY || 'operator-cli' })));
} catch (error) {
  console.error(`OZ 2027 import failed: ${error instanceof Error ? error.message : 'unknown error'}. The previously imported run is retained; inspect the import history.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
