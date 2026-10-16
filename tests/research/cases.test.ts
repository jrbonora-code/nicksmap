import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCaseOrigin, checkStateRequirements, describeTrigger, emptyCaseContent, emptyEvidenceEntry, prepareCaseVersion, validateCaseContent, type CaseContent, type EvidenceEntry } from '../../lib/research/case-model.ts';
import { parseCreateCase, parseVersionInput } from '../../lib/research/case-core.ts';
import { defaultScenario, financingThreshold } from '../../lib/research/finance.ts';
import { emptyQuery } from '../../lib/research/query.ts';
import { WorkspaceValidationError } from '../../lib/workspace/errors.ts';
import { dollarsToCents } from '../../lib/workspace/money.ts';
import type { DebtRecord, ResearchProperty } from '../../lib/research/types.ts';

const scenario = {...defaultScenario(), asOf:'2026-09-14'};
const debt = (id:string, patch:Partial<DebtRecord> = {}):DebtRecord => ({id,sourceId:'s',sequence:0,instrumentKey:'12057:'+id,lender:'Bank A',amountCents:500000000,recordingDate:'2021-05-01',documentDate:null,maturity:'2027-03-01',documentNumber:id,reportedRate:null,sharedPropertyCount:1,instrumentConflict:false,loanType:null,position:'First',...patch});
const property = (patch:Partial<ResearchProperty> = {}):ResearchProperty => ({id:'reapi:fixture',providerId:'fixture',address:'1 Synthetic Way',countyFips:'12057',countyName:'Hillsborough',apn:null,longitude:-82,latitude:27,owner:'SYNTHETIC OWNER LLC',propertyType:'MFR',providerUnits:48,licensedUnits:[48],licenseCount:1,yearBuilt:1998,estimatedValueCents:null,sourceId:'s',retrievedAt:'2026-09-12T00:00:00.000Z',providerDate:'2026-09-01',strictAddress:true,needsReview:false,flags:[],mortgages:[debt('reapi:fixture:0'),debt('reapi:fixture:1',{amountCents:120000000,maturity:null,recordingDate:'2015-02-01'})],tractId:null,oz:'unmapped',rural:null,...patch});
const snapshot = {id:'a'.repeat(64),sourceDate:'2026-09-12T00:00:00.000Z',importedAt:'2026-09-13T00:00:00.000Z'};
const query = {...emptyQuery, debt:'reported' as const, sort:'maturity' as const};
const origin = (debtId:string|null = 'reapi:fixture:0', principalCents:number|null = null) => buildCaseOrigin({snapshot,record:property(),detail:{sources:[],licenses:[]},debtId,principalCents,scenario,query,capturedAt:'2026-09-14T12:00:00.000Z'});
const fields = (fn:()=>unknown) => { try { fn(); } catch (error) { assert.ok(error instanceof WorkspaceValidationError, 'expected a validation error'); return error.fields; } assert.fail('expected a validation error'); };

test('case origins retain ambiguous instruments without deriving recorded thresholds',()=>{
  for(const patch of [{loanType:'Loan Amount Keyed Is An Aggregate Amount'},{loanType:'Only first nine digits entered due to field length limitations'},{instrumentConflict:true}]) {
    const record=property({mortgages:[debt('bad',patch)]});
    const input={snapshot,record,detail:null,debtId:'bad',principalCents:null,scenario,query,capturedAt:'2026-09-15T12:00:00Z'};
    const captured=buildCaseOrigin(input);
    assert.equal(captured.principalCents,null); assert.equal(captured.threshold,null); assert.equal(captured.debt?.id,'bad');
    const target=buildCaseOrigin({...input,principalCents:123000000});
    assert.equal(target.amountBasis,'analyst_target'); assert.equal(target.principalCents,123000000);
  }
});
const entry = (id:string, claims:EvidenceEntry['claims'], patch:Partial<EvidenceEntry> = {}):EvidenceEntry => ({...emptyEvidenceEntry(id,'2026-09-10'), claims, locator:'Loan statement, page 1', effectiveDate:'2026-08-31', scope:'Recorded instrument reapi:fixture:0 on the whole property', observation:'Balance and maturity confirmed by the servicer statement.', reviewer:'Analyst', ...patch});

