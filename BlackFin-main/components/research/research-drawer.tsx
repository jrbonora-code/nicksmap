'use client';
// The property drawer: the OZ page's drawer frame with field and value rows. Every value is a saved observation or a
// labelled calculation; a missing value reads as a dash. Source text and field paths sit in the collapsed Basis block.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { debtAmountWarnings, debtBasisNotes, usableRecordedAmount } from '../../lib/research/debt';
import { financingThreshold } from '../../lib/research/finance';
import { BALANCE_SOURCE_LABELS, debtEstimate, estimateBalance } from '../../lib/research/balance-estimate';
import { CASE_STATE_LABELS, emptyCaseContent, type StrategyCaseSummary } from '../../lib/research/case-model';
import type { DebtRecord, PropertyDetail, ResearchQuery, Scenario, ScreenRow } from '../../lib/research/types';
import { DrawerTop, Ext, type DrawerChrome } from './oz-eb5-drawer';
import { Fv, dateLabel, int, useJson } from './oz-eb5-parts';
import { splitAddress } from './research-list';
import { usd, usdShort } from './format';
import { ServicerSections } from './servicer-sections';
import { releasedVerified } from '../../lib/research/debt-sources';

export type Selection = { propertyId: string; debtId: string | null; principalCents: number; amountBasis?: 'original_recorded_amount' | 'analyst_target' };
const range = (low: number, high: number) => `${usdShort(low)}–${usdShort(high)}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const OZ_LABEL = { eligible: 'Eligible', not_in_list: 'Not eligible', unmapped: 'Unresolved', ambiguous: 'Unresolved' } as const;

function Loan({ d, asOf, history = false }: { d: DebtRecord; asOf: string; history?: boolean }) {
  const e = history ? null : debtEstimate(d, asOf);
  const notes = debtBasisNotes(d, asOf);
  return <details className="oz-prop"><summary><span>{d.lender ?? 'Lender not reported'}</span><span className="u">{usdShort(d.amountCents)}</span></summary>
    <dl className="oz-fv">
      <Fv label="Recorded amount">{d.amountCents === null ? null : usd(d.amountCents)}</Fv>
      <Fv label="Recorded">{d.recordingDate ? dateLabel(d.recordingDate) : null}</Fv>
      <Fv label="Maturity">{d.maturity ? <>{dateLabel(d.maturity)}{d.maturity < asOf && <span className="s">Passed</span>}</> : null}</Fv>
      {!history && <Fv label="Estimate">{e ? range(e.lowCents, e.highCents) : debtAmountWarnings(d).length ? 'Amount not usable' : null}</Fv>}
      <Fv label="Reported rate">{Number(d.reportedRate) > 0 ? d.reportedRate : null}</Fv>
      <Fv label="Lien position">{d.position}</Fv>
      <Fv label="Loan type">{d.loanType}</Fv>
      <Fv label="Lender type">{d.lenderType}</Fv>
      <Fv label="Document">{d.documentNumber}</Fv>
      <Fv label="Provider open flag">{d.providerOpen === true ? 'Open' : d.providerOpen === false ? 'Closed' : null}</Fv>
      {!history && <Fv label="Property records">{int(d.sharedPropertyCount)}</Fv>}
      {notes.map(n => <div key={n} className="oz-fv-row"><dt>Note</dt><dd>{n}</dd></div>)}
    </dl>
  </details>;
}

export function PropertyDrawer({ row, detail, detailError, scenario, query, snapshotId, replay, chrome, onSave, onMessage }: {
  row: ScreenRow; detail: PropertyDetail | null; detailError: string; scenario: Scenario; query: ResearchQuery; snapshotId: string;
  replay: Selection | null; chrome: DrawerChrome; onSave: (s: Selection) => void; onMessage: (m: string) => void;
}) {
  const router = useRouter();
  const [debtId, setDebtId] = useState(replay?.propertyId === row.id ? replay.debtId ?? '' : row.scenarioDebt?.id ?? '');
  const [custom, setCustom] = useState(replay?.propertyId === row.id && replay.amountBasis === 'analyst_target' ? String(replay.principalCents / 100) : '');
  const [opening, setOpening] = useState(false);
  const [caseRevision, setCaseRevision] = useState(0);
  const caseRequest = useRef<string | null>(null);
  const cases = useJson<StrategyCaseSummary[]>(`/api/research/cases?property=${encodeURIComponent(row.id)}`, caseRevision);
  const debt = row.mortgages.find(d => d.id === debtId) ?? null;
  const principal = custom !== '' ? Math.round(Number(custom) * 100) : debt && usableRecordedAmount(debt) ? debt.amountCents : null;
  let calculation: ReturnType<typeof financingThreshold> | null = null, calcError = '';
  try { if (principal !== null) calculation = financingThreshold(principal, scenario); } catch (e) { calcError = e instanceof Error ? e.message : 'Unsupported amount.'; }
  const base = row.scenarioDebt;
  const estimate = base ? estimateBalance(base.amountCents, base.recordingDate, scenario.asOf) : null;
  const pe = row.providerEstimate;
  const { street, place } = splitAddress(row.address);

  async function openCase() {
    if (opening) return;
    if (custom !== '' && (principal === null || !Number.isSafeInteger(principal) || principal <= 0)) { onMessage('Enter a supported analyst target before opening a case, or clear the override.'); return; }
    caseRequest.current ??= crypto.randomUUID(); setOpening(true);
    try {
      const label = `${row.address.slice(0, 120)} (${debt ? 'financing lead' : 'research lead'})`;
      const r = await fetch('/api/research/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: caseRequest.current, snapshotId, propertyId: row.id, debtId: debt?.id ?? null, principalCents: custom !== '' ? principal : null, scenario, query, state: 'observed_lead', content: emptyCaseContent(label), reason: 'Opened from the research record as an observed lead.' }) });
      const body = await r.json(); if (!r.ok) throw Error(body.error ?? 'Could not open the case.');
      caseRequest.current = null; onMessage(body.message); setCaseRevision(v => v + 1); router.push(`/research/cases/${encodeURIComponent(body.id)}`);
    } catch (e) { onMessage(e instanceof Error ? e.message : 'Could not open the case.'); } finally { setOpening(false); }
  }

  const groups = detail ? Array.from(new Set(detail.fields.map(f => f.group).filter((g): g is string => !!g))) : [];
  return <aside className="oz-drawer" aria-label="Property detail">
    <DrawerTop {...chrome} />
    <div className="oz-dr-body">
      <h2 className="oz-dr-title">{street}</h2>
      <div className="oz-dr-id"><span>{place}</span><span>{row.countyName}</span></div>

      <section className="oz-dr-sec"><h3>Balance</h3><dl className="oz-fv">
        <Fv label="Best figure">{row.balance ? <>{row.balance.lowCents !== undefined ? range(row.balance.lowCents, row.balance.highCents!) : usd(row.balance.cents)}<span className="s">{row.balance.source === 'servicer' ? `${BALANCE_SOURCE_LABELS.servicer}, ${row.balance.via === 'hud' ? 'HUD' : 'CMBS'}${row.balance.asOf ? ` ${dateLabel(row.balance.asOf)}` : ''}` : BALANCE_SOURCE_LABELS[row.balance.source]}</span></> : null}</Fv>
        {row.servicer && <Fv label="Released">{releasedVerified(row.servicer) ? 'Yes, verified' : row.servicer.releases.length ? 'Probable' : 'Not found'}</Fv>}
        <Fv label="Provider estimate">{pe?.mortgageBalanceCents ? usd(pe.mortgageBalanceCents) : null}</Fv>
        <Fv label="Provider open total">{pe?.openMortgageCents ? usd(pe.openMortgageCents) : null}</Fv>
        <Fv label="Provider equity">{pe?.equityCents ? <>{usd(pe.equityCents)}{pe.equityPercent !== null && <span className="s">{pe.equityPercent}% of provider value</span>}</> : null}</Fv>
        <Fv label="Estimate">{estimate ? range(estimate.lowCents, estimate.highCents) : null}</Fv>
        {estimate && <Fv label="Treasury at recording">{`${pct(estimate.treasuryPct)} (${dateLabel(estimate.treasuryMonth + '-15').replace(/^\d+ /, '')})`}</Fv>}
        <Fv label="Recorded amount">{base?.amountCents ? usd(base.amountCents) : null}</Fv>
        <Fv label="As of">{dateLabel(scenario.asOf)}</Fv>
      </dl></section>

      <section className="oz-dr-sec"><h3>Loans <span className="n">{int(row.mortgages.length)}</span></h3>
        {row.mortgages.length ? row.mortgages.map(d => <Loan key={d.id} d={d} asOf={scenario.asOf} />) : <p className="oz-dr-note">No mortgage entries</p>}
      </section>

      <ServicerSections servicer={row.servicer} />

      <section className="oz-dr-sec"><h3>Financing threshold</h3>
        <div className="rs-form">
          <label><span>Loan</span><select value={debtId} onChange={e => { setDebtId(e.target.value); setCustom(''); }}><option value="">Choose a recorded loan</option>{row.mortgages.map(d => <option key={d.id} value={d.id}>{`${usdShort(d.amountCents)}, ${d.lender ?? 'lender not reported'}, ${dateLabel(d.recordingDate)}`}</option>)}</select></label>
          <label><span>Analyst target USD</span><input type="number" min="0" step=".01" placeholder={debt && usableRecordedAmount(debt) ? String(debt.amountCents! / 100) : ''} value={custom} onChange={e => setCustom(e.target.value)} /></label>
        </div>
        {calcError && <p className="oz-dr-note" role="alert">{calcError}</p>}
        <dl className="oz-fv">
          <Fv label="Basis">{custom !== '' ? 'Analyst target' : debt ? (usableRecordedAmount(debt) ? 'Recorded amount' : 'Amount not usable') : null}</Fv>
          {calculation && <>
            <Fv label="Required NOI">{usd(calculation.requiredNoiCents)}<span className="s">per year, {calculation.bindingIncomeConstraint.toLowerCase()}</span></Fv>
            <Fv label="Required value">{usd(calculation.requiredValueCents)}</Fv>
            <Fv label="Debt service">{usd(calculation.annualDebtServiceCents)}<span className="s">{usd(calculation.monthlyDebtServiceCents)} a month</span></Fv>
            <Fv label="Balloon">{usd(calculation.balloonCents)}</Fv>
            <Fv label="Assumptions">{`${pct(scenario.annualRate * 100)}, ${scenario.termMonths} months, ${scenario.interestOnly ? 'interest-only' : `${scenario.amortizationMonths}-month amortization`}`}<span className="s">{`DSCR ${scenario.minDscr}, debt yield ${(scenario.minDebtYield * 100).toFixed(1)}%, LTV ${(scenario.maxLtv * 100).toFixed(0)}%`}</span></Fv>
            {[-0.01, 0.01].map(delta => { const rate = scenario.annualRate + delta; if (rate < 0 || rate > 0.5) return null; return <Fv key={delta} label={`At ${pct(rate * 100)}`}>{usd(financingThreshold(principal!, { ...scenario, annualRate: rate }).requiredNoiCents)}</Fv>; })}
          </>}
        </dl>
      </section>

      <section className="oz-dr-sec"><h3>Strategy cases <span className="n">{int(cases.data?.length ?? 0)}</span></h3>
        {cases.error ? <p className="oz-dr-note" role="alert">{cases.error}</p> : cases.data?.length ? <dl className="oz-fv">{cases.data.map(c => <Fv key={c.id} label={CASE_STATE_LABELS[c.state]}><Link href={`/research/cases/${encodeURIComponent(c.id)}`}>{c.label}</Link><span className="s">Version {c.version}, {dateLabel(c.versionAt)}</span></Fv>)}</dl> : !cases.loading && <p className="oz-dr-note">None opened</p>}
      </section>

      <section className="oz-dr-sec"><h3>Property</h3><dl className="oz-fv">
        <Fv label="Owner">{row.owner}</Fv>
        <Fv label="Parcel ID">{row.apn}</Fv>
        <Fv label="Units">{row.providerUnits === null ? null : int(row.providerUnits)}</Fv>
        <Fv label="Licensed units">{row.licensedUnits.join(' / ') || null}</Fv>
        <Fv label="Year built">{row.yearBuilt === null ? null : String(row.yearBuilt)}</Fv>
        <Fv label="Provider value">{row.estimatedValueCents ? usd(row.estimatedValueCents) : null}</Fv>
        <Fv label="Property type">{row.propertyType}</Fv>
        <Fv label="Address link">{row.strictAddress ? 'Consistent' : 'Review'}</Fv>
        <Fv label="Retrieved">{dateLabel(row.retrievedAt)}</Fv>
        <Fv label="Provider update">{row.providerDate ? dateLabel(row.providerDate) : null}</Fv>
      </dl></section>

      <section className="oz-dr-sec"><h3>Opportunity Zone</h3><dl className="oz-fv">
        <Fv label="2020 tract">{row.tractId ? <code>{row.tractId}</code> : null}</Fv>
        <Fv label="2027 round">{OZ_LABEL[row.oz]}</Fv>
        <Fv label="OZ-rural">{row.rural === null ? null : row.rural ? 'Yes' : 'No'}</Fv>
      </dl></section>

      {detailError && <p className="oz-dr-note" role="alert">{detailError}</p>}
      {!detail && !detailError && <p className="oz-dr-note" role="status">Loading</p>}
      {detail && <>
        {detail.licenses.length > 0 && <section className="oz-dr-sec"><h3>Licenses <span className="n">{int(detail.licenses.length)}</span></h3>
          {detail.licenses.map(l => <details key={l.license} className="oz-prop"><summary><span>{l.name}</span><span className="u">{l.units === null ? '—' : `${int(l.units)} units`}</span></summary><dl className="oz-fv">
            <Fv label="License">{l.license}</Fv><Fv label="Address">{l.address}</Fv><Fv label="Relationship">{l.status.replaceAll('_', ' ')}</Fv>
            <Fv label="License status">{l.primaryStatus === '45' ? 'Licensing delinquency' : l.primaryStatus}</Fv><Fv label="Expires">{l.expiry ? dateLabel(l.expiry) : null}</Fv>
            {l.flags.map(f => <div key={f} className="oz-fv-row"><dt>Flag</dt><dd>{f.replaceAll('_', ' ')}</dd></div>)}
          </dl></details>)}
        </section>}
        {groups.map(group => <details key={group} className="oz-basis"><summary>{group.replace(/ \(provider\)$/, '')}</summary><dl className="oz-fv">
          {detail.fields.filter(f => f.group === group).map(f => <Fv key={f.path} label={f.label}>{f.value}</Fv>)}
        </dl></details>)}
        {row.mortgageHistory && row.mortgageHistory.length > 0 && <details className="oz-basis"><summary>Mortgage history <span className="rs-n">{int(row.mortgageHistory.length)}</span></summary>
          {row.mortgageHistory.map(d => <Loan key={d.id} d={d} asOf={scenario.asOf} history />)}
        </details>}
        <details className="oz-basis"><summary>Basis</summary><dl className="oz-fv">
          <Fv label="Provider ID">{row.providerId}</Fv>
          {detail.fields.filter(f => !f.group).map(f => <Fv key={f.path} label={f.label}><code>{f.path}</code></Fv>)}
          {detail.sources.map(s => <Fv key={s.id} label={s.provider}><Ext href={s.url}>{dateLabel(s.retrievedAt)}</Ext><span className="s"><code>{s.sha256.slice(0, 16)}</code></span><span className="s">{s.locator}</span></Fv>)}
        </dl></details>
      </>}
    </div>
    <div className="oz-dr-foot">
      <button type="button" className="oz-btn primary" disabled={opening} onClick={() => void openCase()}><FolderPlus size={18} aria-hidden="true" />{opening ? 'Opening' : 'Open strategy case'}</button>
      <button type="button" className="oz-btn" disabled={!calculation} onClick={() => calculation && onSave({ propertyId: row.id, debtId: debt?.id ?? null, principalCents: principal!, amountBasis: custom !== '' ? 'analyst_target' : 'original_recorded_amount' })}>Save scenario</button>
    </div>
  </aside>;
}
