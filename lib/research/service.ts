import { prepareSelection } from './selection';
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getWorkspaceSession } from '../auth/session';
import { withDatabase } from '../workspace/db';
import { defaultScenario, MODEL_VERSION, ResearchValidationError, validateScenario } from './finance';
import { emptyQuery, screenProperties, summarize, validateQuery } from './query';
import type { PropertyDetail, ResearchProperty, ResearchQuery, ResearchResult, Scenario, TractFeature } from './types';
import { currentOz2027Run } from './oz2027';
import { APPENDIX_BASIS, ozOverlay, treasuryBasis } from './oz-overlay';
import { cmbsLoan, currentDebtRun, debtOverlay, outsideLoans } from './debt-sources';
export class ResearchUnauthorized extends Error {}
/** Server-side workspace identity for research reads and writes; throws before any body is parsed. */
export async function identity(){const user=await getWorkspaceSession();if(!user)throw new ResearchUnauthorized();return user;}
const iso=(v:Date|string)=>v instanceof Date?v.toISOString():v;
async function dataset(snapshot?:string) {
  if(snapshot&&!/^[a-f0-9]{64}$/.test(snapshot))throw new ResearchValidationError('Invalid snapshot.');
  return withDatabase(async client=>{
    const found=await client.query(snapshot?'SELECT * FROM research_snapshots WHERE id=$1':"SELECT s.* FROM research_current c JOIN research_snapshots s ON s.id=c.snapshot_id WHERE c.workspace_id='primary'",snapshot?[snapshot]:[]);
    const s=found.rows[0];if(!s)return null;
    const records=await client.query('SELECT record FROM research_snapshot_properties WHERE snapshot_id=$1 AND in_region ORDER BY property_id',[s.id]);
    const overlay=await ozOverlay(client,records.rows.map(r=>r.record as ResearchProperty));
    const properties=await debtOverlay(client,overlay.properties);
    return {id:s.id,sourceDate:iso(s.source_date),importedAt:iso(s.imported_at),manifest:s.manifest,properties,ozBasis:overlay.basis};
  });
}
export async function researchQuery(query:ResearchQuery=emptyQuery,scenario:Scenario=defaultScenario(),snapshot?:string):Promise<ResearchResult|null>{
  await identity();const q=validateQuery(query),s=validateScenario(scenario);const data=await dataset(snapshot);if(!data)return null;
  const rows=screenProperties(data.properties,q,s);
  return {snapshotId:data.id,sourceDate:data.sourceDate,importedAt:data.importedAt,ozBasis:data.ozBasis,query:q,scenario:s,rows,total:rows.length,universe:data.properties.length,mapped:rows.filter(r=>r.longitude!==null&&r.latitude!==null).length,licenseUniverse:data.manifest.counts.licenses,unmatchedLicenses:data.manifest.counts.unmatchedLicenses,countyCoverage:data.manifest.countyCoverage,...summarize(rows,s)};
}
export async function researchDetail(id:string,snapshot:string):Promise<PropertyDetail|null>{
  await identity();if(!/^reapi:[\w-]{1,80}$/.test(id)||!/^[a-f0-9]{64}$/.test(snapshot))throw new ResearchValidationError('Invalid record locator.');
  return withDatabase(async client=>{
    const detail=(await client.query('SELECT detail FROM research_snapshot_properties WHERE snapshot_id=$1 AND property_id=$2 AND in_region',[snapshot,id])).rows[0]?.detail as PropertyDetail|undefined;
    if(!detail)return null;
    const overlay=await ozOverlay(client,[detail.property]);
    const [property]=await debtOverlay(client,overlay.properties);
    return {...detail,property,ozBasis:overlay.basis};
  });
}
export async function researchTracts(snapshot:string){
  await identity();if(!/^[a-f0-9]{64}$/.test(snapshot))throw new ResearchValidationError('Invalid snapshot.');
  return withDatabase(async client=>{
    // The snapshot carries display geometry for every tract in its counties; which of them are eligible follows the overlay.
    const run=await currentOz2027Run(client);
    const rows=run
      ?(await client.query(`SELECT r.geoid,z.rural_status=1 rural,r.display_geometry,z.headline_status status,z.overlap_2018_land_pct overlap FROM research_tracts r
          JOIN research_oz2027_tracts z ON z.run_id=$2 AND z.geoid_2020=r.geoid WHERE r.snapshot_id=$1 ORDER BY r.geoid`,[snapshot,run.id])).rows
      :(await client.query('SELECT geoid,rural,display_geometry,NULL status,NULL overlap FROM research_tracts WHERE snapshot_id=$1 AND eligible ORDER BY geoid',[snapshot])).rows;
    return {type:'FeatureCollection' as const,ozBasis:run?treasuryBasis(run.id):APPENDIX_BASIS,
      features:rows.map(r=>({type:'Feature',geometry:r.display_geometry,properties:{geoid:r.geoid,rural:r.rural,eligible:true,status:r.status??null,overlap2018LandPct:r.overlap===null?null:Number(r.overlap)}} as TractFeature))};});
}
export async function researchHistory(){await identity();return withDatabase(async client=>(await client.query('SELECT id,snapshot_id,started_at,finished_at,status,detail FROM research_import_runs ORDER BY started_at DESC LIMIT 30')).rows);}
export async function researchLicenses(snapshot:string,text:string,county:string,unmatched:boolean){
  await identity();if(!/^[a-f0-9]{64}$/.test(snapshot)||text.length>180||county.length>80)throw new ResearchValidationError('Invalid source inventory query.');
  return withDatabase(async client=>{
    const result=await client.query(`SELECT l.native_id,l.source_id,l.payload,
      (SELECT count(*)::int FROM research_observations a WHERE a.snapshot_id=l.snapshot_id AND a.kind='association' AND a.payload->>'license_number'=l.native_id) associations,
      s.sha256,s.retrieved_at,s.url
      FROM research_observations l JOIN research_sources s ON s.snapshot_id=l.snapshot_id AND s.id=l.source_id
      WHERE l.snapshot_id=$1 AND l.kind='license' ORDER BY l.native_id`,[snapshot]);
    return result.rows.filter(r=>(!unmatched||r.associations===0)&&(!county||String(r.payload.county).toLowerCase()===county.toLowerCase())&&(!text||[r.native_id,r.payload.business_name,r.payload.location_address].join(' ').toLowerCase().includes(text.toLowerCase()))).map(r=>({id:r.native_id,name:r.payload.business_name,address:r.payload.location_address,county:r.payload.county,units:r.payload.licensed_units,status:r.payload.primary_status_code,expiry:r.payload.expiry_date,associations:r.associations,sourceId:r.source_id,sourceHash:r.sha256,retrievedAt:iso(r.retrieved_at),url:r.url}));
  });
}
export async function savedAnalyses(){await identity();return withDatabase(async client=>(await client.query("SELECT id,label,created_at,snapshot_id,query,scenario,model_version,result->'selection' selected_scenario FROM research_saved_analyses WHERE workspace_id='primary' ORDER BY created_at DESC LIMIT 30")).rows);}
export async function saveAnalysis(value:unknown){
  const user=await identity();
  if(!value||typeof value!=='object')throw new ResearchValidationError('Invalid saved analysis.');
  const v=value as {label:unknown;query:unknown;scenario:unknown;snapshotId:unknown;selected?:{propertyId:string;debtId:string|null;principalCents:number;amountBasis?:string}};
  if(typeof v.label!=='string'||!v.label.trim()||v.label.length>120||typeof v.snapshotId!=='string')throw new ResearchValidationError('Provide a label and snapshot.');
  const q=validateQuery(v.query),s=validateScenario(v.scenario);
  const result=await researchQuery(q,s,v.snapshotId);if(!result)throw new ResearchValidationError('Snapshot unavailable.');
  let selection=null;
  if(v.selected){
    const p=result.rows.find(p=>p.id===v.selected!.propertyId);if(!p)throw new ResearchValidationError('Selected property is outside the saved query.');
    selection=prepareSelection(p,v.selected,s);
  }
  const id=randomUUID(),label=v.label.trim();
  await withDatabase(client=>client.query("INSERT INTO research_saved_analyses(id,workspace_id,actor_id,snapshot_id,label,query,scenario,model_version,result) VALUES($1,'primary',$2,$3,$4,$5,$6,$7,$8)",[id,user.id,v.snapshotId,label,JSON.stringify(q),JSON.stringify(s),MODEL_VERSION,JSON.stringify({basisVersion:'debt-basis-2',selection,matchedIds:result.rows.map(r=>r.id),coverage:result.coverage,lenders:result.lenders,results:result.rows.map(r=>({id:r.id,sourceDebtId:r.scenarioDebt?.id??null,result:r.scenarioResult}))})]));
  return {id,label};
}
/** CMBS multifamily loans outside the property data (the map layer), and one such loan for its drawer. */
export async function researchOutsideLoans(){await identity();return withDatabase(client=>outsideLoans(client));}
export async function researchCmbsLoan(runId:string,seq:number){
  await identity();if(!/^[a-f0-9]{64}$/.test(runId)||!Number.isSafeInteger(seq)||seq<0)throw new ResearchValidationError('Invalid loan locator.');
  return withDatabase(client=>cmbsLoan(client,runId,seq));
}
/** The current loan-source run: sources, counts and coverage as built. */
export async function researchDebtRun(){await identity();return withDatabase(client=>currentDebtRun(client));}
