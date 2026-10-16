// Explicit operator import of a prepared OZ / EB-5 bundle. Never invoked at startup or on a schedule.
//
//   node scripts/import-oz-eb5.mjs .local/oz-eb5-screen/import/oz-eb5-import.json.gz
//
// Run db:migrate first: 007-oz-eb5.sql must be applied before this command or the code that reads it.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createDatabasePool } from '../db/connection.mjs';
import { importOzEb5 } from './oz-eb5-import-core.mjs';
const file = process.argv[2];
if (!file) throw new Error('Supply the prepared oz-eb5-import.json.gz produced by scripts/prepare-oz-eb5-import.mjs.');
let pool;
try {
  const stat = await fs.stat(file);
  if (stat.size > 40e6) throw new Error('Import too large.');
  const raw = await fs.readFile(file);
  // When the preparer's manifest sits beside the bundle, the bundle's own bytes are verified before it is parsed.
  try {
    const receipt = JSON.parse(await fs.readFile(`${file}.manifest.json`, 'utf8'));
    if (receipt.bundleSha256 && receipt.bundleSha256 !== createHash('sha256').update(raw).digest('hex')) throw new Error('Bundle does not match its manifest SHA-256.');
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const bundle = JSON.parse(gunzipSync(raw, { maxOutputLength: 250e6 }));
  pool = createDatabasePool();
  console.log(JSON.stringify(await importOzEb5(pool, bundle, { importedBy: process.env.OZ_EB5_IMPORTED_BY || 'operator-cli' })));
} catch (error) {
  console.error(`OZ / EB-5 import failed: ${error instanceof Error ? error.message : 'unknown error'}. The previously imported run is retained; inspect the import history.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