function documented():CaseContent {
  return {...emptyCaseContent('Synthetic documented case'), lane:'financing_transition', hypothesis:'Borrower faces a takeout decision.', need:'Owner needs an options comparison.', supportingEvidence:'Recorded maturity plus permissioned statement dated 2026-08-31.', contraryEvidence:'Lender may extend.', rejectionTest:'A normal takeout is already committed.', deadlineBasis:'confirmed_statement', collateralScope:'reconciled', operatingEvidence:'permissioned_current', payerType:'owner', operatorRole:'assess', nextAction:'Prepare the options memo.',
    evidence:[entry('e1',['deadline_basis']), entry('e2',['collateral_scope'],{locator:'Recorded deed and survey',evidenceClass:'public_record'}), entry('e3',['operating_evidence'],{locator:'T12 and rent roll',effectiveDate:null,effectivePeriod:'T12 to 2026-06-30'})],
    alternatives:[{kind:'ordinary_refinance',label:'',status:'compared',note:'',scenario,result:null},{kind:'restructuring',label:'',status:'compared',note:'',scenario:null,result:null}]};
}
function executable():CaseContent {
  return {...documented(), feeStatus:'proposed', revenueMechanism:'Fixed-scope assessment fee.', proposedFeeCents:2500000, cashRequiredCents:0, guaranteeExposureCents:0, lenderProgramReview:'Agency near-stabilization terms reviewed 2026-09-10.', decisionAuthority:'identified', payerRelationship:'verified',
    evidence:[...documented().evidence, entry('e4',['lender_program_review'],{locator:'Agency term sheet',evidenceClass:'public_record'}), entry('e5',['decision_authority','payer_relationship'],{locator:'Operating agreement excerpt',evidenceClass:'owner_statement'})]};
}

test('origin copies the record, resolves the debt basis, keeps the query and computes threshold-1 once',()=>{
  const o = origin();
  assert.equal(o.debt?.id,'reapi:fixture:0'); assert.equal(o.principalCents,500000000); assert.equal(o.amountBasis,'original_recorded_amount');
  assert.deepEqual(o.threshold,financingThreshold(500000000,scenario)); assert.equal(o.trigger.kind,'recorded_maturity'); assert.equal(o.trigger.reportedMaturity,'2027-03-01');
  assert.deepEqual(o.query,query); assert.match(o.trigger.note,/does not establish/);
  const target = origin('reapi:fixture:0',400000000); assert.equal(target.amountBasis,'analyst_target'); assert.equal(target.threshold?.principalCents,400000000);
  assert.equal(origin('reapi:fixture:0',500000000).amountBasis,'analyst_target','an entered amount stays an analyst target even when it equals the recorded amount');
  const none = origin(null); assert.equal(none.principalCents,null); assert.equal(none.threshold,null); assert.equal(none.trigger.kind,'property_record');
  const undated = origin('reapi:fixture:1'); assert.equal(undated.trigger.kind,'recorded_instrument'); assert.equal(undated.principalCents,120000000);
  assert.ok(fields(()=>origin('reapi:missing')).debtId);
  assert.ok(fields(()=>origin('reapi:fixture:0',0)).principalCents);
  assert.throws(()=>buildCaseOrigin({snapshot,record:property(),detail:null,debtId:null,principalCents:null,scenario,query:{...query,evil:1} as never,capturedAt:'2026-09-14T12:00:00.000Z'}));
  const record = property(); const captured = buildCaseOrigin({snapshot,record,detail:null,debtId:null,principalCents:null,scenario,query:null,capturedAt:'2026-09-14T12:00:00.000Z'});
  record.address = 'changed later'; record.mortgages[0].amountCents = 1;
  assert.equal(captured.property.address,'1 Synthetic Way'); assert.equal(captured.property.mortgages[0].amountCents,500000000); assert.equal(captured.query,null);
  assert.match(describeTrigger(o),/reported maturity 2027-03-01/); assert.doesNotMatch(describeTrigger(o),/distress|default/i);
});

