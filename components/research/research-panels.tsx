'use client';
// The list panel's other tabs: Lenders, Cases and Sources (coverage, balance sources, imports and the license inventory).
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { BALANCE_SOURCE_LABELS } from '../../lib/research/balance-estimate';
import { CASE_STATE_LABELS, type StrategyCaseSummary } from '../../lib/research/case-model';
import type { ResearchResult } from '../../lib/research/types';
import type { DebtRun } from '../../lib/research/debt-sources';
import { dateLabel, int, useJson } from './oz-eb5-parts';
import { usdShort } from './format';

export function LendersPanel({ result, onLender }: { result: ResearchResult; onLender: (name: string) => void }) {
  return <div className="oz-panel"><table className="oz-stbl"><thead><tr><th>Lender</th><th className="r">Loans</th><th className="r">Properties</th><th className="r">Recorded</th><th className="r">With maturity</th></tr></thead>
    <tbody>{result.lenders.map(l => <tr key={l.name} tabIndex={0} onClick={() => onLender(l.name)} onKeyDown={e => { if (e.key === 'Enter') onLender(l.name); }}>
      <td>{l.name}</td><td className="r">{int(l.instrumentGroups)}</td><td className="r">{int(l.properties)}</td><td className="r">{usdShort(l.recordedAmountCents)}</td><td className="r">{int(l.datedMaturities)}</td>
    </tr>)}</tbody></table></div>;
}

export function CasesPanel({ result, revision, selected, onSelect }: { result: ResearchResult; revision: number; selected: string; onSelect: (id: string) => void }) {
  const cases = useJson<StrategyCaseSummary[]>('/api/research/cases', revision);
  const inResult = new Set(result.rows.map(r => r.id));
  return <div className="oz-panel">
    {cases.error && <div className="oz-alert" role="alert">{cases.error}</div>}
    {cases.data && cases.data.length === 0 && <div className="oz-empty-state"><h2>No strategy cases</h2><p>Open one from a property&apos;s drawer.</p></div>}
    {!!cases.data?.length && <table className="oz-stbl"><thead><tr><th>Case</th><th>State</th><th>Property</th><th>Maturity</th><th>Updated</th></tr></thead>
      <tbody>{cases.data.map(c => <tr key={c.id} className={c.propertyId === selected ? 'sel' : undefined}>
        <td><Link className="rs-a" href={`/research/cases/${encodeURIComponent(c.id)}`}>{c.label}</Link></td>
        <td>{CASE_STATE_LABELS[c.state]}</td>
        <td>{inResult.has(c.propertyId) ? <button type="button" className="oz-link" onClick={() => onSelect(c.propertyId)}>{c.address}</button> : <span>{c.address}<span className="rs-sub">Not in these filters</span></span>}</td>
        <td>{dateLabel(c.reportedMaturity)}</td><td>{dateLabel(c.versionAt)}</td>
      </tr>)}</tbody></table>}
    <p className="rs-pad"><Link className="rs-a" href="/research/cases">All cases</Link></p>
  </div>;
}

