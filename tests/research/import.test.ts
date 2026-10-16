import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateBundle } from '../../scripts/research-import-core.mjs';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
export function fixture(){
  const source={id:'source',content:'synthetic source',sha256:sha('synthetic source'),provider:'Synthetic QA',url:'https://example.invalid',retrievedAt:'2026-09-12T00:00:00Z',dateBasis:'Synthetic case',locator:'fixture.txt'};
  const mortgage={id:'reapi:fixture:0',sourceId:'source',sequence:0,instrumentKey:'12057:SYN-1',lender:'Synthetic Bank',amountCents:500000000,recordingDate:'2021-05-01',documentDate:null,maturity:'2027-03-01',documentNumber:'SYN-1',reportedRate:null,sharedPropertyCount:1,instrumentConflict:false,loanType:null,position:'First'};
  const record={id:'reapi:fixture',providerId:'fixture',sourceId:'source',countyFips:'12057',countyName:'Hillsborough',address:'1 Synthetic Way',apn:null,longitude:-82.4,latitude:27.9,owner:'SYNTHETIC OWNER LLC',propertyType:'MFR',providerUnits:48,licensedUnits:[48],licenseCount:1,yearBuilt:1998,estimatedValueCents:null,retrievedAt:'2026-09-12T00:00:00.000Z',providerDate:'2026-09-01',strictAddress:true,needsReview:false,flags:[],mortgages:[mortgage],tractId:null,oz:'unmapped',rural:null};
  const records=[{id:record.id,inRegion:true,record,detail:{property:record,sources:[{id:source.id,provider:source.provider,url:source.url,retrievedAt:source.retrievedAt,dateBasis:source.dateBasis,sha256:source.sha256,locator:source.locator}],licenses:[],fields:[]}}];
  const observations=[{kind:'property',id:'fixture',sourceId:'source',payload:{}}];
  const tracts:unknown[]=[];
  const manifest={counts:{properties:1,tracts:0},sourceHashes:[[source.id,source.sha256]],transformedHash:sha(JSON.stringify({records,observations,tracts}))};
  return {id:sha(JSON.stringify(manifest)),parserVersion:'research-import-1',sourceDate:'2026-09-12T00:00:00Z',manifest,sources:[source],records,observations,tracts};
}
test('source and transformation content hashes protect prepared imports',()=>{
  const b=fixture();validateBundle(b);
  const corrupt=structuredClone(b);corrupt.sources[0].content='changed';assert.throws(()=>validateBundle(corrupt));
  const transformed=structuredClone(b);transformed.records[0].record.countyFips='12071';assert.throws(()=>validateBundle(transformed));
  const manifest=structuredClone(b);manifest.manifest.counts.properties=2;assert.throws(()=>validateBundle(manifest));
});
