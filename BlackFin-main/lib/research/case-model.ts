import { usableRecordedAmount } from './debt.ts';
import { financingThreshold, isDate, ResearchValidationError, validateScenario } from './finance.ts';
import { validateQuery } from './query.ts';
import { WorkspaceValidationError } from '../workspace/errors.ts';
import type { DebtRecord, LicenseLink, ResearchProperty, PropertyDetail, ResearchQuery, ResearchSource, Scenario, ThresholdResult } from './types.ts';

/** Content contract version for saved case versions. Threshold arithmetic inside alternatives stays `threshold-1`. */
export const CASE_MODEL_VERSION = 'strategy-case-2' as const;

export const CASE_STATES = ['observed_lead','hypothesis','documented_case','executable_proposal','agreed','outcome_recorded','rejected','deferred'] as const;
export const CASE_LANES = ['undetermined','financing_transition','completion_leaseup','recapitalization','affordability_structure','institutional_housing','lender_services','loan_property_purchase'] as const;
export const PAYER_TYPES = ['unknown','owner','lender','investor','institution','employer','public_program','other'] as const;
export const OPERATOR_ROLES = ['undetermined','assess','arrange','develop_for_fee','oversee','partner','lend','acquire'] as const;
export const DEADLINE_BASES = ['unknown','recorded_maturity_only','confirmed_statement','modified_or_extended','no_current_deadline'] as const;
export const COLLATERAL_SCOPES = ['unverified','reconciled','conflict'] as const;
export const OPERATING_EVIDENCE = ['none','partial','permissioned_current'] as const;
export const RELATIONSHIP_STATES = ['unverified','verified'] as const;
export const AUTHORITY_STATES = ['unknown','identified','verified'] as const;
export const FEE_STATES = ['unknown','none_proposed','proposed','agreed'] as const;
export const MISSING_INPUTS = ['current_payoff','loan_statement','modification_or_extension','collateral_scope','rent_roll','t12_noi','occupancy','remaining_capex','owner_intent','payer_willingness','decision_authority','lender_terms','program_eligibility','insurance_tax_quotes'] as const;
export const ALTERNATIVE_KINDS = ['ordinary_refinance','early_takeout','restructuring','sale','no_action','other'] as const;
export const ALTERNATIVE_STATES = ['not_compared','compared','rejected','preferred'] as const;
export const EVIDENCE_CLAIMS = ['deadline_basis','collateral_scope','operating_evidence','payer_relationship','decision_authority','lender_program_review','agreement','outcome'] as const;
export const EVIDENCE_CLASSES = ['public_record','permissioned_document','owner_statement','lender_statement','analyst_assumption','other'] as const;
export const EVIDENCE_RELATIONS = ['supports','contradicts'] as const;

export type CaseState = typeof CASE_STATES[number];
export type CaseLane = typeof CASE_LANES[number];
export type MissingInput = typeof MISSING_INPUTS[number];
export type AlternativeKind = typeof ALTERNATIVE_KINDS[number];
export type EvidenceClaim = typeof EVIDENCE_CLAIMS[number];
export type Alternative = { kind:AlternativeKind; label:string; status:typeof ALTERNATIVE_STATES[number]; note:string; scenario:Scenario|null; result:ThresholdResult|null };
/** One dated, scoped evidence entry inside a case version. It records where a claim comes from; it does not prove the source true. */
export type EvidenceEntry = { id:string; claims:EvidenceClaim[]; relation:typeof EVIDENCE_RELATIONS[number]; evidenceClass:typeof EVIDENCE_CLASSES[number]; locator:string; effectiveDate:string|null; effectivePeriod:string; obtainedDate:string; scope:string; observation:string; limitations:string; reviewer:string; reviewedAt:string };

