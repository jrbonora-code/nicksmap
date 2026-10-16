import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "../db/connection.mjs";

const directory = fileURLToPath(new URL("../db/", import.meta.url));
const pool = createDatabasePool();
let client;
try {
  client = await pool.connect();
  await client.query("SELECT pg_advisory_lock(621477011)");
  await client.query("CREATE TABLE IF NOT EXISTS workspace_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(directory)).filter(name => /^\d{3}[-\w]*\.sql$/.test(name)).sort();
  for (const name of files) {
    const sql = await readFile(new URL(`../db/${name}`, import.meta.url), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const prior = await client.query("SELECT sha256 FROM workspace_migrations WHERE name=$1", [name]);
    if (prior.rows.length) {
      if (prior.rows[0].sha256 !== hash) throw new Error("An applied migration has changed. Add a forward migration instead.");
      console.log(`Already applied: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO workspace_migrations(name, sha256) VALUES ($1,$2)", [name,hash]);
      await client.query("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} catch {
  console.error("Database migration failed. Check database connectivity, permissions and migration consistency. No credentials or SQL details are printed.");
  process.exitCode = 1;
} finally {
  if (client) { await client.query("SELECT pg_advisory_unlock(621477011)").catch(() => {}); client.release(); }
  await pool.end();
}
