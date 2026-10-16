import { readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createDatabasePool } from "../db/connection.mjs";
import { postgresTool,fingerprint } from "./db-recovery-support.mjs";

try {
  const connection=process.env.RESTORE_DATABASE_URL;
  const file=process.env.BACKUP_FILE;
  if(!connection||!file) throw new Error("Provide BACKUP_FILE and an empty local RESTORE_DATABASE_URL.");
  const url=new URL(connection);
  if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||!/^\/(radar_test_|radar_restore_)[a-z0-9_]+$/.test(url.pathname)) throw new Error("Restore verification is limited to an explicitly named empty local radar_test_* or radar_restore_* database.");
  if(connection===process.env.DATABASE_URL) throw new Error("The restore target must be separate from the source database.");
  const path=resolve(file);
  const metadata=JSON.parse(await readFile(`${path}.json`,"utf8"));
  const bytes=await readFile(path);
  if(createHash("sha256").update(bytes).digest("hex")!==metadata.sha256) throw new Error("Archive checksum differs from its manifest.");
  const pool=createDatabasePool({...process.env,DATABASE_URL:connection});
  try {
    const tables=await pool.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
    if(tables.rows[0].n!==0) throw new Error("Restore target is not empty; no overwrite was attempted.");
  } finally {await pool.end();}
  await postgresTool("pg_restore",["--exit-on-error","--no-owner","--no-acl","--dbname",url.pathname.slice(1),path],connection);
  const actual=await fingerprint(connection);
  if(JSON.stringify(actual)!==JSON.stringify(metadata.tables)) throw new Error("Restored table counts/content differ from the archive comparison manifest. Investigate concurrent writes or restore errors.");
  const report={verifiedAt:new Date().toISOString(),archiveSha256:metadata.sha256,targetDatabase:url.pathname.slice(1),tables:actual,
    result:"local_database_restore_verified",productionRecoveryVerified:false,documentRestore:"not_applicable_no_document_storage"};
  await writeFile(`${path}.restore-check.json`,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log("Local database restore verified: all table counts and logical content hashes match. Production and private-document recovery remain unverified.");
} catch { console.error("Restore verification failed or target was unsafe/nonempty. No existing tables were intentionally overwritten; inspect the isolated target and private configuration."); process.exitCode=1; }
