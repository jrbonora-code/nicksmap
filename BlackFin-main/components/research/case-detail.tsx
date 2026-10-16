'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { ALTERNATIVE_KINDS, ALTERNATIVE_LABELS, ALTERNATIVE_STATES, ALTERNATIVE_STATE_LABELS, AUTHORITY_LABELS, AUTHORITY_STATES, CASE_LANES, CASE_LANE_LABELS, CASE_STATES, CASE_STATE_CONTRACT, CASE_STATE_LABELS, COLLATERAL_LABELS, COLLATERAL_SCOPES, DEADLINE_BASES, DEADLINE_LABELS, EVIDENCE_CLAIMS, EVIDENCE_CLAIM_LABELS, EVIDENCE_CLASSES, EVIDENCE_CLASS_LABELS, EVIDENCE_RELATIONS, EVIDENCE_RELATION_LABELS, FEE_LABELS, FEE_STATES, MISSING_INPUTS, MISSING_INPUT_LABELS, MONEY_FIELDS, OPERATING_EVIDENCE, OPERATING_LABELS, OPERATOR_ROLES, PAYER_LABELS, PAYER_TYPES, RELATIONSHIP_LABELS, RELATIONSHIP_STATES, ROLE_LABELS, checkStateRequirements, describeTrigger, emptyCaseContent, emptyEvidenceEntry, type Alternative, type CaseContent, type CaseState, type CaseVersion, type EvidenceEntry, type StrategyCase } from '../../lib/research/case-model';
import { defaultScenario, financingThreshold } from '../../lib/research/finance';
import { emptyQuery } from '../../lib/research/query';
import { dollarsToCents } from '../../lib/workspace/money';
import { centsInput } from '../workspace/ui';
import { InfoHint, ContextBadge } from './context-note';
import { DebtNotes } from './debt-notes';
import { DebtBasis } from './case-list';
import { date, number, stamp, usd } from './format';
import { ScenarioFields } from './scenario-fields';
import './workspace.css';
import './cases.css';

type MoneyField = typeof MONEY_FIELDS[number];
type Draft = Omit<CaseContent, MoneyField>;
/** Older content versions may lack fields added later; defaults fill them for editing without altering the stored version. */
function split(stored:CaseContent):{draft:Draft; money:Record<MoneyField,string>} {
  const content = {...emptyCaseContent(stored.label), ...stored} as CaseContent;
  const money = Object.fromEntries(MONEY_FIELDS.map(k => [k, content[k] === null || content[k] === undefined ? '' : centsInput(content[k]!)])) as Record<MoneyField,string>;
  const draft = {...content} as Partial<CaseContent>; for (const k of MONEY_FIELDS) delete draft[k];
  return { draft: draft as Draft, money };
}
const newEvidenceId = () => `e${Date.now().toString(36)}${Math.floor(Math.random()*1000).toString(36)}`;

