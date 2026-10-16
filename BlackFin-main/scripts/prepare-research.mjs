import { loanMetadata, mortgageHistory, providerFields, providerEstimate, markPossibleDuplicates } from '../lib/research/provider.ts';
// Offline preparation: reads the saved acquisition; performs no provider calls.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import simplify from '@turf/simplify';

const [acquisition,ozDirectory,geometryDirectory,output]=process.argv.slice(2);
if(!output) throw new Error('Usage: prepare-research ACQUISITION OZ_DIRECTORY GEOMETRY_DIRECTORY PRIVATE_OUTPUT.gz');
const parserVersion='research-import-3';
const sha=value=>createHash('sha256').update(value).digest('hex');
const counties={'12015':'Charlotte','12021':'Collier','12057':'Hillsborough','12071':'Lee','12081':'Manatee','12103':'Pinellas','12115':'Sarasota'};
const cents=n=>typeof n==='number'&&n>0&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):null;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}/.test(x)&&Number.isFinite(Date.parse(x))?x.slice(0,10):null;
const dbPath=path.join(acquisition,'dataset/tampa-naples.sqlite');
const db=new DatabaseSync(dbPath,{readOnly:true});
if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Invalid staging database.');
const meta=JSON.parse(await fs.readFile(path.join(acquisition,'dataset/summary.json'),'utf8'));
const eligibilityRaw=await fs.readFile(path.join(ozDirectory,'eligibility-rows.json'));
const eligibleRows=JSON.parse(eligibilityRaw).filter(row=>row[0]==='Florida');
const eligible=new Map(eligibleRows.map(row=>[String(row[2]).padStart(11,'0'),{rural:row[3]==='Rural'}]));
const workbook=await fs.readFile(path.join(ozDirectory,'rp-26-14-appendix.xlsx'));
if(sha(workbook)!=='5e21ee2f88edfe871f75b5c5a0b5a6c8cc20d9ac74fffe3c4cc11f4c39c46969')throw new Error('Eligibility source hash mismatch.');
const geometryManifest=JSON.parse(await fs.readFile(path.join(geometryDirectory,'manifest.json'),'utf8'));
if(geometryManifest.vintage!=='2020-01-01'||geometryManifest.crs!=='EPSG:4326')throw new Error('Unsupported spatial contract.');
const tracts=[];
for(const source of geometryManifest.sources){
  const raw=await fs.readFile(path.join(geometryDirectory,source.file));
  if(sha(raw)!==source.sha256)throw new Error('Geometry hash mismatch.');
  const geo=JSON.parse(raw);
  const expectedUrl=new URL(source.url);expectedUrl.searchParams.set('f','json');expectedUrl.searchParams.set('returnCountOnly','true');
  // Saved complete per-county response is used; no network call during preparation.
  if(geo.features.length!==source.features||geo.features.length!==source.expectedCount||geo.exceededTransferLimit)throw new Error('Incomplete tract response.');
  for(const feature of geo.features){
    const geoid=feature.properties.GEOID;
    if(!/^12\d{9}$/.test(geoid)||!['Polygon','MultiPolygon'].includes(feature.geometry?.type))throw new Error('Invalid tract.');
    tracts.push({geoid,eligible:eligible.has(geoid),rural:eligible.get(geoid)?.rural??false,geometry:feature.geometry,
      displayGeometry:simplify(feature,{tolerance:.00008,highQuality:true}).geometry,
      source:{...source,geometryVintage:'2020-01-01',eligibilitySource:'https://www.irs.gov/pub/irs-drop/rp-26-14-appendix.xlsx',eligibilityHash:sha(workbook),eligibilityRetrievedAt:'2026-09-12',status:'eligible_for_nomination_not_designated'},bbox:bbox(feature)});
  }
}
const targetEligible=[...eligible.keys()].filter(id=>id.slice(0,5) in counties);
if(targetEligible.length!==239||tracts.filter(t=>t.eligible).length!==239||targetEligible.some(id=>!tracts.some(t=>t.geoid===id)))throw new Error('Eligibility join does not reconcile.');
const sources=[];
for(const row of db.prepare('SELECT * FROM sources ORDER BY source_id').all()){
  const file=path.resolve(acquisition,...row.local_raw_file.split(/[\\/]/));
  if(!file.startsWith(path.resolve(acquisition)+path.sep))throw new Error('Source path leaves acquisition root.');
  const raw=await fs.readFile(file);
  if(sha(raw)!==row.sha256)throw new Error('Source hash mismatch.');
  sources.push({id:row.source_id,provider:row.provider,url:row.url,retrievedAt:row.retrieved_at_utc,dateBasis:row.date_basis,sha256:row.sha256,locator:row.local_raw_file.replaceAll('\\','/'),content:raw.toString('utf8')});
}
const sourceById=new Map(sources.map(s=>[s.id,s]));
const licenses=db.prepare('SELECT * FROM licenses ORDER BY license_number').all();
const properties=db.prepare('SELECT * FROM provider_properties ORDER BY property_id').all();
const links=db.prepare('SELECT * FROM license_property_links ORDER BY license_number,property_id').all();
const mortgages=db.prepare('SELECT * FROM mortgage_records ORDER BY property_id,sequence').all();
const licenseById=new Map(licenses.map(l=>[l.license_number,l]));
const propertyById=new Map(properties.map(p=>[p.property_id,p]));
const grouped=new Map();
const debtRecords=mortgages.map(m=>{
  const county=propertyById.get(m.property_id).county_fips;
  const raw=JSON.parse(m.raw_json), history=JSON.parse(propertyById.get(m.property_id).raw_json).mortgageHistory??[];
  const document=m.document_number?.trim();
  // County-scoped recorded instrument identity. No lender-name fuzzy matching.
  const key=document?`${county}:${document.toUpperCase().replace(/\s+/g,'')}`:null;
  const d={id:`${m.property_id}:${m.sequence}`,propertyId:m.property_id,sourceId:m.source_id,sequence:m.sequence,instrumentKey:key,lender:m.lender_name?.trim()||null,amountCents:cents(m.recorded_amount_usd),recordingDate:date(m.recording_date),documentDate:date(m.document_date),maturity:date(m.maturity_date),documentNumber:document||null,reportedRate:m.interest_rate_reported,sharedPropertyCount:1,instrumentConflict:false,...loanMetadata(raw,history)};
  if(key){const list=grouped.get(key)??[];list.push(d);grouped.set(key,list);}return d;
});
for(const list of grouped.values()){
  const count=new Set(list.map(d=>d.propertyId)).size;
  const versions=new Set(list.map(d=>JSON.stringify([d.amountCents,d.lender,d.recordingDate,d.maturity,d.loanType,d.position,d.lenderCode,d.providerOpen])));
  for(const d of list){d.sharedPropertyCount=count;d.instrumentConflict=versions.size>1;}
}
markPossibleDuplicates(debtRecords);
const records=properties.map(p=>{
  const raw=JSON.parse(p.raw_json),rel=links.filter(l=>l.property_id===p.property_id);
  const licenseLinks=rel.map(l=>{const license=licenseById.get(l.license_number);return {license:l.license_number,name:license.business_name,address:license.location_address,units:license.licensed_units,status:l.match_status,flags:JSON.parse(l.flags_json),sourceId:license.source_id,primaryStatus:String(license.primary_status_code),expiry:license.expiry_date};});
  const point=p.latitude===null||p.longitude===null?null:[p.longitude,p.latitude];
  const candidates=point?tracts.filter(t=>point[0]>=t.bbox[0]&&point[0]<=t.bbox[2]&&point[1]>=t.bbox[1]&&point[1]<=t.bbox[3]&&booleanPointInPolygon(point,t.geometry)):[];
  const tract=candidates.length===1?candidates[0]:null;
  const strict=rel.some(l=>l.match_status==='address_consistent');
  const flags=[...new Set(licenseLinks.flatMap(l=>l.flags))];
  const owner=raw.ownerInfo?.owner1FullName||raw.ownerInfo?.owner1LastName||null;
  const record={id:'reapi:'+p.property_id,providerId:p.property_id,address:p.address||'Address not reported',countyFips:p.county_fips,countyName:counties[p.county_fips]??'Outside acquired region',apn:p.apn,longitude:p.longitude,latitude:p.latitude,owner,propertyType:p.property_type,providerUnits:p.provider_units_usable,licensedUnits:[...new Set(licenseLinks.map(l=>l.units).filter(n=>n>0))],licenseCount:licenseLinks.length,yearBuilt:p.year_built_reported,estimatedValueCents:cents(p.estimated_value_usd),sourceId:p.source_id,retrievedAt:p.retrieved_at_utc,providerDate:date(p.provider_last_update_date),strictAddress:strict,needsReview:rel.some(l=>l.match_status!=='address_consistent')||flags.length>0,flags,mortgageHistory:mortgageHistory(raw,p.property_id,p.source_id),providerEstimate:providerEstimate(raw,p.source_id,p.retrieved_at_utc),mortgages:debtRecords.filter(d=>d.propertyId===p.property_id).map(d=>{const observation={...d};delete observation.propertyId;return observation;}),tractId:tract?.geoid??null,oz:candidates.length>1?'ambiguous':!tract?'unmapped':tract.eligible?'eligible':'not_in_list',rural:tract?.eligible?tract.rural:null};
  const ids=new Set([p.source_id,...record.mortgages.map(d=>d.sourceId),...licenseLinks.map(l=>l.sourceId),...rel.map(l=>l.source_id)]);
  const fields=[['Address','propertyInfo.address.label',p.address],['Provider units','propertyInfo.unitsCount',p.provider_units_reported],['Recorded owner','ownerInfo.owner1FullName',owner],['Parcel ID','lotInfo.apn / propertyInfo.parcelAccountNumber',p.apn],['Estimated value (USD)','estimatedValue',p.estimated_value_usd],['Provider update','lastUpdateDate',p.provider_last_update_date]].map(([label,field,value])=>({label,path:field,value:value===null||value===undefined?null:String(value),sourceId:p.source_id})).concat(providerFields(raw,p.source_id));
  return {id:record.id,inRegion:p.county_fips in counties,record,detail:{property:record,licenses:licenseLinks,sources:[...ids].map(id=>{const source={...sourceById.get(id)};delete source.content;return source;}),fields}};
});
const observations=[...licenses.map(l=>({kind:'license',id:l.license_number,sourceId:l.source_id,payload:l})),...properties.map(p=>({kind:'property',id:p.property_id,sourceId:p.source_id,payload:p})),...mortgages.map(m=>({kind:'mortgage',id:`${m.property_id}:${m.sequence}`,sourceId:m.source_id,payload:m})),...links.map(l=>({kind:'association',id:`${l.license_number}:${l.property_id}`,sourceId:l.source_id,payload:l}))];
const manifest={parserVersion,sqliteHash:sha(await fs.readFile(dbPath)),eligibilityHash:sha(workbook),geometry:geometryManifest,sourceHashes:sources.map(s=>[s.id,s.sha256]),counts:{licenses:licenses.length,properties:records.length,inRegion:records.filter(r=>r.inRegion).length,mortgages:mortgages.length,links:links.length,tracts:tracts.length,eligibleTracts:239,eligibleProperties:records.filter(r=>r.inRegion&&r.record.oz==='eligible').length,providerBalanceEstimates:records.filter(r=>r.inRegion&&r.record.providerEstimate?.mortgageBalanceCents).length,providerOpenMortgageTotals:records.filter(r=>r.inRegion&&r.record.providerEstimate?.openMortgageCents).length,providerEquityEstimates:records.filter(r=>r.inRegion&&r.record.providerEstimate?.equityCents).length,unmapped:records.filter(r=>r.inRegion&&r.record.oz==='unmapped').length,ambiguous:records.filter(r=>r.inRegion&&r.record.oz==='ambiguous').length,unmatchedLicenses:licenses.filter(l=>!links.some(x=>x.license_number===l.license_number)).length},countyCoverage:Object.entries(counties).map(([fips,name])=>({fips,name,properties:records.filter(r=>r.record.countyFips===fips).length,licenses:licenses.filter(l=>l.county?.toLowerCase()===name.toLowerCase()).length}))};
manifest.transformedHash=sha(JSON.stringify({records,observations,tracts}));
const id=sha(JSON.stringify(manifest));
const bundle={id,parserVersion,sourceDate:meta.built_at_utc,manifest,sources,observations,records,tracts};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,gzipSync(JSON.stringify(bundle)));
await fs.writeFile(output+'.manifest.json',JSON.stringify({id,...manifest},null,2));
console.log(JSON.stringify({id,counts:manifest.counts,bytes:(await fs.stat(output)).size}));db.close();
