import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareSnapshot,prepareResearchDecision } from "../../lib/workspace/snapshot.ts";
import { parseResearchDecisionForm } from "../../lib/workspace/validation.ts";
import type { Deal,Evidence } from "../../lib/workspace/types.ts";

const deal: Deal = {id:"00000000-0000-4000-8000-000000000001",name:"Synthetic reference",address:"",countyFips:"12071",countyName:"Lee",strategy:"acquisition",stage:"research",unitCount:10,latitude:null,longitude:null,askingPriceCents:100000000,notes:"",nextAction:"",nextActionDue:null,createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",createdBy:"synthetic-user"};
const evidence: Evidence = {id:"00000000-0000-4000-8000-000000000002",dealId:deal.id,title:"Synthetic annual reference",sourceUrl:null,sourceType:"estimate",effectiveDate:"2026-01-01",retrievedAt:"2026-01-02T00:00:00Z",notes:"Assumed whole-year dollars; synthetic test only.",reviewStatus:"reviewed"};
const input = {requestId:"00000000-0000-4000-8000-000000000003",dealId:deal.id,label:"Reference",inputs:{currency:"USD",period:"annual",unitCount:10,grossPotentialRentCents:12000000,vacancyLossCents:600000,concessionsCents:200000,creditLossCents:100000,otherIncomeCents:300000,operatingExpensesCents:4000000,replacementReservesCents:300000,annualDebtServiceCents:5000000,loanBalanceCents:60000000,purchasePriceCents:100000000,totalCostCents:110000000},evidenceIds:[evidence.id],decision:"advance" as const,reason:"Human judgment for further research only"};
const mandate = {status:"draft" as const,notes:"Not reviewed",updatedAt:null};

test("saved screening rederives independent annual cash flow and preserves source content and warnings", () => {
  const snapshot = prepareSnapshot(input,deal,[evidence],mandate);
  assert.equal(snapshot.result.ok,true);
  assert.equal(snapshot.result.value!.effectiveGrossIncomeCents,11400000);
  assert.equal(snapshot.result.value!.noiCents,7400000);
  assert.equal(snapshot.result.value!.cashFlowAfterReservesCents,7100000);
  assert.equal(snapshot.result.value!.cashFlowAfterDebtServiceCents,2100000);
  assert.equal(snapshot.result.value!.dscrAfterReserves,1.42);
  const loss = prepareSnapshot({...input,inputs:{...input.inputs,operatingExpensesCents:10000000}},deal,[evidence],mandate);
  assert.equal(loss.result.value!.cashFlowAfterDebtServiceCents,-3900000);
  assert.ok(loss.result.issues.some(issue=>issue.code==="NEGATIVE_CASH_FLOW"));
  assert.equal(snapshot.mandateSnapshot.status,"draft");
  assert.deepEqual(snapshot.evidenceSnapshots,[evidence]);
});
test("snapshot keeps its inputs, source metadata and property context after later corrections", () => {
  const original = structuredClone({input,deal,evidence,mandate});
  const snapshot = prepareSnapshot(original.input,original.deal,[original.evidence],original.mandate);
  original.input.inputs.grossPotentialRentCents=1;
  original.deal.name="Changed name";
  original.evidence.notes="Replaced evidence";
  original.mandate.notes="Changed policy";
  assert.equal(snapshot.inputs.grossPotentialRentCents,12000000);
  assert.equal(snapshot.dealSnapshot.name,deal.name);
  assert.equal(snapshot.evidenceSnapshots[0].notes,evidence.notes);
  assert.equal(snapshot.mandateSnapshot.notes,mandate.notes);
});
test("foreign, missing, duplicate and unresolved evidence cannot support an advance snapshot", () => {
  assert.throws(()=>prepareSnapshot(input,deal,[],mandate));
  assert.throws(()=>prepareSnapshot(input,deal,[{...evidence,dealId:"different-deal"}],mandate));
  assert.throws(()=>prepareSnapshot({...input,evidenceIds:[evidence.id,evidence.id]},deal,[evidence,evidence],mandate));
  assert.throws(()=>prepareSnapshot(input,deal,[{...evidence,reviewStatus:"conflict"}],mandate));
  assert.throws(()=>prepareSnapshot(input,deal,[{...evidence,reviewStatus:"unreviewed"}],mandate));
  assert.equal(prepareSnapshot({...input,decision:"pass"},deal,[{...evidence,reviewStatus:"conflict"}],mandate).decision,"pass");
});
test("browser-injected output cannot replace deterministic calculations, and malformed inputs fail closed", () => {
  const tampered = {...input,result:{ok:true,value:{noiCents:999999999}}};
  assert.equal(prepareSnapshot(tampered,deal,[evidence],mandate).result.value!.noiCents,7400000);
  assert.throws(()=>prepareSnapshot({...input,inputs:{...input.inputs,grossPotentialRentCents:null}},deal,[evidence],mandate));
});

test("qualitative declines need reasons and evidence while financial inputs remain absent",()=>{
  const data=new FormData();
  for(const [key,value] of Object.entries({requestId:input.requestId,dealId:deal.id,label:"Fatal site constraint",decision:"pass",reason:"The site cannot support the intended strategy."})) data.set(key,value);
  data.set("evidenceIds",evidence.id);
  const parsed=parseResearchDecisionForm(data);
  const snapshot=prepareResearchDecision(parsed,deal,[{...evidence,reviewStatus:"conflict"}],mandate);
  assert.deepEqual(snapshot.inputs,{});
  assert.equal(snapshot.result.availability,"not_calculated");
  assert.equal(snapshot.modelVersion,"research-decision-1.0.0");
  assert.equal("value" in snapshot.result,false);
  data.set("decision","advance"); assert.throws(()=>parseResearchDecisionForm(data));
  data.set("decision","pass"); data.delete("reason"); assert.throws(()=>parseResearchDecisionForm(data));
});
