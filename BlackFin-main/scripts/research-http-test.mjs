import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const [base,cookieFile]=process.argv.slice(2);
if(!base||!cookieFile)throw new Error('Supply a local test origin and private cookie file.');
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('This script targets isolated loopback test instances only.');
const cookie=(await fs.readFile(cookieFile,'utf8')).trim();
const auth={cookie};
const page=await fetch(base+'/research',{headers:auth,redirect:'manual'});
assert.equal(page.status,200);
const csp=page.headers.get('content-security-policy');
assert.ok(csp.includes('https://tile.openstreetmap.org'),'Street tile requests are blocked by CSP');
assert.ok(csp.includes('https://imagery.nationalmap.gov'),'Aerial requests are blocked by CSP');
for(const path of ['/api/research','/api/research/history','/api/research/saved','/api/research/tracts?snapshot='+('0'.repeat(64))]){
  const denied=await fetch(base+path);assert.equal(denied.status,401,path);assert.match(denied.headers.get('cache-control'),/no-store/);
  const forged=await fetch(base+path,{headers:{cookie:'better-auth.session_token=forged'}});assert.equal(forged.status,401,path);
}
const result=await (await fetch(base+'/api/research',{headers:auth})).json();
assert.equal(result.total,1262);assert.equal(result.mapped,result.total);assert.equal(result.coverage.eligibleProperties,424);
const detail=await(await fetch(base+'/api/research/property/'+encodeURIComponent(result.rows[0].id)+'?snapshot='+result.snapshotId,{headers:auth})).json();
assert.equal(detail.property.id,result.rows[0].id);assert.ok(detail.sources.every(s=>s.sha256.length===64));
const tracts=await(await fetch(base+'/api/research/tracts?snapshot='+result.snapshotId,{headers:auth})).json();assert.equal(tracts.features.length,239);
const deniedSave=await fetch(base+'/api/research/saved',{method:'POST',headers:{...auth,origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}'});assert.equal(deniedSave.status,400);
console.log('Research HTTP checks passed: real snapshot counts, OZ geometry, source detail, cache protection, forged-session denial and cross-origin save denial.');