export const CASE_STATE_LABELS:Record<CaseState,string> = { observed_lead:'Observed lead', hypothesis:'Hypothesis', documented_case:'Documented case', executable_proposal:'Executable proposal', agreed:'Agreed', outcome_recorded:'Outcome recorded', rejected:'Rejected', deferred:'Deferred' };
export const CASE_LANE_LABELS:Record<CaseLane,string> = { undetermined:'Lane undetermined', financing_transition:'Financing transition / paid assessment', completion_leaseup:'Completion and lease-up execution', recapitalization:'Recapitalization / replacement sponsor', affordability_structure:'Affordability and financing structure', institutional_housing:'Institutional or employer housing', lender_services:'Lender services / outside investor execution', loan_property_purchase:'Loan or property purchase' };
export const PAYER_LABELS:Record<typeof PAYER_TYPES[number],string> = { unknown:'Unknown', owner:'Owner / borrower', lender:'Lender / servicer', investor:'Investor / capital partner', institution:'Institution', employer:'Employer', public_program:'Public program', other:'Other' };
export const ROLE_LABELS:Record<typeof OPERATOR_ROLES[number],string> = { undetermined:'Undetermined', assess:'Assess', arrange:'Arrange', develop_for_fee:'Develop for a fee', oversee:'Oversee', partner:'Partner', lend:'Lend', acquire:'Acquire' };
export const DEADLINE_LABELS:Record<typeof DEADLINE_BASES[number],string> = { unknown:'Unknown', recorded_maturity_only:'Recorded maturity only', confirmed_statement:'Confirmed by statement', modified_or_extended:'Modified or extended', no_current_deadline:'No current deadline found' };
export const COLLATERAL_LABELS:Record<typeof COLLATERAL_SCOPES[number],string> = { unverified:'Unverified', reconciled:'Reconciled', conflict:'Conflict recorded' };
export const OPERATING_LABELS:Record<typeof OPERATING_EVIDENCE[number],string> = { none:'None', partial:'Partial', permissioned_current:'Permissioned current' };
export const RELATIONSHIP_LABELS:Record<typeof RELATIONSHIP_STATES[number],string> = { unverified:'Unverified', verified:'Verified' };
export const AUTHORITY_LABELS:Record<typeof AUTHORITY_STATES[number],string> = { unknown:'Unknown', identified:'Identified', verified:'Verified' };
export const FEE_LABELS:Record<typeof FEE_STATES[number],string> = { unknown:'Unknown', none_proposed:'No fee proposed', proposed:'Proposed', agreed:'Agreed' };
export const MISSING_INPUT_LABELS:Record<MissingInput,string> = { current_payoff:'Current payoff', loan_statement:'Loan statement', modification_or_extension:'Modification / extension terms', collateral_scope:'Collateral scope', rent_roll:'Rent roll', t12_noi:'T12 / NOI', occupancy:'Actual occupancy', remaining_capex:'Remaining capex', owner_intent:'Owner intent', payer_willingness:'Payer willingness', decision_authority:'Decision authority', lender_terms:'Lender terms', program_eligibility:'Program eligibility', insurance_tax_quotes:'Insurance / tax quotes' };
export const ALTERNATIVE_LABELS:Record<AlternativeKind,string> = { ordinary_refinance:'Ordinary refinance', early_takeout:'Early takeout (eligibility unresolved)', restructuring:'Restructuring / partner solution', sale:'Sale', no_action:'No action', other:'Other' };
export const ALTERNATIVE_STATE_LABELS:Record<typeof ALTERNATIVE_STATES[number],string> = { not_compared:'Not compared', compared:'Compared', rejected:'Rejected', preferred:'Preferred' };
export const EVIDENCE_CLAIM_LABELS:Record<EvidenceClaim,string> = { deadline_basis:'Deadline basis', collateral_scope:'Collateral scope', operating_evidence:'Operating evidence', payer_relationship:'Payer relationship', decision_authority:'Decision authority', lender_program_review:'Lender / program review', agreement:'Executed agreement', outcome:'Documented outcome' };
export const EVIDENCE_CLASS_LABELS:Record<typeof EVIDENCE_CLASSES[number],string> = { public_record:'Public record', permissioned_document:'Permissioned document', owner_statement:'Owner statement', lender_statement:'Lender / servicer statement', analyst_assumption:'Analyst assumption', other:'Other' };
export const EVIDENCE_RELATION_LABELS:Record<typeof EVIDENCE_RELATIONS[number],string> = { supports:'Supports', contradicts:'Contradicts' };

