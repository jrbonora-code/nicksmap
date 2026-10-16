import { mkdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { postgresTool,fingerprint } from "./db-recovery-support.mjs";

try {
  if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if(process.env.DATABASE_SSL_CA && !process.env.PGSSLROOTCERT) throw new Error("Set PGSSLROOTCERT to the CA certificate file for PostgreSQL command-line tools.");
  const folder=resolve(".local/backups");
  await mkdir(folder,{recursive:true});
  const path=resolve(folder,`workspace-${new Date().toISOString().replace(/[:.]/g,"-")}.dump`);
  // Snapshot export and fingerprint are sequential: writes must be paused for exact comparison.
  await postgresTool("pg_dump",["--format=custom","--no-owner","--no-acl","--file",path],process.env.DATABASE_URL);
  const bytes=await readFile(path);
  const metadata={createdAt:new Date().toISOString(),sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length,
    tables:await fingerprint(process.env.DATABASE_URL),scope:"Database only; no document storage is implemented.",
    consistency:"Pause writes during this procedure; the comparison is gathered immediately after pg_dump.",
    productionRecoveryVerified:false};
  await writeFile(`${path}.json`,JSON.stringify(metadata,null,2)+"\n",{flag:"wx"});
  console.log(`Database archive created: ${path}`);
  console.log("Archive is a private local file. Production recovery remains unverified until an independent restore exercise.");
} catch { console.error("Database backup failed. Check private connection/tool settings, PG_BIN, and PGSSLROOTCERT if using a custom CA."); process.exitCode=1; }
