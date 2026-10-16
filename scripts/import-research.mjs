import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createDatabasePool } from '../db/connection.mjs';
import { importResearch } from './research-import-core.mjs';
const file=process.argv[2];
if(!file)throw new Error('Supply a private prepared .gz file or --stdin. Run db:migrate explicitly first.');
let pool;
try {
  let raw;
  if(file==='--stdin'){const chunks=[];let size=0;for await(const c of process.stdin){size+=c.length;if(size>40e6)throw new Error('Import too large.');chunks.push(c);}raw=Buffer.concat(chunks);}else{const stat=await fs.stat(file);if(stat.size>40e6)throw new Error('Import too large.');raw=await fs.readFile(file);}
  const bundle=JSON.parse(gunzipSync(raw,{maxOutputLength:250e6}));
  pool=createDatabasePool();console.log(JSON.stringify(await importResearch(pool,bundle)));
}catch{console.error('Research import failed. Previous committed data is retained; inspect the private validation evidence and import history.');process.exitCode=1;}
finally{await pool?.end();}