/** What each state may claim. Shown beside the state control; enforced by checkStateRequirements. */
export const CASE_STATE_CONTRACT:Record<CaseState,{requires:string;permits:string}> = {
  observed_lead:{requires:'Source, date, entity scope and the actual observation.',permits:'Why it surfaced and what is missing. No confirmed distress, availability, payer, fee or preferred strategy.'},
  hypothesis:{requires:'Proposed need, candidate payer and role, supporting and contrary evidence, the test that would reject it, and the next verification step.',permits:'Candidate strategy and next step. No fee, cost, cash or capital amounts and no success score.'},
  documented_case:{requires:'Evidence entries for the deadline basis, collateral scope and permissioned current operating evidence, plus a compared ordinary-financing or no-action alternative. Fee terms may stay unknown or be recorded as none proposed.',permits:'Transparent alternatives with explicit assumptions and proposed economics. Unresolved terms stay visible.'},
  executable_proposal:{requires:'Evidence entries for the lender or program review, decision authority and payer relationship; explicit cash and guarantee exposure; a proposed fee where one is proposed.',permits:'A reviewable proposal. Not a commitment or authorization to contact anyone.'},
  agreed:{requires:'An executed agreement recorded as evidence, with the agreed fee amount or the documented contingent terms.',permits:'Actual terms. Proposed, agreed, billed, contingent and collected amounts stay distinct.'},
  outcome_recorded:{requires:'A documented outcome recorded as evidence, with its date and scope; no engagement is needed.',permits:'What actually happened, including ordinary refinancing or no action, preserved for learning.'},
  rejected:{requires:'A reason and the evidence behind it.',permits:'A visible disposition preserved for learning. Established terms stay recorded.'},
  deferred:{requires:'A reason and the conditions for reconsideration.',permits:'A visible disposition with the trigger to revisit.'},
};

const TEXT_LIMITS = { label:180, hypothesis:4000, need:2000, supportingEvidence:4000, contraryEvidence:4000, rejectionTest:2000, payerNote:2000, revenueMechanism:2000, paymentTerms:2000, guaranteeNote:2000, capitalProvider:500, attributionNote:2000, rejectionReason:4000, reconsiderConditions:2000, nextAction:1000, nextActionOwner:200, lenderProgramReview:4000, agreementNote:4000, agreedTermsNote:2000, outcomeNote:4000 } as const;
const CHOICES = { lane:CASE_LANES, deadlineBasis:DEADLINE_BASES, collateralScope:COLLATERAL_SCOPES, operatingEvidence:OPERATING_EVIDENCE, payerType:PAYER_TYPES, payerRelationship:RELATIONSHIP_STATES, decisionAuthority:AUTHORITY_STATES, operatorRole:OPERATOR_ROLES, feeStatus:FEE_STATES } as const;
export const MONEY_FIELDS = ['proposedFeeCents','agreedFeeCents','billedCents','contingentFeeCents','deliveryCostCents','cashRequiredCents','guaranteeExposureCents','investorCapitalCents','collectedCents','realizedCostCents'] as const;
type TextField = keyof typeof TEXT_LIMITS; type ChoiceField = keyof typeof CHOICES; type MoneyField = typeof MONEY_FIELDS[number];
const EVIDENCE_TEXT = { locator:[1,500], effectivePeriod:[0,120], scope:[1,300], observation:[1,2000], limitations:[0,2000], reviewer:[1,120] } as const;

export type CaseContent = Record<TextField,string> & {[K in ChoiceField]:typeof CHOICES[K][number]} & Record<MoneyField,number|null> & { missingInputs:MissingInput[]; alternatives:Alternative[]; evidence:EvidenceEntry[]; nextActionDue:string|null };

export function emptyCaseContent(label:string):CaseContent {
  return { label, lane:'undetermined', hypothesis:'', need:'', supportingEvidence:'', contraryEvidence:'', rejectionTest:'', payerNote:'', revenueMechanism:'', paymentTerms:'', guaranteeNote:'', capitalProvider:'', attributionNote:'', rejectionReason:'', reconsiderConditions:'', nextAction:'', nextActionOwner:'', lenderProgramReview:'', agreementNote:'', agreedTermsNote:'', outcomeNote:'',
    deadlineBasis:'unknown', collateralScope:'unverified', operatingEvidence:'none', payerType:'unknown', payerRelationship:'unverified', decisionAuthority:'unknown', operatorRole:'undetermined', feeStatus:'unknown',
    proposedFeeCents:null, agreedFeeCents:null, billedCents:null, contingentFeeCents:null, deliveryCostCents:null, cashRequiredCents:null, guaranteeExposureCents:null, investorCapitalCents:null, collectedCents:null, realizedCostCents:null,
    missingInputs:[], alternatives:[], evidence:[], nextActionDue:null };
}
export function emptyEvidenceEntry(id:string, obtainedDate:string):EvidenceEntry {
  return { id, claims:[], relation:'supports', evidenceClass:'permissioned_document', locator:'', effectiveDate:null, effectivePeriod:'', obtainedDate, scope:'', observation:'', limitations:'', reviewer:'', reviewedAt:obtainedDate };
}

