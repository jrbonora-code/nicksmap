import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createDatabasePool } from "../db/connection.mjs";

try {
  if(!process.env.DATABASE_URL) throw new Error();
  const source=new URL(process.env.DATABASE_URL);
  if(!["localhost","127.0.0.1","[::1]"].includes(source.hostname)||!source.pathname.startsWith("/radar_test")) throw new Error();
  const name=`radar_test_workspace_${randomBytes(5).toString("hex")}`;
  const admin=createDatabasePool();
  try {await admin.query(`CREATE DATABASE "${name}"`);} finally {await admin.end();}
  source.pathname=`/${name}`;
  const env={...process.env,DATABASE_URL:source.toString(),DATABASE_SSL_MODE:"disable",WORKSPACE_INTEGRATION_URL:source.toString()};
  const run=args=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:"inherit"});
    child.once("error",reject); child.once("exit",code=>code===0?resolve():reject(new Error()));
  });
  await run(["scripts/db-migrate.mjs"]);
  await run(["--experimental-test-module-mocks","--test","tests/workspace/database.test.ts"]);
  console.log(`Synthetic test database retained for inspection: ${name}`);
} catch {console.error("Workspace integration checks failed. Use a loopback radar_test database with permission to create an isolated test database."); process.exitCode=1;}
