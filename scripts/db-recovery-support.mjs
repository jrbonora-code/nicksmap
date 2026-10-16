import { spawn } from "node:child_process";
import { join } from "node:path";
import { createDatabasePool, databaseOptions } from "../db/connection.mjs";

export function postgresEnvironment(connection) {
  const config=databaseOptions({...process.env,DATABASE_URL:connection});
  const url=new URL(config.connectionString);
  return {...process.env,PGHOST:url.hostname.replace(/^\[|\]$/g,""),PGPORT:url.port||"5432",PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
    PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:config.ssl===false?"disable":"verify-full"};
}
export async function postgresTool(name,args,connection) {
  const executable=process.env.PG_BIN ? join(process.env.PG_BIN,`${name}${process.platform==="win32"?".exe":""}`) : name;
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env:postgresEnvironment(connection),windowsHide:true,stdio:["ignore","ignore","pipe"]});
    // Driver tools can include credentials/paths/source content in errors. Keep private stderr out of reports.
    child.stderr.resume();
    child.once("error",()=>reject(new Error(`Cannot launch ${name}. Configure PG_BIN if needed.`)));
    child.once("exit",code=>code===0?resolve():reject(new Error(`${name} failed. Check the private database/tool configuration.`)));
  });
}
export async function fingerprint(connection) {
  const pool=createDatabasePool({...process.env,DATABASE_URL:connection});
  const result={};
  let client;
  try {
    client=await pool.connect();
    // to_jsonb(timestamptz) uses the session time zone; normalize on the same
    // checked-out connection used for every table. Text order must not inherit
    // the source or restored cluster's locale.
    await client.query("SET TIME ZONE 'UTC'");
    const tables=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=\'public\' ORDER BY tablename COLLATE "C"')).rows;
    for(const {tablename} of tables) {
      const identifier='"'+tablename.replaceAll('"','""')+'"';
      const row=(await client.query(`SELECT count(*)::text AS rows, md5(coalesce(string_agg(value::text, E'\\n' ORDER BY value::text COLLATE "C"),'')) AS content_hash FROM (SELECT to_jsonb(t) AS value FROM public.${identifier} t) s`)).rows[0];
      result[tablename]=row;
    }
    return result;
  } finally {client?.release();await pool.end();}
}