export type CaseOrigin = {
  capturedAt:string; snapshotId:string; sourceDate:string; importedAt:string; basisVersion?:'debt-basis-2';
  property:ResearchProperty; debt:DebtRecord|null; sources:ResearchSource[]; licenses:LicenseLink[]; fields?:PropertyDetail['fields'];
  /** The research filters active when the case opened; null only for origins captured before this field existed. */
  query:ResearchQuery|null;
  scenario:Scenario; principalCents:number|null; amountBasis:'original_recorded_amount'|'analyst_target'|null; threshold:ThresholdResult|null;
  trigger:{ kind:'recorded_maturity'|'recorded_instrument'|'property_record'; observedDate:string|null; reportedMaturity:string|null; retrievedAt:string; note:string };
};

/** Copy the research evidence a case starts from. Recorded amounts are observations, never a payoff. */
export function buildCaseOrigin(input:{snapshot:{id:string;sourceDate:string;importedAt:string}; record:ResearchProperty; detail:{sources?:ResearchSource[];licenses?:LicenseLink[];fields?:PropertyDetail['fields']}|null; debtId:string|null; principalCents:number|null; scenario:Scenario; query:ResearchQuery|null; capturedAt:string}):CaseOrigin {
  const mortgages = Array.isArray(input.record.mortgages) ? input.record.mortgages : [];
  const debt = input.debtId === null ? null : mortgages.find(d => d.id === input.debtId) ?? null;
  if (input.debtId !== null && !debt) throw new WorkspaceValidationError('The selected recorded instrument is not on this property record.', {debtId:'Choose an instrument observed on this record, or none.'});
  const scenario = validateScenario(input.scenario);
  const query = input.query === null ? null : validateQuery(input.query);
  let principalCents:number|null = null, amountBasis:CaseOrigin['amountBasis'] = null;
  if (input.principalCents !== null) {
    // An explicitly supplied amount is an analyst target even when it equals the recorded amount: provenance follows how it was supplied.
    if (!Number.isSafeInteger(input.principalCents) || input.principalCents <= 0 || input.principalCents > 1e12) throw new WorkspaceValidationError('Scenario debt must be positive whole cents, at most USD 10 billion.', {principalCents:'Enter a supported analyst target or use the recorded amount.'});
    principalCents = input.principalCents; amountBasis = 'analyst_target';
  } else if (debt && usableRecordedAmount(debt)) { principalCents = debt.amountCents; amountBasis = 'original_recorded_amount'; }
  const threshold = principalCents === null ? null : financingThreshold(principalCents, scenario);
  const trigger:CaseOrigin['trigger'] = debt
    ? { kind: debt.maturity ? 'recorded_maturity' : 'recorded_instrument', observedDate: debt.recordingDate ?? debt.documentDate ?? null, reportedMaturity: debt.maturity ?? null, retrievedAt: input.record.retrievedAt, note: debt.maturity ? 'A reported maturity is a research lead. It does not establish a current obligation, default, willingness to transact or an available transaction.' : 'A recorded instrument without a reported maturity. Current balance, releases and extensions are not established.' }
    : { kind:'property_record', observedDate: input.record.providerDate ?? null, reportedMaturity:null, retrievedAt: input.record.retrievedAt, note:'Opened from the property record without a selected instrument. No debt basis is inferred.' };
  return structuredClone({ basisVersion:'debt-basis-2', capturedAt:input.capturedAt, snapshotId:input.snapshot.id, sourceDate:input.snapshot.sourceDate, importedAt:input.snapshot.importedAt,
    property:input.record, debt, sources:Array.isArray(input.detail?.sources) ? input.detail!.sources! : [], licenses:Array.isArray(input.detail?.licenses) ? input.detail!.licenses! : [],
    fields:input.detail?.fields??[], query, scenario, principalCents, amountBasis, threshold, trigger });
}

