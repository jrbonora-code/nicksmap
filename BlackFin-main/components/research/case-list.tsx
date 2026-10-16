'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CASE_LANE_LABELS, CASE_STATES, CASE_STATE_LABELS, PAYER_LABELS, ROLE_LABELS, type CaseState, type StrategyCaseSummary } from '../../lib/research/case-model';
import { InfoHint, ContextBadge } from './context-note';
import { date, stamp, usd } from './format';
import './workspace.css';
import './cases.css';

/** Debt basis with its provenance and scope limits beside the amount, on every list surface. */
export function DebtBasis({ c }: { c: Pick<StrategyCaseSummary,'principalCents'|'amountBasis'|'sharedPropertyCount'|'instrumentConflict'> }) {
  if (c.principalCents === null) return <span className="case-basis"><span>—</span><ContextBadge label="No debt basis">No instrument or analyst target; financing alternatives are not compared.</ContextBadge></span>;
  return <span className="case-basis"><span>{usd(c.principalCents)}{c.amountBasis === 'analyst_target' ? ' (target)' : ''}</span>{c.amountBasis === 'analyst_target' && <ContextBadge label="Analyst target">Entered when the case opened; not an observed balance.</ContextBadge>}{c.sharedPropertyCount !== null && c.sharedPropertyCount > 1 && <ContextBadge label={`Shared × ${c.sharedPropertyCount}`} tone="warning">The instrument is observed on {c.sharedPropertyCount} provider records. The entire recorded amount is the basis; nothing is allocated to this property.</ContextBadge>}{c.instrumentConflict && <ContextBadge label="Conflicting terms" tone="warning">Source entries for this instrument disagree; it is excluded from the screener’s grouped totals.</ContextBadge>}</span>;
}

export function CaseList({ cases }: { cases: StrategyCaseSummary[] }) {
  const [state, setState] = useState<'all' | CaseState>('all');
  const [text, setText] = useState('');
  const rows = cases.filter(c => (state === 'all' || c.state === state) && (!text || [c.label, c.address, c.countyName].join(' ').toLowerCase().includes(text.toLowerCase())));
  const counts = Object.fromEntries(CASE_STATES.map(s => [s, cases.filter(c => c.state === s).length])) as Record<CaseState, number>;
  return <div className="research-workspace">
    <header className="case-heading"><div><Link href="/research" className="case-back"><ArrowLeft size={13} /> Property research</Link><h1>Strategy cases <InfoHint label="About strategy cases">Each case starts from one research property record and, where selected, one recorded instrument. Its origin never changes; every decision is an appended version. Open a case from the property inspector on the research page.</InfoHint></h1><div className="case-heading-meta"><span>{cases.length} saved</span>{CASE_STATES.filter(s => counts[s]).map(s => <span key={s}>{counts[s]} {CASE_STATE_LABELS[s].toLowerCase()}</span>)}</div></div></header>
    <div className="case-list-controls"><label>Find<input aria-label="Search cases" placeholder="Case, address or county" value={text} onChange={e => setText(e.target.value)} /></label><label>State<select aria-label="Filter by state" value={state} onChange={e => setState(e.target.value as 'all' | CaseState)}><option value="all">All states</option>{CASE_STATES.map(s => <option key={s} value={s}>{CASE_STATE_LABELS[s]}</option>)}</select></label><ContextBadge label="Research leads are not deals">A recorded maturity or instrument is why a record surfaced. It does not establish distress, availability, a payer or a fee until later versions document them.</ContextBadge></div>
    <div className="research-content"><div className="analysis-table">{rows.length ? <table><thead><tr><th>Case</th><th>State</th><th>Lane</th><th>Property</th><th>County</th><th>Debt basis USD</th><th>Reported maturity</th><th>Payer</th><th>Role</th><th>Next action</th><th>Missing inputs</th><th>Evidence</th><th>Version</th><th>Updated UTC</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><Link href={`/research/cases/${encodeURIComponent(c.id)}`}>{c.label}</Link></td><td><span className={`case-state state-${c.state}`}>{CASE_STATE_LABELS[c.state]}</span></td><td>{CASE_LANE_LABELS[c.lane]}</td><td>{c.address}</td><td>{c.countyName}</td><td><DebtBasis c={c} /></td><td>{date(c.reportedMaturity)}</td><td>{PAYER_LABELS[c.payerType]}</td><td>{ROLE_LABELS[c.operatorRole]}</td><td style={{whiteSpace:'normal',maxWidth:260}}>{c.nextAction || '—'}{c.nextActionDue && ` · by ${c.nextActionDue}`}</td><td>{c.missingInputs === 0 ? 'Not assessed' : c.missingInputs}</td><td>{c.evidenceEntries}</td><td>{c.version}</td><td>{stamp(c.versionAt)}</td></tr>)}</tbody></table> : <div className="case-list-empty">{cases.length ? 'No cases match these filters.' : 'No strategy cases yet. Select a property on the research page and open a case from its inspector.'}</div>}</div></div>
  </div>;
}