test('content validation rejects unknown fields, bad amounts, duplicate inputs, malformed evidence and tampered results',()=>{
  const o = origin();
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),evil:1},o)).evil);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent(''),},o)).label);
  for (const bad of [-1,1.5,'100',Number.MAX_SAFE_INTEGER+1]) assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),agreedFeeCents:bad},o)).agreedFeeCents, String(bad));
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),missingInputs:['current_payoff','current_payoff']},o)).missingInputs);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),missingInputs:['guess']},o)).missingInputs);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),nextActionDue:'2026-02-30'},o)).nextActionDue);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),alternatives:[{kind:'ordinary_refinance'},{kind:'ordinary_refinance'}]},o))['alternatives.1.kind']);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),alternatives:[{kind:'other'}]},o))['alternatives.0.label']);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),alternatives:[{kind:'sale',status:'preferred'},{kind:'no_action',status:'preferred'}]},o)).alternatives);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),alternatives:[{kind:'sale',scenario:{...scenario,annualRate:9}}]},o))['alternatives.0.scenario']);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),alternatives:[{kind:'ordinary_refinance',scenario}]},origin(null)))['alternatives.0.scenario']);
  const tampered = validateCaseContent({...emptyCaseContent('x'),alternatives:[{kind:'ordinary_refinance',scenario,result:{requiredNoiCents:1}}]},o);
  assert.deepEqual(tampered.alternatives[0].result,financingThreshold(500000000,scenario));
  const e = fields(()=>validateCaseContent({...emptyCaseContent('x'),evidence:[{...entry('bad id',['deadline_basis']),extra:1},{...entry('e1',[])},{...entry('e1',['nope' as never])},{...entry('e2',['outcome'],{effectiveDate:null,effectivePeriod:''})},{...entry('e3',['outcome'],{obtainedDate:'2026-13-01'})},{...entry('e4',['outcome'],{locator:''})}]},o));
  for (const key of ['evidence.0.id','evidence.0.extra','evidence.1.claims','evidence.2.claims','evidence.3.effectivePeriod','evidence.4.obtainedDate','evidence.5.locator']) assert.ok(e[key],key);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),evidence:[entry('dup',['outcome']),entry('dup',['agreement'])]},o))['evidence.1.id']);
  assert.ok(fields(()=>validateCaseContent({...emptyCaseContent('x'),evidence:Array.from({length:51},(_,i)=>entry('e'+i,['outcome']))},o)).evidence);
  const kept = validateCaseContent({...emptyCaseContent('  Trimmed  '),missingInputs:['rent_roll','current_payoff'],evidence:[entry('e1',['operating_evidence','deadline_basis'])],alternatives:[{kind:'no_action',status:'compared',note:'Baseline'}]},o);
  assert.equal(kept.label,'Trimmed'); assert.deepEqual(kept.missingInputs,['current_payoff','rent_roll']); assert.deepEqual(kept.evidence[0].claims,['deadline_basis','operating_evidence']); assert.equal(kept.alternatives[0].result,null);
  assert.deepEqual(validateCaseContent({label:'Old version without newer fields'},o).evidence,[],'older content without the register validates with an empty register');
});

test('asserted claims need supporting evidence entries in every state',()=>{
  const base:CaseContent = {...emptyCaseContent('Claims'), evidence:[]};
  const missing = checkStateRequirements('observed_lead',{...base,deadlineBasis:'confirmed_statement',collateralScope:'conflict',operatingEvidence:'permissioned_current',payerRelationship:'verified',decisionAuthority:'identified',lenderProgramReview:'Reviewed.'});
  for (const key of ['deadlineBasis','collateralScope','operatingEvidence','payerRelationship','decisionAuthority','lenderProgramReview']) assert.ok(missing[key],key);
  const contradicting = checkStateRequirements('observed_lead',{...base,deadlineBasis:'confirmed_statement',evidence:[entry('e1',['deadline_basis'],{relation:'contradicts'})]});
  assert.ok(contradicting.deadlineBasis,'a contradicting entry does not support the claim');
  assert.deepEqual(checkStateRequirements('observed_lead',{...base,deadlineBasis:'confirmed_statement',collateralScope:'conflict',evidence:[entry('e1',['deadline_basis','collateral_scope'])]}),{});
  assert.ok(checkStateRequirements('documented_case',{...documented(),collectedCents:100}).collectedCents,'collected amounts need a documented-outcome entry');
});

