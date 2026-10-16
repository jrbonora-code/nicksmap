'use client';
// "About this data" for the property page: the one place that carries caveats, definitions, sources and assumptions.
import { useEffect, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { ESTIMATE_RULE } from '../../lib/research/balance-estimate';
import { TREASURY_10Y } from '../../lib/research/treasury-10y-data';
import type { ResearchResult } from '../../lib/research/types';
import { dateLabel, int } from './oz-eb5-parts';

const month = (key: string) => dateLabel(`${key}-15`).replace(/^\d+ /, '');
export function ResearchAbout({ open, onClose, result, onReload }: { open: boolean; onClose: () => void; result: ResearchResult | null; onReload: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  const c = result?.coverage;
  return <dialog ref={dialog} className="oz-about" aria-label="About this data" onClose={onClose} onCancel={onClose}>
    <div className="oz-about-hd"><h2>About this data</h2><button type="button" className="oz-icon" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
    <div className="oz-about-body">
      <section><h3>What this page is</h3><ul>
        <li>Each row is a RealEstateAPI property record from a one-time acquisition in seven counties from Tampa to Naples, linked to Florida apartment licenses. A record is not a verified community, parcel or opportunity.</li>
        <li>Mortgages are recorded instruments as the provider reported them. A recorded amount is the original amount, not what is owed. Open and closed flags are not proof of payoff or release.</li>
        <li>A passed maturity does not mean default. &quot;No reported maturity&quot; means the provider did not report one; no maturity is estimated.</li>
        <li>Estimates are for screening only. They are never financing inputs, a recorded basis or a payoff.</li>
      </ul></section>
      <section><h3>Balance</h3><p>The Balance column shows the best available figure, in this order, with its source.</p><dl className="oz-fv">
        <dt>Servicer-reported</dt><dd>A confirmed match to an active HUD FHA loan (its amortized balance in HUD&apos;s monthly file) or to a single-property CMBS loan not paid off (its period-end balance in the trust&apos;s latest SEC filing). Notes of one loan held by several trusts are added.</dd>
        <dt>Provider estimate</dt><dd>RealEstateAPI <code>estimatedMortgageBalance</code>: the provider&apos;s estimate of what is owed on the open mortgages. Its method is not published.</dd>
        <dt>Estimate</dt><dd>Our range for the default recorded loan (rule below); the list sorts by its midpoint.</dd>
        <dt>Recorded amount</dt><dd>The default loan&apos;s original recorded amount, when it has no recording date.</dd>
        <dt>Default loan</dt><dd>The usable recorded loan on this record only: first liens first, then the newest recording. Aggregate, truncated, conflicting, possible duplicate, provider-closed and shared loans are not used. Loans are never summed.</dd>
        <dt>Provider open total</dt><dd>RealEstateAPI <code>openMortgageBalance</code>: the total of open recorded amounts, not amortized.</dd>
        <dt>Provider equity</dt><dd>RealEstateAPI <code>estimatedEquity</code>: the provider&apos;s value estimate less its balance estimate.</dd>
      </dl></section>
      <section><h3>Estimate</h3><dl className="oz-fv">
        <dt>Rate</dt><dd>{`10-year Treasury in the recording month plus ${ESTIMATE_RULE.spreadLowPct.toFixed(1)} to ${ESTIMATE_RULE.spreadHighPct.toFixed(1)} points`}</dd>
        <dt>Repayment</dt><dd>{`Monthly, over ${ESTIMATE_RULE.amortizationLowYears} to ${ESTIMATE_RULE.amortizationHighYears} years, from the recording date to the as-of date`}</dd>
        <dt>Range</dt><dd>{`Low rate over ${ESTIMATE_RULE.amortizationLowYears} years to high rate over ${ESTIMATE_RULE.amortizationHighYears} years`}</dd>
        <dt>Not modelled</dt><dd>Interest-only periods, prepayment, extensions and refinancing</dd>
        <dt>Benchmark</dt><dd><a href={TREASURY_10Y.url} target="_blank" rel="noreferrer">Treasury par yield curve</a><span className="s">{`Monthly average of daily readings, ${month(TREASURY_10Y.first)} to ${month(TREASURY_10Y.last)}`}</span></dd>
        <dt>Latest</dt><dd>{`${TREASURY_10Y.months[TREASURY_10Y.last].toFixed(2)}% (${month(TREASURY_10Y.last)})`}</dd>
      </dl></section>
      <section><h3>Maturities</h3><dl className="oz-fv">
        <dt>Mortgage entries</dt><dd>{int(c?.mortgageEntries)}</dd>
        <dt>With a maturity</dt><dd>{int(c?.maturityEntries)}</dd>
        <dt>Counting</dt><dd>A recorded document seen on several property records counts once.</dd>
        <dt>Next 24 months</dt><dd>From the as-of date in Financing assumptions</dd>
      </dl></section>
      <section><h3>Loan sources</h3><ul>
        <li>HUD: the FHA-insured multifamily active and terminated files, national, monthly. HUD gives a property&apos;s name, city, ZIP and units but no street, so a match needs the name, ZIP and units to agree; apartments only.</li>
        <li>CMBS: each SEC-registered CMBS trust&apos;s latest Form ABS-EE asset file (Exhibit EX-102), multifamily properties only, national. Fannie Mae, Freddie Mac and bank loans are not in these filings. A portfolio loan shows its total across all its properties. Payment status and payoff labels follow Regulation AB Schedule AL.</li>
        <li>County releases: satisfactions and releases in the Hillsborough and Pinellas clerks&apos; daily index files. Hillsborough keeps about two months online and Pinellas about one week, so coverage runs forward from the first capture. A Hillsborough release that cites the mortgage&apos;s instrument number is confirmed; a Pinellas match on lender, owner and date is probable.</li>
        <li>Confirmed: an exact instrument number, the same ZIP, street number and street, or the same ZIP, name and units. Probable: a weaker but specific match, shown with that label and never used as the balance.</li>
        <li>Loans outside our property data are placed by the Census geocoder, or at their ZIP&apos;s center when it finds no match.</li>
        <li>No person&apos;s name is stored. Lenders, holders and servicers are kept only when they are organizations.</li>
      </ul></section>
      <section><h3>Financing threshold</h3><ul>
        <li>Required NOI is the greater of annual debt service times the minimum DSCR plus reserves, or the loan times the minimum debt yield. Required value is the loan divided by the maximum LTV.</li>
        <li>Assumptions are analyst scenarios, not quotes, lender approval or investment policy. Actual NOI, payoff and funding gap are unknown.</li>
      </ul></section>
      <section><h3>Sources</h3><dl className="oz-fv">
        <dt>Snapshot</dt><dd>{result ? <><code>{result.snapshotId.slice(0, 16)}</code><span className="s">{`Acquired ${dateLabel(result.sourceDate)}, imported ${dateLabel(result.importedAt)}`}</span></> : '—'}</dd>
        <dt>Properties</dt><dd>{int(result?.universe)}</dd>
        <dt>Licenses</dt><dd>{int(result?.licenseUniverse)}</dd>
        <dt>OZ list</dt><dd>{result?.ozBasis.label ?? '—'}</dd>
        <dt>Coverage</dt><dd>Seven counties; properties with 20 or more licensed units first. Six responses outside the region are set aside.</dd>
      </dl></section>
      <section><h3>Use</h3><p>For internal research only. Third-party information may be incomplete or outdated. Calculations are illustrative and subject to stated assumptions; recorded financing and incentive eligibility require independent verification. Nothing herein constitutes an offer, solicitation, investment recommendation, or legal, tax or lending advice. Verify source records and transaction terms before acting.</p></section>
    </div>
    <div className="oz-about-ft"><button type="button" className="oz-btn" onClick={onReload}><RefreshCw size={16} aria-hidden="true" />Reload data</button></div>
  </dialog>;
}