const fail = (fields:Record<string,string>, message = 'Review the highlighted case fields.') => new WorkspaceValidationError(message, fields);
const isPlain = (v:unknown):v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validateEvidence(value:unknown, fields:Record<string,string>):EvidenceEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) { fields.evidence = 'Record up to fifty evidence entries.'; return []; }
  const ids = new Set<string>(); const out:EvidenceEntry[] = [];
  value.forEach((raw, index) => {
    const at = `evidence.${index}`;
    if (!isPlain(raw)) { fields[at] = 'Each evidence entry must be an object.'; return; }
    for (const key of Object.keys(raw)) if (!['id','claims','relation','evidenceClass','locator','effectiveDate','effectivePeriod','obtainedDate','scope','observation','limitations','reviewer','reviewedAt'].includes(key)) fields[`${at}.${key}`] = 'Unknown evidence field.';
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fields[`${at}.id`] = 'Give the entry a short stable identifier.';
    else if (ids.has(id)) fields[`${at}.id`] = 'Evidence identifiers must be unique within the version.';
    ids.add(id);
    const claims = Array.isArray(raw.claims) ? raw.claims : [];
    if (!Array.isArray(raw.claims) || !claims.length || claims.some(c => !(EVIDENCE_CLAIMS as readonly string[]).includes(c as string)) || new Set(claims).size !== claims.length) fields[`${at}.claims`] = 'Link the entry to at least one supported claim, each once.';
    const relation = raw.relation ?? 'supports', evidenceClass = raw.evidenceClass;
    if (typeof relation !== 'string' || !(EVIDENCE_RELATIONS as readonly string[]).includes(relation)) fields[`${at}.relation`] = 'Choose supports or contradicts.';
    if (typeof evidenceClass !== 'string' || !(EVIDENCE_CLASSES as readonly string[]).includes(evidenceClass)) fields[`${at}.evidenceClass`] = 'Choose the evidence class.';
    const text:Record<string,string> = {};
    for (const [key, [min, max]] of Object.entries(EVIDENCE_TEXT)) {
      const v = raw[key] ?? '';
      if (typeof v !== 'string') { fields[`${at}.${key}`] = 'Enter text.'; continue; }
      const t = v.trim(); if (t.length < min || t.length > max) fields[`${at}.${key}`] = min ? `Enter a value up to ${max} characters.` : `Use at most ${max} characters.`; text[key] = t;
    }
    const effectiveDate = raw.effectiveDate ?? null;
    if (effectiveDate !== null && !isDate(effectiveDate)) fields[`${at}.effectiveDate`] = 'Enter a real calendar date as YYYY-MM-DD, or leave blank and describe the period.';
    if (effectiveDate === null && !text.effectivePeriod) fields[`${at}.effectivePeriod`] = 'Give the effective date or the period the evidence covers.';
    for (const key of ['obtainedDate','reviewedAt'] as const) if (!isDate(raw[key])) fields[`${at}.${key}`] = 'Enter a real calendar date as YYYY-MM-DD.';
    out.push({ id, claims: [...(claims as EvidenceClaim[])].sort(), relation: relation as EvidenceEntry['relation'], evidenceClass: evidenceClass as EvidenceEntry['evidenceClass'], locator:text.locator, effectiveDate: effectiveDate as string|null, effectivePeriod:text.effectivePeriod, obtainedDate: raw.obtainedDate as string, scope:text.scope, observation:text.observation, limitations:text.limitations, reviewer:text.reviewer, reviewedAt: raw.reviewedAt as string });
  });
  return out;
}