test('state gates: leads and hypotheses carry no amounts; documented cases need evidence, not a fee; executable needs review and exposure',()=>{
  const lead = emptyCaseContent('Lead');
  assert.deepEqual(checkStateRequirements('observed_lead',lead),{});
  for (const key of ['proposedFeeCents','collectedCents','realizedCostCents','agreedFeeCents','billedCents'] as const) assert.ok(checkStateRequirements('observed_lead',{...lead,[key]:100})[key],key);
  assert.ok(checkStateRequirements('observed_lead',{...lead,feeStatus:'proposed'}).feeStatus);
  assert.ok(checkStateRequirements('observed_lead',{...lead,alternatives:[{kind:'sale',label:'',status:'preferred',note:'',scenario:null,result:null}]}).alternatives);
  const h = checkStateRequirements('hypothesis',lead);
  for (const key of ['hypothesis','need','supportingEvidence','contraryEvidence','rejectionTest','payerType','operatorRole','lane','nextAction']) assert.ok(h[key],key);
  const hypothesis:CaseContent = {...documented(),deadlineBasis:'recorded_maturity_only',collateralScope:'unverified',operatingEvidence:'none',evidence:[],alternatives:[]};
  assert.deepEqual(checkStateRequirements('hypothesis',hypothesis),{});
  assert.ok(checkStateRequirements('hypothesis',{...hypothesis,cashRequiredCents:0}).cashRequiredCents);
  assert.ok(checkStateRequirements('hypothesis',{...hypothesis,feeStatus:'agreed'}).feeStatus);
  const d = checkStateRequirements('documented_case',hypothesis);
  for (const key of ['deadlineBasis','collateralScope','operatingEvidence','alternatives']) assert.ok(d[key],key);
  assert.equal(d.feeStatus,undefined,'unknown fee terms are permitted in a documented case');
  assert.deepEqual(checkStateRequirements('documented_case',documented()),{});
  assert.deepEqual(checkStateRequirements('documented_case',{...documented(),feeStatus:'none_proposed'}),{},'ordinary refinancing with nothing to sell is a documented case');
  assert.ok(checkStateRequirements('documented_case',{...documented(),feeStatus:'proposed'}).revenueMechanism,'a proposed fee needs its basis');
  assert.ok(checkStateRequirements('documented_case',{...documented(),collateralScope:'conflict',evidence:documented().evidence.filter(e=>!e.claims.includes('collateral_scope'))}).collateralScope,'a recorded conflict needs an entry describing it');
  assert.ok(checkStateRequirements('documented_case',{...documented(),alternatives:[{kind:'sale',label:'',status:'compared',note:'',scenario:null,result:null}]}).alternatives);
  assert.ok(checkStateRequirements('documented_case',{...documented(),feeStatus:'agreed',agreedFeeCents:1,evidence:[...documented().evidence,entry('a',['agreement'])]}).feeStatus,'agreed fees belong to the agreed state');
  const e = checkStateRequirements('executable_proposal',{...documented(),feeStatus:'none_proposed'});
  for (const key of ['lenderProgramReview','decisionAuthority','payerRelationship','cashRequiredCents','guaranteeExposureCents']) assert.ok(e[key],key);
  assert.equal(e.proposedFeeCents,undefined,'no proposed fee is required when none is proposed');
  assert.ok(checkStateRequirements('executable_proposal',{...documented(),cashRequiredCents:0,guaranteeExposureCents:0}).feeStatus,'executable needs a fee position');
  assert.ok(checkStateRequirements('executable_proposal',{...executable(),evidence:documented().evidence}).payerRelationship,'verified payer relationship needs its entry');
  assert.ok(checkStateRequirements('executable_proposal',{...executable(),investorCapitalCents:100000000}).capitalProvider);
  assert.deepEqual(checkStateRequirements('executable_proposal',executable()),{});
  assert.deepEqual(checkStateRequirements('executable_proposal',{...executable(),feeStatus:'none_proposed',proposedFeeCents:null}),{});
});

