import { createHash, randomUUID } from 'node:crypto';
const sha=v=>createHash('sha256').update(v).digest('hex');
export function validateBundle(b) {
  if(!b||!['research-import-1','research-import-2','research-import-3'].includes(b.parserVersion)||sha(JSON.stringify(b.manifest))!==b.id)throw new Error('Invalid import manifest.');
  if(!Array.isArray(b.sources)||!Array.isArray(b.records)||!Array.isArray(b.observations)||!Array.isArray(b.tracts)||b.records.length>20000)throw new Error('Invalid import shape.');
  if(sha(JSON.stringify({records:b.records,observations:b.observations,tracts:b.tracts}))!==b.manifest.transformedHash)throw new Error('Transformed records do not match the manifest.');
  if(b.records.length!==b.manifest.counts.properties||b.tracts.length!==b.manifest.counts.tracts)throw new Error('Import count mismatch.');
  const ids=new Set();
  for(const source of b.sources){if(ids.has(source.id)||sha(source.content)!==source.sha256)throw new Error('Duplicate or corrupt source.');ids.add(source.id);}
  if(b.manifest.sourceHashes.length!==b.sources.length||b.manifest.sourceHashes.some(([id,hash])=>!b.sources.some(s=>s.id===id&&s.sha256===hash)))throw new Error('Source manifest mismatch.');
  if(new Set(b.records.map(r=>r.id)).size!==b.records.length)throw new Error('Duplicate property identity.');
  for(const row of b.records)if(row.id!=='reapi:'+row.record.providerId||row.detail.property.id!==row.id||!ids.has(row.record.sourceId))throw new Error('Property identity or source mismatch.');
  for(const row of b.observations)if(!ids.has(row.sourceId))throw new Error('Orphan observation.');
}
export async function importResearch(pool,b,{failAfterProperties=false}={}) {
  validateBundle(b);
  const runId=randomUUID();
  await pool.query("INSERT INTO research_import_runs(id,snapshot_id,status) VALUES($1,$2,'running')",[runId,b.id]);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(621477012)');
    const prior=await client.query('SELECT id FROM research_snapshots WHERE id=$1',[b.id]);
    if(prior.rowCount){
      const count=await client.query('SELECT count(*)::int n FROM research_snapshot_properties WHERE snapshot_id=$1',[b.id]);
      if(count.rows[0].n!==b.records.length)throw new Error('Prior import count differs.');
      await client.query("UPDATE research_import_runs SET status='replayed',finished_at=now(),detail=$2 WHERE id=$1",[runId,JSON.stringify(b.manifest.counts)]);
      await client.query('COMMIT');return {status:'replayed',snapshotId:b.id,runId,counts:b.manifest.counts};
    }
    await client.query('INSERT INTO research_snapshots(id,parser_version,source_date,manifest) VALUES($1,$2,$3,$4)',[b.id,b.parserVersion,b.sourceDate,JSON.stringify(b.manifest)]);
    for(const s of b.sources)await client.query('INSERT INTO research_sources(snapshot_id,id,provider,url,retrieved_at,date_basis,sha256,locator,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[b.id,s.id,s.provider,s.url,s.retrievedAt,s.dateBasis,s.sha256,s.locator,s.content]);
    for(const r of b.records){
      await client.query("INSERT INTO research_properties(id,identity_basis,provider,provider_id) VALUES($1,'provider_record','RealEstateAPI',$2) ON CONFLICT(id) DO NOTHING",[r.id,r.record.providerId]);
      await client.query('INSERT INTO research_snapshot_properties(snapshot_id,property_id,county_fips,in_region,record,detail) VALUES($1,$2,$3,$4,$5,$6)',[b.id,r.id,r.record.countyFips,r.inRegion,JSON.stringify(r.record),JSON.stringify(r.detail)]);
    }
    if(failAfterProperties)throw new Error('Controlled import fault.');
    for(const o of b.observations)await client.query('INSERT INTO research_observations(snapshot_id,kind,native_id,source_id,payload) VALUES($1,$2,$3,$4,$5)',[b.id,o.kind,o.id,o.sourceId,JSON.stringify(o.payload)]);
    for(const t of b.tracts)await client.query('INSERT INTO research_tracts(snapshot_id,geoid,eligible,rural,geometry,display_geometry,source) VALUES($1,$2,$3,$4,$5,$6,$7)',[b.id,t.geoid,t.eligible,t.rural,JSON.stringify(t.geometry),JSON.stringify(t.displayGeometry),JSON.stringify(t.source)]);
    await client.query("INSERT INTO research_current(workspace_id,snapshot_id) VALUES('primary',$1) ON CONFLICT(workspace_id) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id",[b.id]);
    await client.query("UPDATE research_import_runs SET status='imported',finished_at=now(),detail=$2 WHERE id=$1",[runId,JSON.stringify(b.manifest.counts)]);
    await client.query('COMMIT');return {status:'imported',snapshotId:b.id,runId,counts:b.manifest.counts};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});await pool.query("UPDATE research_import_runs SET status='failed',finished_at=now(),detail=$2 WHERE id=$1",[runId,JSON.stringify({reason:'Import rolled back; previous snapshot retained.'})]);throw error;}
  finally{client.release();}
}