/** Validate submitted case content. Alternative thresholds are always recalculated here; submitted results are discarded. */
export function validateCaseContent(value:unknown, origin:{principalCents:number|null}):CaseContent {
  if (!isPlain(value)) throw fail({content:'Supply the case content as an object.'});
  const template = emptyCaseContent('x');
  const fields:Record<string,string> = {};
  for (const key of Object.keys(value)) if (!(key in template)) fields[key] = 'Unknown case field.';
  const out = {} as Record<string,unknown>;
  for (const key of Object.keys(TEXT_LIMITS) as TextField[]) {
    const v = value[key] ?? '';
    if (typeof v !== 'string') { fields[key] = 'Enter text.'; continue; }
    const text = v.trim(); if (text.length > TEXT_LIMITS[key]) fields[key] = `Use at most ${TEXT_LIMITS[key]} characters.`; out[key] = text;
  }
  if (!String(out.label ?? '').length) fields.label = 'Name the case.';
  for (const key of Object.keys(CHOICES) as ChoiceField[]) {
    const v = value[key] ?? template[key];
    if (typeof v !== 'string' || !(CHOICES[key] as readonly string[]).includes(v)) fields[key] = 'Choose a supported value.'; out[key] = v;
  }
  for (const key of MONEY_FIELDS) {
    const v = value[key] ?? null;
    if (v !== null && (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)) fields[key] = 'Enter whole nonnegative cents, or leave unknown.'; out[key] = v;
  }
  const missing = value.missingInputs ?? [];
  if (!Array.isArray(missing) || missing.some(m => !(MISSING_INPUTS as readonly string[]).includes(m as string)) || new Set(missing).size !== missing.length) fields.missingInputs = 'Choose each missing input at most once from the supported list.';
  out.missingInputs = Array.isArray(missing) ? [...missing].sort() : [];
  const due = value.nextActionDue ?? null;
  if (due !== null && !isDate(due)) fields.nextActionDue = 'Enter a real calendar date as YYYY-MM-DD.'; out.nextActionDue = due;
  out.evidence = validateEvidence(value.evidence, fields);
  const alternatives = value.alternatives ?? [];
  const built:Alternative[] = [];
  if (!Array.isArray(alternatives) || alternatives.length > 6) fields.alternatives = 'Record up to six alternatives.';
  else {
    let preferred = 0; const kinds = new Set<string>();
    alternatives.forEach((raw, index) => {
      const at = `alternatives.${index}`;
      if (!isPlain(raw)) { fields[at] = 'Each alternative must be an object.'; return; }
      for (const key of Object.keys(raw)) if (!['kind','label','status','note','scenario','result'].includes(key)) fields[`${at}.${key}`] = 'Unknown alternative field.';
      const kind = raw.kind, status = raw.status ?? 'not_compared', label = typeof raw.label === 'string' ? raw.label.trim() : '', note = typeof raw.note === 'string' ? raw.note.trim() : '';
      if (typeof kind !== 'string' || !(ALTERNATIVE_KINDS as readonly string[]).includes(kind)) { fields[`${at}.kind`] = 'Choose a supported alternative.'; return; }
      if (typeof status !== 'string' || !(ALTERNATIVE_STATES as readonly string[]).includes(status)) fields[`${at}.status`] = 'Choose a supported comparison status.';
      if (typeof raw.label !== 'string' && raw.label !== undefined || label.length > 120 || (kind === 'other' && !label)) fields[`${at}.label`] = kind === 'other' ? 'Name the other alternative (up to 120 characters).' : 'Use at most 120 characters.';
      if (typeof raw.note !== 'string' && raw.note !== undefined || note.length > 2000) fields[`${at}.note`] = 'Use at most 2000 characters.';
      if (kind !== 'other') { if (kinds.has(kind)) fields[`${at}.kind`] = 'Each alternative kind appears once.'; kinds.add(kind); }
      if (status === 'preferred') preferred++;
      let scenario:Scenario|null = null, result:ThresholdResult|null = null;
      if (raw.scenario !== null && raw.scenario !== undefined) {
        try { scenario = validateScenario(raw.scenario); } catch (error) { fields[`${at}.scenario`] = error instanceof ResearchValidationError ? error.message : 'Invalid financing assumptions.'; }
        if (scenario && origin.principalCents === null) fields[`${at}.scenario`] = 'This case has no debt basis, so financing assumptions cannot be compared.';
        else if (scenario) result = financingThreshold(origin.principalCents!, scenario);
      }
      built.push({ kind: kind as AlternativeKind, label, status: status as Alternative['status'], note, scenario, result });
    });
    if (preferred > 1) fields.alternatives = 'At most one alternative can be preferred.';
  }
  out.alternatives = built;
  if (Object.keys(fields).length) throw fail(fields);
  return structuredClone(out as CaseContent);
}

const ANALYTICAL:CaseState[] = ['hypothesis','documented_case','executable_proposal','agreed'];
const DOCUMENTED:CaseState[] = ['documented_case','executable_proposal','agreed'];
const EXECUTABLE:CaseState[] = ['executable_proposal','agreed'];
const TERMS_MAY_BE_HISTORICAL:CaseState[] = ['agreed','outcome_recorded','rejected','deferred'];

