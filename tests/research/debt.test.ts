import type { DebtRecord, ResearchProperty } from '../../lib/research/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loanMetadata, mortgageHistory, providerFields, markPossibleDuplicates } from '../../lib/research/provider.ts';
import { debtAmountWarnings } from '../../lib/research/debt.ts';
import { scenarioBase, defaultScenario } from '../../lib/research/finance.ts';
import { emptyQuery, screenProperties, summarize, validateQuery } from '../../lib/research/query.ts';
import { prepareSelection } from '../../lib/research/selection.ts';
import { fixture } from './import.test.ts';

test('metadata and history retain exact fields, status source and unknowns without guessing',()=>{
  const history=[{mortgageId:'m1',open:false},{mortgageId:'m2',open:true}];
  const m=loanMetadata({mortgageId:'m2',loanType:'Commercial',position:'First',lenderCode:'0012',lenderType:'Bank',assumable:false},history);
  assert.equal(m.providerOpen,true);assert.equal(m.openSourcePath,'mortgageHistory[1].open');assert.equal(m.lenderCode,'0012');assert.equal(m.assumable,false);
  assert.equal(loanMetadata({mortgageId:'absent'},history).providerOpen,null);
  assert.equal(loanMetadata({mortgageId:'m2'},[...history,{mortgageId:'m2',open:false}]).providerOpen,null);
  const records=mortgageHistory({mortgageHistory:[{mortgageId:'m1',open:false,amount:125.25,loanType:'Commercial',recordingDate:'2020-01-01'},{}]},'fixture','s');
  assert.equal(records[0].amountCents,12525);assert.equal(records[0].providerOpen,false);assert.equal(records[0].sourceId,'s');assert.equal(records[1].amountCents,null);
  const fields=providerFields({taxInfo:{taxAmount:0,year:2025},MFH5plus:false},'s');
  assert.equal(fields.find(f=>f.path==='taxInfo.taxAmount')?.value,'0');assert.equal(fields.find(f=>f.path==='MFH5plus')?.value,'false');
  assert.equal(fields.find(f=>f.path==='taxInfo.assessedValue')?.value,null);assert.ok(fields.every(f=>f.sourceId==='s'&&f.group));
});

test('legacy snapshots and closed flags fail closed; null loan type remains an explicit provider unknown',()=>{
  const d=fixture().records[0].record.mortgages[0];
  assert.ok(scenarioBase([d]));
  for(const patch of [{loanType:undefined},{providerOpen:false},{loanType:'Undefined / Multiple Loan Amounts'},{loanType:'Only first nine digits entered due to field length limitations'}]) {
    const bad={...d,...patch};assert.equal(scenarioBase([bad]),null);assert.ok(debtAmountWarnings(bad).length);
  }
  assert.equal(scenarioBase([{...d,id:'b',recordingDate:'2025-01-01'}, {...d,id:'a',recordingDate:'2025-01-01'}])?.id,'a');
  assert.equal(scenarioBase([{...d,id:'junior',position:'Second',recordingDate:'2026-01-01'},d])?.id,d.id);
});

test('possible duplicate facilities stay separate observations and leave totals pending reconciliation',()=>{
  const base={...fixture().records[0].record.mortgages[0],lenderCode:'0012'};
  const debts:(DebtRecord&{propertyId:string})[]=[{...base,propertyId:'a'},{...base,propertyId:'b',id:'b',instrumentKey:'12057:SYN-2'}];
  markPossibleDuplicates(debts);assert.ok(debts.every(d=>d.possibleDuplicate));assert.ok(debts.every(d=>d.sharedPropertyCount===1));
  const p=fixture().records[0].record as ResearchProperty;
  const rows=screenProperties(debts.map(d=>({...p,id:d.propertyId,mortgages:[d]})),emptyQuery,defaultScenario());
  assert.equal(summarize(rows,defaultScenario()).lenders.length,0);
});

test('before scenario date uses the same debt as other predicates, excludes equality and replays',()=>{
  const p=fixture().records[0].record as ResearchProperty,d=p.mortgages[0],scenario={...defaultScenario(),asOf:'2026-09-15'};
  p.mortgages=[{...d,lender:'Bank A',maturity:'2026-09-15'},{...d,id:'b',lender:'Bank B',maturity:'2026-09-14'}];
  const q=validateQuery(JSON.parse(JSON.stringify({...emptyQuery,beforeScenarioDate:true})));
  assert.equal(screenProperties([p],q,scenario).length,1);
  assert.equal(screenProperties([p],{...q,lender:'Bank A'},scenario).length,0);
  assert.equal(screenProperties([p],q,{...scenario,asOf:'2026-09-14'}).length,0);
  assert.throws(()=>validateQuery({beforeScenarioDate:'true'}));assert.equal(validateQuery({}).beforeScenarioDate,false);
});

test('saved selection rejects unsafe recorded amounts and preserves explicit target provenance on equality',()=>{
  const p=fixture().records[0].record as ResearchProperty,d=p.mortgages[0],s=defaultScenario();
  const selected={debtId:d.id,principalCents:d.amountCents!};
  assert.equal(prepareSelection(p,selected,s).amountBasis,'original_recorded_amount');
  d.loanType='Loan Amount Keyed Is An Aggregate Amount';
  assert.throws(()=>prepareSelection(p,selected,s));
  const target=prepareSelection(p,{...selected,amountBasis:'analyst_target'},s);
  assert.equal(target.amountBasis,'analyst_target');assert.ok(target.warnings.length);
  assert.throws(()=>prepareSelection(p,{...selected,amountBasis:'invented'},s));
});