export function CaseDetail({ initial }: { initial: StrategyCase }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [{draft, money}, setForm] = useState(() => split(initial.current.content));
  const [state, setState] = useState<CaseState>(initial.current.state);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string|null>(null);
  const origin = data.origin, principal = origin.principalCents;
  const setDraft = (patch:Partial<Draft>) => setForm(f => ({...f, draft:{...f.draft, ...patch}}));
  const setMoney = (key:MoneyField, value:string) => setForm(f => ({...f, money:{...f.money, [key]:value}}));
  const setAlternative = (index:number, patch:Partial<Alternative>) => setDraft({alternatives: draft.alternatives.map((a,i) => i === index ? {...a, ...patch} : a)});
  const setEvidence = (index:number, patch:Partial<EvidenceEntry>) => setDraft({evidence: draft.evidence.map((e,i) => i === index ? {...e, ...patch} : e)});
  const field = (key:string) => ({ id:key, 'aria-invalid': !!errors[key] || undefined, 'aria-describedby': errors[key] ? `${key}-error` : undefined });

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields:Record<string,string> = {}; const cents:Partial<Record<MoneyField,number|null>> = {};
    for (const k of MONEY_FIELDS) { try { cents[k] = dollarsToCents(money[k]); } catch (error) { fields[k] = error instanceof Error ? error.message : 'Invalid amount.'; } }
    if (!reason.trim()) fields.reason = 'Explain why this version is being saved.';
    if (Object.keys(fields).length) { setErrors(fields); setMessage('Review the highlighted fields.'); return; }
    const content = {...draft, ...cents} as CaseContent;
    const gates = checkStateRequirements(state, content);
    if (Object.keys(gates).length) { setErrors(gates); setMessage(`The content does not yet support the ${CASE_STATE_LABELS[state]} state.`); return; }
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const response = await fetch(`/api/research/cases/${encodeURIComponent(data.id)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({requestId:requestId.current, expectedVersion:data.current.version, state, content, reason:reason.trim()})});
      const body = await response.json();
      if (!response.ok) { setErrors(body.fields ?? {}); setMessage(body.error ?? 'Save failed.'); return; }
      requestId.current = null;
      const fresh = await fetch(`/api/research/cases/${encodeURIComponent(data.id)}`, {cache:'no-store'});
      if (!fresh.ok) { setMessage(`${body.message} Reload to see the saved version.`); router.refresh(); return; }
      const next:StrategyCase = await fresh.json();
      setData(next); setForm(split(next.current.content)); setState(next.current.state); setReason(''); setMessage(body.message); router.refresh();
    } catch { setMessage('The response was interrupted. Reload to check whether the version saved before retrying.'); }
    finally { setBusy(false); }
  }

  const compare = draft.alternatives.map(a => { if (!a.scenario || principal === null) return null; try { return financingThreshold(principal, a.scenario); } catch { return null; } });
  const prefixed = (prefix:string) => Object.entries(errors).filter(([k]) => k.startsWith(prefix)).map(([,v]) => v);
  const filters = origin.query ? Object.entries(origin.query).filter(([k,v]) => JSON.stringify(v) !== JSON.stringify((emptyQuery as Record<string,unknown>)[k])) : null;
  const today = defaultScenario().asOf;
  return <div className="research-workspace">
    <header className="case-heading"><div><Link href="/research/cases" className="case-back"><ArrowLeft size={13} /> All strategy cases</Link><h1>{data.current.content.label} <span className={`case-state state-${data.current.state}`}>{CASE_STATE_LABELS[data.current.state]}</span></h1><div className="case-heading-meta"><span>Version {data.current.version}</span><span>{CASE_LANE_LABELS[data.current.lane]}</span><span>{origin.property.address} · {origin.property.countyName}</span><span>Opened {date(data.createdAt)}</span><span>Updated {stamp(data.current.createdAt)}</span></div></div><div className="research-heading-actions"><Link href="/research" className="case-back">Property research</Link></div></header>
    {message && <div className={Object.keys(errors).length ? 'research-error' : 'research-message'} role={Object.keys(errors).length ? 'alert' : 'status'}>{message}<button type="button" aria-label="Dismiss message" onClick={() => setMessage('')}><X size={13} /></button></div>}
    <div className="case-page">
      <form onSubmit={save} aria-label="Case version editor">
        <section className="case-section"><h2>Disposition <InfoHint label="Case states">Each state has required evidence and a permitted claim. Saving checks the content against the chosen state; a case can stop or move back at any state, and established terms stay recorded.</InfoHint></h2><div className="case-grid">
          <Choice label="Case state" {...field('state')} value={state} options={CASE_STATES} labels={CASE_STATE_LABELS} onChange={v => setState(v as CaseState)} error={errors.state} />
          <Choice label="Strategy lane" {...field('lane')} value={draft.lane} options={CASE_LANES} labels={CASE_LANE_LABELS} onChange={v => setDraft({lane: v as Draft['lane']})} error={errors.lane} />
          <div className="wide"><ContextBadge label={`${CASE_STATE_LABELS[state]}: requires`}>{CASE_STATE_CONTRACT[state].requires}</ContextBadge> <ContextBadge label="Permits">{CASE_STATE_CONTRACT[state].permits}</ContextBadge></div>
          <Text label="Case name" {...field('label')} value={draft.label} max={180} onChange={v => setDraft({label:v})} error={errors.label} wide />
        </div></section>
        <section className="case-section"><h2>Trigger and evidence status <InfoHint label="Evidence status">Record what has actually been established. Every status beyond the recorded maturity, unverified scope or no operating evidence needs a supporting entry in the evidence register below.</InfoHint></h2><div className="case-grid">
          <Choice label="Deadline basis" {...field('deadlineBasis')} value={draft.deadlineBasis} options={DEADLINE_BASES} labels={DEADLINE_LABELS} onChange={v => setDraft({deadlineBasis: v as Draft['deadlineBasis']})} error={errors.deadlineBasis} />
          <Choice label="Collateral / community scope" {...field('collateralScope')} value={draft.collateralScope} options={COLLATERAL_SCOPES} labels={COLLATERAL_LABELS} onChange={v => setDraft({collateralScope: v as Draft['collateralScope']})} error={errors.collateralScope} />
          <Choice label="Operating evidence" {...field('operatingEvidence')} value={draft.operatingEvidence} options={OPERATING_EVIDENCE} labels={OPERATING_LABELS} onChange={v => setDraft({operatingEvidence: v as Draft['operatingEvidence']})} error={errors.operatingEvidence} />
          <Text label="Supporting evidence" {...field('supportingEvidence')} value={draft.supportingEvidence} max={4000} rows={3} onChange={v => setDraft({supportingEvidence:v})} error={errors.supportingEvidence} wide hint="Summarize what supports the hypothesis; the register below carries the dated entries." />
          <Text label="Contrary evidence" {...field('contraryEvidence')} value={draft.contraryEvidence} max={4000} rows={3} onChange={v => setDraft({contraryEvidence:v})} error={errors.contraryEvidence} wide hint="What weakens the hypothesis, or a statement that nothing contrary was found." />
          <div className="wide"><h3>Missing inputs <InfoHint label="Missing inputs">Unknown values stay unknown. Tick what is still missing so it appears beside the case in lists and next to affected values. An empty register reads as not assessed, not as complete.</InfoHint></h3><div className="case-checks" id="missingInputs">{MISSING_INPUTS.map(k => <label key={k}><input type="checkbox" checked={draft.missingInputs.includes(k)} onChange={e => setDraft({missingInputs: e.target.checked ? [...draft.missingInputs, k].sort() : draft.missingInputs.filter(m => m !== k)})} />{MISSING_INPUT_LABELS[k]}</label>)}</div>{errors.missingInputs && <p className="field-error">{errors.missingInputs}</p>}</div>
        </div></section>
        <section className="case-section"><h2>Evidence register <InfoHint label="Evidence register">Each entry records where a claim comes from: the source and its location, the date or period it covers, when it was obtained, the entity or instrument it actually covers, what it establishes, its limits, and who reviewed it. An entry supports auditability; it does not prove the source true. Documents themselves are not uploaded.</InfoHint></h2>
          {errors.evidence && <p className="field-error" id="evidence-error">{errors.evidence}</p>}
          {draft.evidence.map((e, i) => <div className="case-evidence" key={e.id} id={`evidence.${i}`}>
            <div className="case-evidence-head"><span>Entry {i+1}</span><select aria-label={`Evidence ${i+1} relation`} value={e.relation} onChange={ev => setEvidence(i, {relation: ev.target.value as EvidenceEntry['relation']})}>{EVIDENCE_RELATIONS.map(r => <option key={r} value={r}>{EVIDENCE_RELATION_LABELS[r]}</option>)}</select><select aria-label={`Evidence ${i+1} class`} value={e.evidenceClass} onChange={ev => setEvidence(i, {evidenceClass: ev.target.value as EvidenceEntry['evidenceClass']})}>{EVIDENCE_CLASSES.map(c => <option key={c} value={c}>{EVIDENCE_CLASS_LABELS[c]}</option>)}</select><button type="button" onClick={() => setDraft({evidence: draft.evidence.filter((_, j) => j !== i)})}><X size={12} /> Remove</button></div>
            <div className="case-checks">{EVIDENCE_CLAIMS.map(claim => <label key={claim}><input type="checkbox" aria-label={`Evidence ${i+1} claim ${EVIDENCE_CLAIM_LABELS[claim]}`} checked={e.claims.includes(claim)} onChange={ev => setEvidence(i, {claims: ev.target.checked ? [...e.claims, claim].sort() : e.claims.filter(c => c !== claim)})} />{EVIDENCE_CLAIM_LABELS[claim]}</label>)}</div>
            <div className="case-grid">
              <label className="wide"><span>Source and location</span><input aria-label={`Evidence ${i+1} locator`} maxLength={500} placeholder="Document or source, page or section" value={e.locator} onChange={ev => setEvidence(i, {locator: ev.target.value})} /></label>
              <label><span>Effective date</span><input aria-label={`Evidence ${i+1} effective date`} type="date" value={e.effectiveDate ?? ''} onChange={ev => setEvidence(i, {effectiveDate: ev.target.value || null})} /></label>
              <label><span>Or period covered</span><input aria-label={`Evidence ${i+1} period`} maxLength={120} placeholder="e.g. T12 to 2026-06-30" value={e.effectivePeriod} onChange={ev => setEvidence(i, {effectivePeriod: ev.target.value})} /></label>
              <label><span>Obtained</span><input aria-label={`Evidence ${i+1} obtained`} type="date" value={e.obtainedDate} onChange={ev => setEvidence(i, {obtainedDate: ev.target.value})} /></label>
              <label><span>Reviewer</span><input aria-label={`Evidence ${i+1} reviewer`} maxLength={120} value={e.reviewer} onChange={ev => setEvidence(i, {reviewer: ev.target.value})} /></label>
              <label><span>Reviewed</span><input aria-label={`Evidence ${i+1} reviewed`} type="date" value={e.reviewedAt} onChange={ev => setEvidence(i, {reviewedAt: ev.target.value})} /></label>
              <label className="wide"><span>Covered scope (entity, instrument, parcel)</span><input aria-label={`Evidence ${i+1} scope`} maxLength={300} value={e.scope} onChange={ev => setEvidence(i, {scope: ev.target.value})} /></label>
              <label className="wide"><span>What it establishes</span><textarea aria-label={`Evidence ${i+1} observation`} rows={2} maxLength={2000} value={e.observation} onChange={ev => setEvidence(i, {observation: ev.target.value})} /></label>
              <label className="wide"><span>Limitations and conflicts</span><textarea aria-label={`Evidence ${i+1} limitations`} rows={2} maxLength={2000} value={e.limitations} onChange={ev => setEvidence(i, {limitations: ev.target.value})} /></label>
            </div>
            {prefixed(`evidence.${i}`).map((msg, j) => <p className="field-error" key={j}>{msg}</p>)}
          </div>)}
          <button type="button" disabled={draft.evidence.length >= 50} onClick={() => setDraft({evidence:[...draft.evidence, emptyEvidenceEntry(newEvidenceId(), today)]})}><Plus size={13} /> Add evidence entry</button>
        </section>
        <section className="case-section"><h2>Strategy, payer and role <InfoHint label="Strategy fields">Name the need, who could pay, who controls the decision, which role the operator would perform, and what evidence would reject the hypothesis. Willingness to transact is unknown until verified.</InfoHint></h2><div className="case-grid">
          <Text label="Hypothesis" {...field('hypothesis')} value={draft.hypothesis} max={4000} rows={3} onChange={v => setDraft({hypothesis:v})} error={errors.hypothesis} wide hint="The proposed need and the mechanism that would address it." />
          <Text label="Whose problem" {...field('need')} value={draft.need} max={2000} rows={2} onChange={v => setDraft({need:v})} error={errors.need} wide />
          <Text label="Rejection test" {...field('rejectionTest')} value={draft.rejectionTest} max={2000} rows={2} onChange={v => setDraft({rejectionTest:v})} error={errors.rejectionTest} wide hint="State up front what evidence would kill this hypothesis, for example a normal takeout already in place or no willing payer." />
          <Choice label="Potential payer" {...field('payerType')} value={draft.payerType} options={PAYER_TYPES} labels={PAYER_LABELS} onChange={v => setDraft({payerType: v as Draft['payerType']})} error={errors.payerType} />
          <Choice label="Payer relationship to property" {...field('payerRelationship')} value={draft.payerRelationship} options={RELATIONSHIP_STATES} labels={RELATIONSHIP_LABELS} onChange={v => setDraft({payerRelationship: v as Draft['payerRelationship']})} error={errors.payerRelationship} />
          <Text label="Payer note" {...field('payerNote')} value={draft.payerNote} max={2000} rows={2} onChange={v => setDraft({payerNote:v})} error={errors.payerNote} wide hint="Role and evidence only. Keep private contact details out of the case." />
          <Choice label="Decision authority" {...field('decisionAuthority')} value={draft.decisionAuthority} options={AUTHORITY_STATES} labels={AUTHORITY_LABELS} onChange={v => setDraft({decisionAuthority: v as Draft['decisionAuthority']})} error={errors.decisionAuthority} />
          <Choice label="Operator role" {...field('operatorRole')} value={draft.operatorRole} options={OPERATOR_ROLES} labels={ROLE_LABELS} onChange={v => setDraft({operatorRole: v as Draft['operatorRole']})} error={errors.operatorRole} />
          <Text label="Revenue mechanism" {...field('revenueMechanism')} value={draft.revenueMechanism} max={2000} rows={2} onChange={v => setDraft({revenueMechanism:v})} error={errors.revenueMechanism} wide hint="The contract or transaction that would produce income; it is the basis of any proposed fee." />
        </div></section>
        <section className="case-section"><h2>Economics <InfoHint label="Economics">Service fees are separate from investment returns. Proposed, agreed, billed, contingent and collected amounts are separate facts; a loan’s gross interest is not manager income and a subsidy is not unrestricted profit. Fee terms may stay unknown, or be recorded as none proposed.</InfoHint></h2><div className="inspector-context"><ContextBadge label={FEE_LABELS[draft.feeStatus] + (draft.feeStatus === 'none_proposed' ? '' : ' fee basis')}>{draft.feeStatus === 'agreed' ? 'Agreed terms come from an executed agreement recorded in the evidence register.' : draft.feeStatus === 'proposed' ? 'Proposed amounts are the operator’s proposal, not accepted terms.' : draft.feeStatus === 'none_proposed' ? 'The operator proposes no fee on this case, for example because ordinary financing works.' : 'No fee basis has been recorded.'}</ContextBadge><DebtBasis c={{principalCents:principal, amountBasis:origin.amountBasis, sharedPropertyCount:origin.debt?.sharedPropertyCount ?? null, instrumentConflict:origin.debt?.instrumentConflict ?? null}} /></div><div className="case-grid">
          <Choice label="Fee status" {...field('feeStatus')} value={draft.feeStatus} options={FEE_STATES} labels={FEE_LABELS} onChange={v => setDraft({feeStatus: v as Draft['feeStatus']})} error={errors.feeStatus} />
          <Money label="Proposed fee USD" {...field('proposedFeeCents')} value={money.proposedFeeCents} onChange={v => setMoney('proposedFeeCents', v)} error={errors.proposedFeeCents} />
          <Money label="Agreed fee USD" {...field('agreedFeeCents')} value={money.agreedFeeCents} onChange={v => setMoney('agreedFeeCents', v)} error={errors.agreedFeeCents} />
          <Text label="Agreed contingent or formula terms" {...field('agreedTermsNote')} value={draft.agreedTermsNote} max={2000} onChange={v => setDraft({agreedTermsNote:v})} error={errors.agreedTermsNote} />
          <Money label="Billed USD" {...field('billedCents')} value={money.billedCents} onChange={v => setMoney('billedCents', v)} error={errors.billedCents} />
          <Money label="Contingent fee USD" {...field('contingentFeeCents')} value={money.contingentFeeCents} onChange={v => setMoney('contingentFeeCents', v)} error={errors.contingentFeeCents} />
          <Money label="Delivery cost USD" {...field('deliveryCostCents')} value={money.deliveryCostCents} onChange={v => setMoney('deliveryCostCents', v)} error={errors.deliveryCostCents} />
          <Money label="Cash required USD" {...field('cashRequiredCents')} value={money.cashRequiredCents} onChange={v => setMoney('cashRequiredCents', v)} error={errors.cashRequiredCents} />
          <Money label="Guarantee / recourse exposure USD" {...field('guaranteeExposureCents')} value={money.guaranteeExposureCents} onChange={v => setMoney('guaranteeExposureCents', v)} error={errors.guaranteeExposureCents} />
          <Money label="Investor capital USD" {...field('investorCapitalCents')} value={money.investorCapitalCents} onChange={v => setMoney('investorCapitalCents', v)} error={errors.investorCapitalCents} />
          <Text label="Capital provider" {...field('capitalProvider')} value={draft.capitalProvider} max={500} onChange={v => setDraft({capitalProvider:v})} error={errors.capitalProvider} />
          <Text label="Payment timing and conditions" {...field('paymentTerms')} value={draft.paymentTerms} max={2000} rows={2} onChange={v => setDraft({paymentTerms:v})} error={errors.paymentTerms} wide />
          <Text label="Guarantee note" {...field('guaranteeNote')} value={draft.guaranteeNote} max={2000} rows={2} onChange={v => setDraft({guaranteeNote:v})} error={errors.guaranteeNote} wide />
          <Text label="Manager / investor attribution" {...field('attributionNote')} value={draft.attributionNote} max={2000} rows={2} onChange={v => setDraft({attributionNote:v})} error={errors.attributionNote} wide />
        </div></section>
        <section className="case-section"><h2>Alternatives <InfoHint label="Comparing alternatives">Compare ordinary refinancing, early takeout, restructuring, sale or no action on the same debt basis. Financing assumptions run the existing threshold-1 model against the case debt basis; results are calculated thresholds, not quotes or approvals. Early takeout eligibility is unresolved until a program review is recorded.</InfoHint></h2>
          {principal === null && <div className="inspector-context"><ContextBadge label="No debt basis" tone="warning">This case opened without a recorded instrument or analyst target, so financing assumptions cannot be compared. Alternatives can still be recorded and reasoned.</ContextBadge></div>}
          {errors.alternatives && <p className="field-error" id="alternatives-error">{errors.alternatives}</p>}
          {draft.alternatives.map((a, i) => <div className="case-alternative" key={i} id={`alternatives.${i}`}>
            <div className="case-alternative-head"><select aria-label={`Alternative ${i+1} kind`} value={a.kind} onChange={e => setAlternative(i, {kind: e.target.value as Alternative['kind']})}>{ALTERNATIVE_KINDS.map(k => <option key={k} value={k}>{ALTERNATIVE_LABELS[k]}</option>)}</select>{a.kind === 'other' && <input aria-label={`Alternative ${i+1} name`} placeholder="Name this alternative" maxLength={120} value={a.label} onChange={e => setAlternative(i, {label:e.target.value})} />}<select aria-label={`Alternative ${i+1} status`} value={a.status} onChange={e => setAlternative(i, {status: e.target.value as Alternative['status']})}>{ALTERNATIVE_STATES.map(s => <option key={s} value={s}>{ALTERNATIVE_STATE_LABELS[s]}</option>)}</select><button type="button" onClick={() => setDraft({alternatives: draft.alternatives.filter((_, j) => j !== i)})}><X size={12} /> Remove</button></div>
            <label><span>Reasoning and assumptions</span><textarea aria-label={`Alternative ${i+1} reasoning`} rows={2} maxLength={2000} value={a.note} onChange={e => setAlternative(i, {note:e.target.value})} /></label>
            <label style={{flexDirection:'row', alignItems:'center', gap:7, marginTop:8}}><input type="checkbox" disabled={principal === null} checked={a.scenario !== null} onChange={e => setAlternative(i, {scenario: e.target.checked ? {...origin.scenario} : null, result:null})} />Compare financing assumptions on the case debt basis</label>
            {a.scenario && <div className="case-scenario"><ScenarioFields value={a.scenario} onChange={s => setAlternative(i, {scenario:s})} /></div>}
            {prefixed(`alternatives.${i}`).map((e, j) => <p className="field-error" key={j}>{e}</p>)}
          </div>)}
          <button type="button" disabled={draft.alternatives.length >= 6} onClick={() => setDraft({alternatives:[...draft.alternatives, {kind: draft.alternatives.some(a => a.kind === 'ordinary_refinance') ? 'no_action' : 'ordinary_refinance', label:'', status:'not_compared', note:'', scenario:null, result:null}]})}><Plus size={13} /> Add alternative</button>
          {compare.some(Boolean) && <table className="case-compare"><thead><tr><th>Alternative</th><th>Rate</th><th>Required NOI / yr</th><th>Required value</th><th>Annual debt service</th><th>Balloon at term</th><th>Binding test</th></tr></thead><tbody>{draft.alternatives.map((a, i) => { const r = compare[i]; if (!r) return null; return <tr key={i}><td>{a.kind === 'other' ? a.label || 'Other' : ALTERNATIVE_LABELS[a.kind]} · {ALTERNATIVE_STATE_LABELS[a.status]}</td><td>{(a.scenario!.annualRate*100).toFixed(2)}%{a.scenario!.interestOnly ? ' IO' : ''}</td><td>{usd(r.requiredNoiCents)}</td><td>{usd(r.requiredValueCents)}</td><td>{usd(r.annualDebtServiceCents)}</td><td>{usd(r.balloonCents)}</td><td>{r.bindingIncomeConstraint}</td></tr>; })}</tbody></table>}
          {compare.some(Boolean) && <p>Thresholds on debt basis {usd(principal)}{origin.amountBasis === 'analyst_target' ? ' (analyst target)' : ' (recorded amount, not a payoff)'} under each alternative’s assumptions, model threshold-1. Actual NOI, payoff and funding gap remain unknown; the server recalculates on save.</p>}
        </section>
        <section className="case-section"><h2>Execution and outcome <InfoHint label="Execution fields">The next action and its owner keep the case moving. Lender or program review, agreements and documented outcomes are recorded here and backed by evidence entries; an outcome needs no engagement.</InfoHint></h2><div className="case-grid">
          <Text label="Next action" {...field('nextAction')} value={draft.nextAction} max={1000} onChange={v => setDraft({nextAction:v})} error={errors.nextAction} wide />
          <Text label="Action owner" {...field('nextActionOwner')} value={draft.nextActionOwner} max={200} onChange={v => setDraft({nextActionOwner:v})} error={errors.nextActionOwner} />
          <label><span>Target date</span><input {...field('nextActionDue')} type="date" value={draft.nextActionDue ?? ''} onChange={e => setDraft({nextActionDue: e.target.value || null})} />{errors.nextActionDue && <span className="field-error" id="nextActionDue-error">{errors.nextActionDue}</span>}</label>
          <Text label="Lender / program review" {...field('lenderProgramReview')} value={draft.lenderProgramReview} max={4000} rows={3} onChange={v => setDraft({lenderProgramReview:v})} error={errors.lenderProgramReview} wide hint="Applicable lender terms or program rules actually reviewed, with dates, backed by an evidence entry. A published program is not loan approval." />
          <Text label="Agreement" {...field('agreementNote')} value={draft.agreementNote} max={4000} rows={2} onChange={v => setDraft({agreementNote:v})} error={errors.agreementNote} wide hint="The executed agreement, backed by an evidence entry linked to the executed-agreement claim." />
          <Text label="Documented outcome" {...field('outcomeNote')} value={draft.outcomeNote} max={4000} rows={2} onChange={v => setDraft({outcomeNote:v})} error={errors.outcomeNote} wide hint="What actually happened, with its date and scope, backed by an evidence entry linked to the documented-outcome claim. Ordinary refinancing and no action are outcomes too." />
          <Text label="Rejection or deferral reason" {...field('rejectionReason')} value={draft.rejectionReason} max={4000} rows={2} onChange={v => setDraft({rejectionReason:v})} error={errors.rejectionReason} wide />
          <Text label="Conditions to reconsider" {...field('reconsiderConditions')} value={draft.reconsiderConditions} max={2000} rows={2} onChange={v => setDraft({reconsiderConditions:v})} error={errors.reconsiderConditions} wide />
          <Money label="Collected USD" {...field('collectedCents')} value={money.collectedCents} onChange={v => setMoney('collectedCents', v)} error={errors.collectedCents} />
          <Money label="Realized cost USD" {...field('realizedCostCents')} value={money.realizedCostCents} onChange={v => setMoney('realizedCostCents', v)} error={errors.realizedCostCents} />
        </div></section>
        <div className="case-save">{Object.keys(errors).length > 0 && <ul className="case-error-list">{Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#${k}`}>{v}</a></li>)}</ul>}<div className="case-save-row"><label><span>Why this version is being saved</span><input {...field('reason')} required maxLength={10000} value={reason} onChange={e => setReason(e.target.value)} placeholder="What changed, or what was decided" />{errors.reason && <span className="field-error" id="reason-error">{errors.reason}</span>}</label><button type="submit" disabled={busy}>{busy ? 'Saving…' : `Save version ${data.current.version + 1}`}</button></div><p>Saving appends a version as {CASE_STATE_LABELS[state]}. Version {data.current.version} and the research origin stay unchanged.</p></div>
      </form>
      <aside>
        <section className="case-section"><h2>Research origin <InfoHint label="About the origin">Copied from the source snapshot when the case opened, together with the research filters in force. Later imports do not change it. Recorded amounts are observations, not current obligations.</InfoHint></h2>
          <p className="case-trigger">{describeTrigger(origin)}</p>
          <div className="inspector-context"><ContextBadge label={origin.trigger.kind === 'recorded_maturity' ? 'Research lead: reported maturity' : origin.trigger.kind === 'recorded_instrument' ? 'Research lead: recorded instrument' : 'Property record'} tone="warning">{origin.trigger.note}</ContextBadge>{origin.debt && origin.debt.sharedPropertyCount > 1 && <ContextBadge label={`Shared across ${origin.debt.sharedPropertyCount} records`} tone="warning">The debt basis uses the entire recorded instrument with no allocation to this property.</ContextBadge>}{origin.debt?.instrumentConflict && <ContextBadge label="Conflicting terms" tone="warning">Source entries for this instrument disagree; the screener excludes it from grouped totals.</ContextBadge>}{origin.property.needsReview && <ContextBadge label="Source conflicts" tone="warning">Source records disagreed or contained unresolved associations when captured.</ContextBadge>}</div>
          <dl><dt>Source snapshot</dt><dd>{date(origin.sourceDate)}</dd><dt>Imported</dt><dd>{date(origin.importedAt)}</dd><dt>Captured</dt><dd>{stamp(origin.capturedAt)}</dd><dt>Provider record retrieved</dt><dd>{date(origin.property.retrievedAt)}</dd><dt>Provider update</dt><dd>{date(origin.property.providerDate)}</dd><dt>Reported owner</dt><dd>{origin.property.owner ?? 'Not reported'}</dd><dt>Provider units</dt><dd>{number(origin.property.providerUnits)}</dd><dt>Licensed units</dt><dd>{origin.property.licensedUnits?.join(' / ') || 'Not reported'}</dd><dt>OZ nomination</dt><dd>{origin.property.oz === 'eligible' ? 'Eligible tract' : origin.property.oz === 'not_in_list' ? 'Not in list' : 'Unresolved'}</dd></dl>
          <h3>Captured filters</h3>{filters === null ? <p>Filters were not captured for this origin.</p> : filters.length ? <ul className="case-query">{filters.map(([k, v]) => <li key={k}>{k}: {typeof v === 'string' ? v : JSON.stringify(v)}</li>)}</ul> : <p>Default filters: the full acquired universe.</p>}
          {origin.debt && <><h3>Recorded instrument</h3><DebtNotes debt={origin.debt} asOf={origin.scenario.asOf}/><dl><dt>Lender</dt><dd>{origin.debt.lender ?? 'Not reported'}</dd><dt>Recorded amount</dt><dd>{usd(origin.debt.amountCents)}</dd><dt>Recorded</dt><dd>{date(origin.debt.recordingDate)}</dd><dt>Reported maturity</dt><dd>{date(origin.debt.maturity)}</dd><dt>Reported rate (raw)</dt><dd>{origin.debt.reportedRate ?? 'Not reported'}</dd><dt>Document</dt><dd>{origin.debt.documentNumber ?? 'Not reported'}</dd><dt>Scope</dt><dd>{origin.debt.sharedPropertyCount} provider record{origin.debt.sharedPropertyCount === 1 ? '' : 's'}</dd><dt>Grouping</dt><dd>{origin.debt.instrumentConflict ? 'Conflicting terms' : origin.debt.instrumentKey ? 'County + document' : 'Unresolved'}</dd></dl></>}
          {!!origin.fields?.length&&<details><summary>Provider fields at capture</summary>{origin.fields.map(f=><p key={f.path}>{f.group?f.group+' / ':''}{f.label}: {f.value??'Not reported'}<br/><code>{f.path}</code> ? Source {f.sourceId}</p>)}</details>}
          {!origin.basisVersion&&origin.threshold&&<p role="note">Historical calculation captured under the earlier debt-selection policy. Its loan qualification fields may be unavailable; review a newly prepared snapshot before relying on the recorded basis.</p>}
          {origin.threshold && <><h3>Threshold at capture <InfoHint label="Threshold at capture">Required NOI and collateral value for the debt basis under the assumptions in force when the case opened. Model threshold-1; not observed operations or payoff.</InfoHint></h3><dl className="threshold-results"><dt>Debt basis</dt><dd>{usd(origin.principalCents)} {origin.amountBasis === 'analyst_target' ? '(target)' : '(recorded)'}</dd><dt>Required NOI / year</dt><dd>{usd(origin.threshold.requiredNoiCents)}</dd><dt>Required collateral value</dt><dd>{usd(origin.threshold.requiredValueCents)}</dd><dt>Annual debt service</dt><dd>{usd(origin.threshold.annualDebtServiceCents)}</dd><dt>Balloon at term</dt><dd>{usd(origin.threshold.balloonCents)}</dd><dt>Binding income test</dt><dd>{origin.threshold.bindingIncomeConstraint}</dd></dl><div className="inspector-context"><ContextBadge label={`${(origin.scenario.annualRate*100).toFixed(2)}% · ${origin.scenario.termMonths} months`}><dl><dt>As of</dt><dd>{origin.scenario.asOf}</dd><dt>Payment basis</dt><dd>{origin.scenario.interestOnly ? 'Interest-only' : origin.scenario.amortizationMonths + ' months amortization'}</dd><dt>DSCR after reserves</dt><dd>{origin.scenario.minDscr}×</dd><dt>Debt yield</dt><dd>{(origin.scenario.minDebtYield*100).toFixed(1)}%</dd><dt>Maximum LTV</dt><dd>{(origin.scenario.maxLtv*100).toFixed(0)}%</dd><dt>Annual reserves</dt><dd>{usd(origin.scenario.annualReserveCents)}</dd></dl></ContextBadge></div></>}
          <h3>Sources</h3>{origin.sources.length ? origin.sources.map(s => <details key={s.id}><summary>{s.provider} · {date(s.retrievedAt)}</summary><dl><dt>Record</dt><dd>{s.id}</dd><dt>Date basis</dt><dd>{s.dateBasis}</dd><dt>SHA-256</dt><dd><code>{s.sha256}</code></dd><dt>Snapshot locator</dt><dd>{s.locator}</dd></dl><a href={s.url} target="_blank" rel="noreferrer">Source endpoint ↗</a></details>) : <p>No source records were attached to the property detail at capture.</p>}
          <p>Snapshot <code>{origin.snapshotId.slice(0,12)}</code> · record {origin.property.id}</p>
        </section>
        <section className="case-section case-versions"><h2>Version history <InfoHint label="Version history">Every save is a new version with its actor, time and reason. Earlier versions remain readable; nothing is edited in place.</InfoHint></h2><table><thead><tr><th>V</th><th>State</th><th>Reason</th><th>Saved UTC</th></tr></thead><tbody>{data.versions.map(v => <VersionRow key={v.version} version={v} />)}</tbody></table></section>
      </aside>
    </div>
  </div>;
}