/** Per-state gates from STRATEGY-EXECUTION.md. Returns field messages; empty means the content supports the state. */
export function checkStateRequirements(state:CaseState, c:CaseContent):Record<string,string> {
  const f:Record<string,string> = {};
  const need = (key:keyof CaseContent, message:string) => { const v = c[key]; if (v === null || v === '' || (Array.isArray(v) && !v.length)) f[key] = message; };
  const supported = (claim:EvidenceClaim) => c.evidence.some(e => e.relation === 'supports' && e.claims.includes(claim));
  const evidenced = (asserted:boolean, claim:EvidenceClaim, key:keyof CaseContent, message:string) => { if (asserted && !supported(claim)) f[key] = message; };
  const amounts = MONEY_FIELDS.filter(k => c[k] !== null);
  const preferred = c.alternatives.some(a => a.status === 'preferred');
  const baseline = c.alternatives.some(a => ['ordinary_refinance','no_action'].includes(a.kind) && a.status !== 'not_compared');

  // Asserted claims need a supporting evidence entry in every state; the register is what makes a status more than a dropdown.
  evidenced(['confirmed_statement','modified_or_extended','no_current_deadline'].includes(c.deadlineBasis),'deadline_basis','deadlineBasis','Add a supporting evidence entry for this deadline basis, or keep it at recorded maturity or unknown.');
  evidenced(c.collateralScope !== 'unverified','collateral_scope','collateralScope','Add an evidence entry describing the reconciled scope or the conflict.');
  evidenced(c.operatingEvidence === 'permissioned_current','operating_evidence','operatingEvidence','Add an evidence entry for the permissioned current operating evidence.');
  evidenced(c.payerRelationship === 'verified','payer_relationship','payerRelationship','Add an evidence entry showing how the payer relationship was verified.');
  evidenced(c.decisionAuthority !== 'unknown','decision_authority','decisionAuthority','Add an evidence entry identifying who controls the decision.');
  evidenced(!!c.lenderProgramReview,'lender_program_review','lenderProgramReview','Add an evidence entry for the lender or program terms actually reviewed.');
  evidenced(c.feeStatus === 'agreed','agreement','feeStatus','Record the executed agreement as an evidence entry before marking fees agreed.');
  evidenced(c.collectedCents !== null || c.billedCents !== null || c.realizedCostCents !== null,'outcome','collectedCents','Billed, collected and realized amounts need a documented-outcome evidence entry.');
  if (c.feeStatus === 'proposed') need('revenueMechanism','State the basis of the proposed fee.');
  if (c.feeStatus === 'agreed' && c.agreedFeeCents === null && !c.agreedTermsNote) f.agreedFeeCents = 'Record the agreed fee amount, or describe the contingent or formula terms.';
  if (c.feeStatus === 'agreed' && !TERMS_MAY_BE_HISTORICAL.includes(state)) f.feeStatus = 'Agreed fees are recorded at the agreed state; earlier states keep terms unknown, none proposed or proposed.';

  if (state === 'observed_lead' || state === 'hypothesis') {
    for (const k of amounts) f[k] = 'A lead or hypothesis records no fee, cost, cash, capital or collected amounts.';
    if (c.feeStatus !== 'unknown') f.feeStatus = 'Fee terms stay unknown until a case is documented.';
    if (preferred) f.alternatives = 'A preferred strategy needs a documented case.';
  }
  if (state === 'observed_lead') return f;
  if (ANALYTICAL.includes(state)) {
    need('hypothesis','State the proposed need and mechanism.'); need('need','State whose problem this solves.');
    need('supportingEvidence','Record the supporting evidence.'); need('contraryEvidence','Record the contrary evidence or state that none was found.');
    need('rejectionTest','State what evidence would reject this hypothesis.');
    if (c.payerType === 'unknown') f.payerType = 'Name a candidate payer type.';
    if (c.operatorRole === 'undetermined') f.operatorRole = 'Choose the operator role under test.';
    if (c.lane === 'undetermined') f.lane = 'Choose the strategy lane under test.';
    if (state !== 'agreed') need('nextAction','State the next verification step or action.');
  }
  if (DOCUMENTED.includes(state)) {
    if (!['confirmed_statement','modified_or_extended','no_current_deadline'].includes(c.deadlineBasis)) f.deadlineBasis = 'Establish the decision deadline from permissioned statements or owner evidence, or retain a hypothesis.';
    if (c.collateralScope === 'unverified') f.collateralScope = 'Reconcile the collateral scope or record the conflict.';
    if (c.operatingEvidence !== 'permissioned_current') f.operatingEvidence = 'A documented case needs permissioned current operating evidence.';
    if (!baseline) f.alternatives = 'Compare an ordinary refinance or no-action alternative before documenting a case.';
  }
  if (EXECUTABLE.includes(state)) {
    need('lenderProgramReview','Record the applicable lender or program review.');
    if (c.decisionAuthority === 'unknown') f.decisionAuthority = 'Identify who controls the decision.';
    if (c.payerRelationship !== 'verified') f.payerRelationship = 'Verify the payer relationship to the property.';
    if (c.feeStatus === 'unknown') f.feeStatus = 'Record whether a fee is proposed, or that none is proposed.';
    if (c.feeStatus === 'proposed') need('proposedFeeCents','State the proposed fee.');
    need('cashRequiredCents','State the cash required, even if zero.'); need('guaranteeExposureCents','State the guarantee exposure, even if zero.');
    if ((c.investorCapitalCents ?? 0) > 0 && !c.capitalProvider) f.capitalProvider = 'Name whose capital is proposed.';
  }
  if (state === 'agreed') { if (c.feeStatus !== 'agreed') f.feeStatus = 'An agreed case records the agreed fee basis.'; need('agreementNote','Describe the executed agreement.'); }
  if (state === 'outcome_recorded') { need('outcomeNote','Describe the documented outcome, its date and scope.'); if (!supported('outcome')) f.evidence = 'Record the outcome as an evidence entry linked to the documented-outcome claim.'; }
  if (state === 'rejected' || state === 'deferred') need('rejectionReason', state === 'rejected' ? 'Record why this opportunity is rejected.' : 'Record why this case is deferred.');
  if (state === 'deferred') need('reconsiderConditions','Record what would reopen this case.');
  return f;
}

