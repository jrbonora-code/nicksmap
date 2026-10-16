import test from 'node:test';
import assert from 'node:assert/strict';
import { financingThreshold,defaultScenario,validateScenario,scenarioBase } from '../../lib/research/finance.ts';
import type { DebtRecord } from '../../lib/research/types.ts';
test('zero-rate independent hand case: 1m / 120 months, 60-month balloon, after-reserve DSCR',()=>{
  const s={...defaultScenario(),annualRate:0,amortizationMonths:120,termMonths:60,annualReserveCents:1000000,minDscr:1.25,minDebtYield:.08,maxLtv:.5};
  const r=financingThreshold(100000000,s);
  assert.ok(Math.abs(r.annualDebtServiceCents-10000000)<.00001);
  assert.ok(Math.abs(r.requiredNoiCents-13500000)<.00001);
  assert.equal(r.requiredValueCents,200000000);
  assert.ok(Math.abs(r.balloonCents-50000000)<.00001);
  assert.equal(r.actualNoi,null);assert.equal(r.actualPayoff,null);assert.equal(r.actualFundingGap,null);
});
test('interest-only exact case and binding debt yield',()=>{
  const r=financingThreshold(100000000,{...defaultScenario(),interestOnly:true,annualRate:.06,minDebtYield:.09});
  assert.equal(r.annualDebtServiceCents,6000000);assert.equal(r.balloonCents,100000000);
  assert.equal(r.requiredNoiCents,9000000);assert.equal(r.bindingIncomeConstraint,'Debt yield');
});
test('published Microsoft PMT example remains consistent when embedded in threshold model',()=>{
  const r=financingThreshold(1000000,{...defaultScenario(),annualRate:.08,amortizationMonths:10,termMonths:10});
  // Microsoft PMT: 10,000 USD, 8% annual rate, 10 monthly payments => 1,037.03 USD.
  assert.ok(Math.abs(r.monthlyDebtServiceCents-103703)<.5);assert.equal(r.balloonCents,0);
});
test('income threshold respects reserve and lending constraints; stricter assumptions never improve it',()=>{
  const s=defaultScenario();const r=financingThreshold(235000000,s);
  assert.ok(financingThreshold(235000000,{...s,annualRate:.08}).requiredNoiCents>=r.requiredNoiCents);
  assert.ok(financingThreshold(235000000,{...s,minDscr:1.5}).requiredNoiCents>=r.requiredNoiCents);
  assert.ok(financingThreshold(235000000,{...s,annualReserveCents:5000000}).requiredNoiCents>=r.requiredNoiCents);
  assert.ok(financingThreshold(235000000,{...s,maxLtv:.5}).requiredValueCents>=r.requiredValueCents);
});
test('missing, unsafe, malformed and out-of-convention inputs are blocked',()=>{
  for(const value of [null,undefined,0,-1,NaN,Infinity,1.5,1e12+1,'10000'])assert.throws(()=>financingThreshold(value as number,defaultScenario()));
  for(const patch of [{annualRate:null},{annualRate:-.01},{annualReserveCents:-1},{minDscr:0},{maxLtv:0},{minDebtYield:0},{termMonths:361},{asOf:'2026-02-30'},{annualRate:'0.06'},{extra:true}])assert.throws(()=>validateScenario({...defaultScenario(),...patch}));
});
test('zero-rate interest-only uses debt-yield income threshold, not fabricated zero NOI',()=>{
  const r=financingThreshold(100000000,{...defaultScenario(),annualRate:0,interestOnly:true});
  assert.equal(r.annualDebtServiceCents,0);assert.equal(r.requiredNoiCents,8000000);assert.equal(r.actualFundingGap,null);
});
test('shared collateral and conflicting terms are excluded from default property scenario',()=>{
  const a={id:'a',amountCents:10000000,sharedPropertyCount:1,instrumentConflict:false,loanType:null} as DebtRecord;
  assert.equal(scenarioBase([a,{...a,id:'b',amountCents:20000000,sharedPropertyCount:2}])?.id,'a');
  assert.equal(scenarioBase([{...a,instrumentConflict:true}]),null);assert.equal(scenarioBase([]),null);
  assert.equal(scenarioBase([{...a,sharedPropertyCount:2}]),null);
});