function VersionRow({ version: v }: { version: CaseVersion }) {
  const c = {...emptyCaseContent(v.content.label), ...v.content} as CaseContent;
  return <tr><td>{v.version}</td><td><span className={`case-state state-${v.state}`}>{CASE_STATE_LABELS[v.state]}</span></td><td><details><summary>{v.reason}</summary><dl><dt>Name</dt><dd>{c.label}</dd><dt>Lane</dt><dd>{CASE_LANE_LABELS[v.lane]}</dd><dt>Payer / role</dt><dd>{PAYER_LABELS[c.payerType]} / {ROLE_LABELS[c.operatorRole]}</dd><dt>Deadline basis</dt><dd>{DEADLINE_LABELS[c.deadlineBasis]}</dd><dt>Evidence entries</dt><dd>{c.evidence.length ? c.evidence.map(e => `${e.id}: ${e.claims.map(cl => EVIDENCE_CLAIM_LABELS[cl]).join(', ')} (${EVIDENCE_RELATION_LABELS[e.relation]}, ${e.locator})`).join('; ') : 'None'}</dd><dt>Rejection test</dt><dd>{c.rejectionTest || '—'}</dd><dt>Fee</dt><dd>{FEE_LABELS[c.feeStatus]} · proposed {usd(c.proposedFeeCents)} · agreed {c.agreedFeeCents === null ? (c.agreedTermsNote || '—') : usd(c.agreedFeeCents)}</dd><dt>Cash / guarantee</dt><dd>{usd(c.cashRequiredCents)} / {usd(c.guaranteeExposureCents)}</dd><dt>Billed / collected</dt><dd>{usd(c.billedCents)} / {usd(c.collectedCents)}</dd><dt>Missing inputs</dt><dd>{c.missingInputs.length ? c.missingInputs.map(m => MISSING_INPUT_LABELS[m]).join(', ') : 'Not assessed'}</dd><dt>Alternatives</dt><dd>{c.alternatives.length ? c.alternatives.map(a => `${a.kind === 'other' ? a.label : ALTERNATIVE_LABELS[a.kind]} (${ALTERNATIVE_STATE_LABELS[a.status]}${a.result ? `, required NOI ${usd(a.result.requiredNoiCents)}` : ''})`).join('; ') : 'None'}</dd><dt>Supporting</dt><dd>{c.supportingEvidence || '—'}</dd><dt>Contrary</dt><dd>{c.contraryEvidence || '—'}</dd><dt>Next action</dt><dd>{c.nextAction || '—'}</dd>{c.agreementNote && <><dt>Agreement</dt><dd>{c.agreementNote}</dd></>}{c.outcomeNote && <><dt>Outcome</dt><dd>{c.outcomeNote}</dd></>}{c.rejectionReason && <><dt>Rejection / deferral</dt><dd>{c.rejectionReason}</dd></>}<dt>Model</dt><dd>{v.modelVersion}</dd></dl></details></td><td>{stamp(v.createdAt)}</td></tr>;
}

