import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createDatabasePool } from '../db/connection.mjs';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/radar_test'))throw new Error('Use an isolated loopback test database.');
const name='radar_test_research_'+randomBytes(5).toString('hex');const pool=createDatabasePool();
try{await pool.query(`CREATE DATABASE "${name}"`);}finally{await pool.end();}
url.pathname='/'+name;
const env={...process.env,DATABASE_URL:url.toString(),DATABASE_SSL_MODE:'disable',RESEARCH_TEST_DATABASE_URL:url.toString()};
// The identity boundary is replaced with node:test module mocking, as scripts/db-test.mjs already does.
for(const args of [['scripts/db-migrate.mjs'],['--experimental-test-module-mocks','--test','tests/research/database.integration.ts'],['--experimental-test-module-mocks','--test','tests/research/oz2027.integration.ts'],['--experimental-test-module-mocks','--test','tests/research/debt.integration.ts']]){const r=spawnSync(process.execPath,args,{env,stdio:'inherit',windowsHide:true});if(r.status)process.exit(r.status);}
console.log('Isolated import QA database retained: '+name);