type Run = { id: string; status: string; started_at: string; snapshot_id: string; detail: Record<string, number | string> };
type License = { id: string; name: string; address: string; county: string; units: number | null; status: string; associations: number; retrievedAt: string; url: string };
export function SourcesPanel({ result, revision }: { result: ResearchResult; revision: number }) {
  const runs = useJson<Run[]>('/api/research/history', revision);
  const [text, setText] = useState(''), [unmatched, setUnmatched] = useState(true);
  const licenses = useJson<License[]>(`/api/research/licenses?${new URLSearchParams({ snapshot: result.snapshotId, text, unmatched: String(unmatched) })}`, revision);
  const run = useJson<DebtRun | null>('/api/research/debt/run', revision);
  const c = result.coverage, b = result.balanceCoverage;
  const k = (run.data?.counts ?? {}) as { coverage?: Record<string, { confirmed: number; any: number }>; mortgagedProperties?: number; anySource?: number; hudLoans?: number; hudActive?: number; cmbsTrusts?: number; cmbsRecords?: number; releases?: number; clerkDays?: number };
  return <div className="oz-panel">
    <dl className="rs-stats">
      <div><dt>Properties</dt><dd>{int(result.total)}<span className="rs-sub">of {int(result.universe)}</span></dd></div>
      <div><dt>With mortgages</dt><dd>{int(c.mortgageProperties)}</dd></div>
      <div><dt>Scenario bases</dt><dd>{int(c.scenarioProperties)}</dd></div>
      <div><dt>OZ eligible</dt><dd>{int(c.eligibleProperties)}</dd></div>
    </dl>
    <h3 className="rs-h3">Balance source</h3>
    <table className="oz-stbl"><thead><tr><th>Source</th><th className="r">Properties</th></tr></thead>
      <tbody>{(['servicer', 'provider_estimate', 'estimate', 'recorded', 'none'] as const).map(k => <tr key={k}><td>{BALANCE_SOURCE_LABELS[k]}</td><td className="r">{int(b[k])}</td></tr>)}</tbody></table>
    <h3 className="rs-h3">Loan sources</h3>
    {run.data ? <>
      <p className="oz-dr-note rs-pad">{`Matched properties out of ${int(k.mortgagedProperties)} with mortgages; ${int(k.anySource)} have at least one source.`}</p>
      <table className="oz-stbl"><thead><tr><th>Source</th><th className="r">Confirmed</th><th className="r">Any match</th><th className="r">Records</th></tr></thead>
        <tbody>
          <tr><td>HUD FHA loans</td><td className="r">{int(k.coverage?.hud?.confirmed)}</td><td className="r">{int(k.coverage?.hud?.any)}</td><td className="r">{int(k.hudLoans)}</td></tr>
          <tr><td>CMBS loans (SEC)</td><td className="r">{int(k.coverage?.cmbs?.confirmed)}</td><td className="r">{int(k.coverage?.cmbs?.any)}</td><td className="r">{int(k.cmbsRecords)}</td></tr>
          <tr><td>County releases</td><td className="r">{int(k.coverage?.release?.confirmed)}</td><td className="r">{int(k.coverage?.release?.any)}</td><td className="r">{int(k.releases)}</td></tr>
        </tbody></table>
      <table className="oz-stbl"><thead><tr><th>In these filters</th><th className="r">Properties</th></tr></thead>
        <tbody>
          <tr><td>Linked to HUD</td><td className="r">{int(result.debtCoverage.hud)}</td></tr>
          <tr><td>Linked to CMBS</td><td className="r">{int(result.debtCoverage.cmbs)}</td></tr>
          <tr><td>County release</td><td className="r">{int(result.debtCoverage.release)}</td></tr>
          <tr><td>Special servicing</td><td className="r">{int(result.debtCoverage.specialServicing)}</td></tr>
          <tr><td>Released (verified)</td><td className="r">{int(result.debtCoverage.released)}</td></tr>
        </tbody></table>
    </> : !run.loading && <p className="oz-dr-note rs-pad">Not imported</p>}
    <h3 className="rs-h3">Counties</h3>
    <table className="oz-stbl"><thead><tr><th>County</th><th className="r">Properties</th><th className="r">Licenses</th></tr></thead>
      <tbody>{result.countyCoverage.map(x => <tr key={x.fips}><td>{x.name}</td><td className="r">{int(x.properties)}</td><td className="r">{int(x.licenses)}</td></tr>)}</tbody></table>
    <h3 className="rs-h3">Imports</h3>
    {runs.error ? <div className="oz-alert" role="alert">{runs.error}</div> : <table className="oz-stbl"><thead><tr><th>Started</th><th>Outcome</th><th>Snapshot</th><th className="r">Properties</th></tr></thead>
      <tbody>{(runs.data ?? []).map(r => <tr key={r.id}><td>{dateLabel(r.started_at)}</td><td>{r.status}</td><td><code>{r.snapshot_id?.slice(0, 12)}</code></td><td className="r">{r.detail.properties ?? '—'}</td></tr>)}</tbody></table>}
    <h3 className="rs-h3">Licenses <span className="rs-sub">{int(licenses.data?.length ?? 0)}</span></h3>
    <div className="oz-panel-filters">
      <label className="oz-field oz-search"><Search size={18} aria-hidden="true" /><input aria-label="Search licenses" placeholder="License, name or address" value={text} onChange={e => setText(e.target.value)} /></label>
      <label className="oz-field oz-select"><span className="sr-only">License relationship</span><select aria-label="License relationship" value={unmatched ? 'unmatched' : 'all'} onChange={e => setUnmatched(e.target.value === 'unmatched')}><option value="unmatched">No property record</option><option value="all">All licenses</option></select><ChevronDown size={18} aria-hidden="true" /></label>
    </div>
    {licenses.error && <div className="oz-alert" role="alert">{licenses.error}</div>}
    <table className="oz-stbl"><thead><tr><th>License</th><th>Name</th><th>County</th><th className="r">Units</th><th className="r">Links</th></tr></thead>
      <tbody>{(licenses.data ?? []).slice(0, 300).map(l => <tr key={l.id}><td><a className="rs-a" href={l.url} target="_blank" rel="noreferrer">{l.id}</a></td><td><div className="oz-t2"><span className="a">{l.name}</span><span className="b">{l.address}</span></div></td><td>{l.county}</td><td className="r">{int(l.units)}</td><td className="r">{int(l.associations)}</td></tr>)}</tbody></table>
    {(licenses.data?.length ?? 0) > 300 && <p className="oz-dr-note rs-pad">First 300 shown. Search to narrow.</p>}
  </div>;
}