function Text({ label, value, onChange, error, rows, max, hint, wide, ...rest }: { label:string; value:string; onChange:(v:string)=>void; error?:string; rows?:number; max:number; hint?:string; wide?:boolean; id:string; 'aria-invalid'?:boolean; 'aria-describedby'?:string }) {
  return <label className={wide ? 'wide' : ''}><span>{label}{hint && <InfoHint label={`${label} help`}>{hint}</InfoHint>}</span>{rows ? <textarea {...rest} rows={rows} maxLength={max} value={value} onChange={e => onChange(e.target.value)} /> : <input {...rest} maxLength={max} value={value} onChange={e => onChange(e.target.value)} />}{error && <span className="field-error" id={`${rest.id}-error`}>{error}</span>}</label>;
}
function Choice<const T extends readonly string[]>({ label, value, options, labels, onChange, error, ...rest }: { label:string; value:T[number]; options:T; labels:Record<T[number],string>; onChange:(v:string)=>void; error?:string; id:string; 'aria-invalid'?:boolean; 'aria-describedby'?:string }) {
  return <label><span>{label}</span><select {...rest} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o} value={o}>{labels[o as T[number]]}</option>)}</select>{error && <span className="field-error" id={`${rest.id}-error`}>{error}</span>}</label>;
}
function Money({ label, value, onChange, error, ...rest }: { label:string; value:string; onChange:(v:string)=>void; error?:string; id:string; 'aria-invalid'?:boolean; 'aria-describedby'?:string }) {
  return <label><span>{label}</span><input {...rest} inputMode="decimal" placeholder="Unknown" value={value} onChange={e => onChange(e.target.value)} />{error && <span className="field-error" id={`${rest.id}-error`}>{error}</span>}</label>;
}