export type PreparedVersion = { state:CaseState; lane:CaseLane; content:CaseContent; modelVersion:typeof CASE_MODEL_VERSION };
export type CaseVersion = { version:number; state:CaseState; lane:CaseLane; modelVersion:string; content:CaseContent; reason:string; createdAt:string; createdBy:string };
export type StrategyCase = { id:string; snapshotId:string; propertyId:string; debtId:string|null; createdAt:string; createdBy:string; origin:CaseOrigin; current:CaseVersion; versions:CaseVersion[] };
export type StrategyCaseSummary = { id:string; snapshotId:string; propertyId:string; debtId:string|null; address:string; countyName:string; principalCents:number|null; amountBasis:CaseOrigin['amountBasis']; sharedPropertyCount:number|null; instrumentConflict:boolean|null; reportedMaturity:string|null; createdAt:string; version:number; state:CaseState; lane:CaseLane; label:string; payerType:CaseContent['payerType']; operatorRole:CaseContent['operatorRole']; nextAction:string; nextActionDue:string|null; missingInputs:number; evidenceEntries:number; versionAt:string; versionBy:string };
export type CaseWriteResult = { ok:true; id:string; version:number; message:string };

export function prepareCaseVersion(state:unknown, content:unknown, origin:{principalCents:number|null}):PreparedVersion {
  if (typeof state !== 'string' || !(CASE_STATES as readonly string[]).includes(state)) throw fail({state:'Choose a supported case state.'}, 'Choose a supported case state.');
  const validated = validateCaseContent(content, origin);
  const gates = checkStateRequirements(state as CaseState, validated);
  if (Object.keys(gates).length) throw fail(gates, `The content does not yet support the ${CASE_STATE_LABELS[state as CaseState]} state.`);
  return { state: state as CaseState, lane: validated.lane, content: validated, modelVersion: CASE_MODEL_VERSION };
}

const usd = (cents:number|null) => cents === null ? 'unknown' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);
/** One sentence saying what caused the case to surface, from the immutable origin only. */
export function describeTrigger(origin:CaseOrigin):string {
  const p = origin.property, d = origin.debt;
  if (!d) return `${p.address} surfaced from the ${origin.sourceDate.slice(0,10)} source snapshot (provider record retrieved ${p.retrievedAt.slice(0,10)}). No instrument was selected.`;
  return `${p.address}: recorded ${d.lender ?? 'lender not reported'} instrument of ${usd(d.amountCents)}, recorded ${d.recordingDate ?? 'date not reported'}, reported maturity ${d.maturity ?? 'not reported'}; provider record retrieved ${p.retrievedAt.slice(0,10)}.`;
}
