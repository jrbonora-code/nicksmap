import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyQuery,screenProperties,summarize,validateQuery } from '../../lib/research/query.ts';
import { defaultScenario } from '../../lib/research/finance.ts';
import type { ResearchProperty,DebtRecord } from '../../lib/research/types.ts';
const debt=(id:string,patch:Partial<DebtRecord>={}):DebtRecord=>({id,sourceId:'s',sequence:0,instrumentKey:'12057:'+id,lender:'Bank A',amountCents:100000000,recordingDate:'2020-01-01',documentDate:null,maturity:'2027-01-01',documentNumber:id,reportedRate:null,sharedPropertyCount:1,instrumentConflict:false,loanType:null,position:'First',...patch});
const property=(id:string,patch:Partial<ResearchProperty>={}):ResearchProperty=>({id,providerId:id,address:'Test '+id,countyFips:'12057',countyName:'Hillsborough',apn:null,longitude:-82,latitude:27,owner:null,propertyType:'MFR',providerUnits:null,licensedUnits:[],licenseCount:0,yearBuilt:null,estimatedValueCents:null,sourceId:'s',retrievedAt:'2026-09-12',providerDate:null,strictAddress:false,needsReview:false,flags:[],mortgages:[],tractId:null,oz:'unmapped',rural:null,...patch});
test('compound lender/maturity filters must match one mortgage record',()=>{
  const p=property('a',{mortgages:[debt('a',{lender:'Bank A',maturity:'2040-01-01'}),debt('b',{lender:'Bank B',maturity:'2027-01-01'})]});
  assert.equal(screenProperties([p],{...emptyQuery,lender:'Bank A',maturityBefore:'2028-01-01'},defaultScenario()).length,0);
});

test('aggregate and truncated observations cannot become scenario debt or lender totals',()=>{
  for(const loanType of ['Loan Amount Keyed Is An Aggregate Amount','Loan Amount $1-9 Billion - Only First 9-Digits entered. Need To Multiply Loan Amount Field By 10']) {
    const rows=screenProperties([property('a',{mortgages:[{...debt('a'),loanType} as DebtRecord]})],emptyQuery,defaultScenario());
    assert.equal(rows[0].scenarioResult,null);
    assert.equal(summarize(rows,defaultScenario()).lenders.length,0);
    assert.equal(summarize(rows,defaultScenario()).coverage.unresolvedInstrumentEntries,1);
  }
});

test('default debt favors first liens then recent recordings, never the largest amount',()=>{
  const mortgages=[debt('old',{recordingDate:'2010-01-01',amountCents:900000000}),debt('new',{recordingDate:'2025-01-01'}),{...debt('junior',{recordingDate:'2026-01-01'}),position:'Second'} as DebtRecord];
  assert.equal(screenProperties([property('a',{mortgages})],emptyQuery,defaultScenario())[0].scenarioDebt?.id,'new');
});
test('missing source values do not pass numeric/maturity filters or become scenario outputs',()=>{
  const p=property('a');const r=screenProperties([p],emptyQuery,defaultScenario());assert.equal(r[0].scenarioResult,null);
  for(const q of [{minUnits:1},{maturityBefore:'2028-01-01'},{minAmount:1}])assert.equal(screenProperties([p],{...emptyQuery,...q},defaultScenario()).length,0);
});
test('shared facilities count once and retain property coverage',()=>{
  const d=debt('portfolio',{sharedPropertyCount:2});const rows=screenProperties([property('a',{mortgages:[d]}),property('b',{mortgages:[{...d,id:'b:0'}]})],emptyQuery,defaultScenario());
  const summary=summarize(rows,defaultScenario());assert.equal(summary.lenders[0].instrumentGroups,1);assert.equal(summary.lenders[0].properties,2);assert.equal(summary.lenders[0].recordedAmountCents,100000000);assert.equal(summary.coverage.scenarioProperties,0);
});
test('conflicting instrument terms excluded, exact map bounds preserve boundary points',()=>{
  const p=property('a',{mortgages:[debt('bad',{instrumentConflict:true})]});const rows=screenProperties([p,property('unmapped',{longitude:null,latitude:null})],{...emptyQuery,bounds:[-82,26,-81,28]},defaultScenario());
  assert.equal(rows.length,1);assert.equal(summarize(rows,defaultScenario()).lenders.length,0);
});
test('unknowns sort last even descending; stable ties use identity',()=>{
  const rows=screenProperties([property('a'),property('b',{providerUnits:20}),property('c',{providerUnits:30})],{...emptyQuery,sort:'providerUnits',direction:'desc'},defaultScenario());assert.deepEqual(rows.map(r=>r.id),['c','b','a']);
});
test('bad query fields, ranges and geometry fail explicitly',()=>{
  for(const q of [{evil:'x'},{minUnits:-1},{minAmount:100,maxAmount:1},{maturityBefore:'2026-02-30'},{bounds:[0,0,0,0]},{sort:'DROP TABLE'},{area:{}}])assert.throws(()=>validateQuery(q));
});

test('cluster IDs strictly validate and preserve the null and empty selections',()=>{
  assert.throws(()=>validateQuery({ids:Array(1)}));
  for(const ids of ['reapi:a',{},[1],['a'],['reapi:'],['reapi:a.b'],['reapi:'+ 'x'.repeat(81)],['reapi:a','reapi:a'],Array.from({length:501},(_,i)=>`reapi:${i}`)]) assert.throws(()=>validateQuery({ids}));
  assert.equal(validateQuery({}).ids,null);
  assert.deepEqual(validateQuery({ids:[]}).ids,[]);
  const ids=Array.from({length:500},(_,i)=>`reapi:test_${i}-ok`);
  assert.deepEqual(validateQuery(JSON.parse(JSON.stringify({...emptyQuery,ids}))).ids,ids);
});

test('cluster members, rectangle, server order and summaries share the same population after replay',()=>{
  const properties=[property('reapi:a',{mortgages:[debt('a')],providerUnits:30}),property('reapi:b',{mortgages:[debt('b')],providerUnits:20}),property('reapi:c',{mortgages:[debt('c')],longitude:-80})];
  const query=validateQuery(JSON.parse(JSON.stringify({...emptyQuery,ids:['reapi:c','reapi:b','reapi:a'],bounds:[-83,26,-81,28],sort:'providerUnits',direction:'desc'})));
  const rows=screenProperties(properties,query,defaultScenario());
  assert.deepEqual(rows.map(r=>r.id),['reapi:a','reapi:b']);
  const summary=summarize(rows,defaultScenario());
  assert.equal(summary.coverage.mortgageProperties,2);
  assert.equal(summary.coverage.mortgageEntries,2);
  assert.equal(summary.lenders[0].properties,2);
  assert.equal(summary.lenders[0].recordedAmountCents,200000000);
  assert.equal(summary.maturityBuckets.reduce((n,b)=>n+b.entries,0),2);
  assert.equal(screenProperties(properties,{...emptyQuery,ids:[]},defaultScenario()).length,0);
  assert.equal(screenProperties(properties,{...query,ids:['reapi:absent']},defaultScenario()).length,0);
});