test('agreed, outcome, rejected and deferred states',()=>{
  const agreedContent:CaseContent = {...executable(), feeStatus:'agreed', agreementNote:'Engagement letter executed 2026-10-01.', evidence:[...executable().evidence, entry('a1',['agreement'],{locator:'Engagement letter',evidenceClass:'permissioned_document'})]};
  const a = checkStateRequirements('agreed',{...executable()});
  assert.ok(a.feeStatus); assert.ok(a.agreementNote);
  assert.ok(checkStateRequirements('agreed',agreedContent).agreedFeeCents,'agreed needs an amount or documented contingent terms');
  assert.deepEqual(checkStateRequirements('agreed',{...agreedContent,agreedFeeCents:2500000}),{});
  assert.deepEqual(checkStateRequirements('agreed',{...agreedContent,agreedTermsNote:'1% of takeout proceeds at closing.'}),{});
  assert.ok(checkStateRequirements('agreed',{...agreedContent,agreedFeeCents:2500000,evidence:executable().evidence}).feeStatus,'agreed fees need the executed agreement as evidence');
  const outcome:CaseContent = {...emptyCaseContent('Normal refinance observed'), outcomeNote:'The owner refinanced with a bank in November; no engagement.', feeStatus:'none_proposed', evidence:[entry('o1',['outcome'],{locator:'Recorded satisfaction and new mortgage',evidenceClass:'public_record'})]};
  assert.deepEqual(checkStateRequirements('outcome_recorded',outcome),{},'an outcome needs no hypothesis, payer or fee');
  assert.ok(checkStateRequirements('outcome_recorded',{...outcome,evidence:[]}).evidence);
  assert.ok(checkStateRequirements('outcome_recorded',{...outcome,outcomeNote:''}).outcomeNote);
  assert.deepEqual(checkStateRequirements('outcome_recorded',{...outcome,collectedCents:0,realizedCostCents:120000}),{},'collected and realized amounts are allowed with outcome evidence');
  const rejected:CaseContent = {...agreedContent,agreedFeeCents:2500000,rejectionReason:'Owner withdrew after the agreement.'};
  assert.deepEqual(checkStateRequirements('rejected',rejected),{},'established terms survive a later rejection');
  assert.ok(checkStateRequirements('rejected',emptyCaseContent('x')).rejectionReason);
  assert.ok(checkStateRequirements('deferred',{...emptyCaseContent('x'),rejectionReason:'Waiting on statement.'}).reconsiderConditions);
  assert.deepEqual(checkStateRequirements('deferred',{...emptyCaseContent('x'),rejectionReason:'Waiting on statement.',reconsiderConditions:'Statement received.'}),{});
});

test('prepareCaseVersion combines validation and gates and reports the blocking state',()=>{
  assert.throws(()=>prepareCaseVersion('qualified_deal',emptyCaseContent('x'),origin()),/supported case state/);
  assert.throws(()=>prepareCaseVersion('documented_case',emptyCaseContent('x'),origin()),/Documented case/);
  const prepared = prepareCaseVersion('documented_case',documented(),origin());
  assert.equal(prepared.modelVersion,'strategy-case-2'); assert.equal(prepared.lane,'financing_transition');
  assert.deepEqual(prepared.content.alternatives[0].result,financingThreshold(500000000,scenario)); assert.equal(prepared.content.alternatives[1].result,null);
});

test('request parsing fails closed on identifiers, scenario, query and unknown keys',()=>{
  const good = {requestId:'00000000-0000-4000-8000-000000000001',snapshotId:'b'.repeat(64),propertyId:'reapi:fixture',debtId:null,principalCents:null,scenario,query,state:'observed_lead',content:{},reason:'Opened from research.'};
  assert.deepEqual(parseCreateCase(good).query,query);
  assert.ok(fields(()=>parseCreateCase({...good,requestId:'nope'})).requestId);
  assert.ok(fields(()=>parseCreateCase({...good,snapshotId:'short'})).snapshotId);
  assert.ok(fields(()=>parseCreateCase({...good,propertyId:'../etc'})).propertyId);
  assert.ok(fields(()=>parseCreateCase({...good,scenario:{}})).scenario);
  assert.ok(fields(()=>parseCreateCase({...good,query:undefined})).query,'the research filters are required at creation');
  assert.ok(fields(()=>parseCreateCase({...good,query:{...query,sort:'DROP TABLE'}})).query);
  assert.ok(fields(()=>parseCreateCase({...good,principalCents:12.5})).principalCents);
  assert.ok(fields(()=>parseCreateCase({...good,extra:true})).extra);
  assert.ok(fields(()=>parseCreateCase({...good,reason:''})).reason);
  assert.equal(parseVersionInput({requestId:good.requestId,expectedVersion:2,state:'hypothesis',content:{},reason:'r'}).expectedVersion,2);
  assert.ok(fields(()=>parseVersionInput({requestId:good.requestId,expectedVersion:'2',state:'hypothesis',content:{},reason:'r'})).expectedVersion);
  assert.ok(fields(()=>parseVersionInput({requestId:good.requestId,expectedVersion:0,state:'hypothesis',content:{},reason:'r'})).expectedVersion);
});

test('annual reserves convert through exact decimal parsing, not float division',()=>{
  assert.equal(Number.isSafeInteger(Number('1234.56')/0.01),false,'the former conversion produced fractional cents');
  assert.equal(dollarsToCents('1234.56'),123456);
  assert.equal(dollarsToCents('0'),0);
  assert.throws(()=>dollarsToCents('1234.567'));
});
