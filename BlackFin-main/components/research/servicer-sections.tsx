'use client';
// Drawer sections for the loan sources: HUD FHA loans, CMBS loans from SEC filings and county release records, each
// with its match confidence. Also the drawer for a CMBS loan outside the property data (a map point).
import { COUNTY_CLERKS, EDGAR_FILING_URL, PAYMENT_STATUS_LABELS, PAYOFF_LABELS, type CmbsLoan, type DebtLink, type HudLoan, type ReleaseRecord, type ServicerReading } from '../../lib/research/debt-sources';
import { DrawerTop, Ext, type DrawerChrome } from './oz-eb5-drawer';
import { Fv, dateLabel, int, useJson } from './oz-eb5-parts';
import { usd, usdShort } from './format';

const CONFIDENCE = { confirmed: 'Confirmed', probable: 'Probable' } as const;
const rate = (n: number | null) => (n === null ? null : `${n.toFixed(2)}%`);
const titleCase = (s: string | null) => (s ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : null);

function Hud({ l }: { l: DebtLink<HudLoan> }) {
  const r = l.row;
  return <details className="oz-prop" open={l.confidence === 'confirmed'}><summary><span>{titleCase(r.propertyName) ?? `HUD ${r.project}`}</span><span className="u">{r.status === 'active' ? usdShort(r.balanceCents) : 'Ended'}</span></summary>
    <dl className="oz-fv">
      <Fv label="Match">{CONFIDENCE[l.confidence]}<span className="s">{l.method}</span></Fv>
      <Fv label="Status">{r.status === 'active' ? 'Active' : <>{`Ended ${dateLabel(r.terminated)}`}<span className="s">{[r.terminationType, r.claim === true ? 'Claim' : r.claim === false ? 'No claim' : null].filter(Boolean).join(', ')}</span></>}</Fv>
      {r.status === 'active' && <Fv label="Balance">{usd(r.balanceCents)}<span className="s">Amortized, HUD monthly file</span></Fv>}
      <Fv label="Original amount">{r.originalAmountCents === null ? null : usd(r.originalAmountCents)}</Fv>
      <Fv label="Rate">{rate(r.ratePct)}</Fv>
      <Fv label="Maturity">{r.maturity ? dateLabel(r.maturity) : null}</Fv>
      {r.status === 'active' && <Fv label="Monthly payment">{r.monthlyPaymentCents === null ? null : usd(r.monthlyPaymentCents)}</Fv>}
      <Fv label="Endorsed">{r.finalEndorsement ? dateLabel(r.finalEndorsement) : null}</Fv>
      <Fv label="Program">{r.sectionCategory}</Fv>
      <Fv label="Holder">{r.holder}</Fv>
      <Fv label="Servicer">{r.servicer}</Fv>
      <Fv label="Units">{r.units === null ? null : int(r.units)}</Fv>
      <Fv label="Place">{[titleCase(r.city), r.zip].filter(Boolean).join(' ')}</Fv>
      <Fv label="HUD project">{r.project}</Fv>
    </dl></details>;
}
export function CmbsRows({ r }: { r: CmbsLoan }) {
  const status = r.paymentStatus ? PAYMENT_STATUS_LABELS[r.paymentStatus] ?? `Code ${r.paymentStatus}` : null;
  return <>
    <Fv label="Balance">{r.balanceCents === null ? null : usd(r.balanceCents)}{r.propertyCount > 1 ? <span className="s">{`Loan total across ${r.propertyCount} properties`}</span> : r.periodEnd ? <span className="s">{`As of ${dateLabel(r.periodEnd)}`}</span> : null}</Fv>
    <Fv label="Rate">{rate(r.ratePct)}</Fv>
    <Fv label="Maturity">{r.maturity ? dateLabel(r.maturity) : null}</Fv>
    <Fv label="DSCR">{r.dscrNcf !== null ? `${r.dscrNcf.toFixed(2)}x` : r.dscrNoi !== null ? `${r.dscrNoi.toFixed(2)}x (NOI)` : null}</Fv>
    <Fv label="Occupancy">{r.occupancyPct === null ? null : <>{`${Math.round(r.occupancyPct)}%`}{r.occupancyDate && <span className="s">{dateLabel(r.occupancyDate)}</span>}</>}</Fv>
    <Fv label="Payment status">{status}</Fv>
    <Fv label="Special servicing">{r.specialServicing ? <>Yes<span className="s">{`Transferred ${dateLabel(r.specialServicerTransfer)}`}</span></> : 'No'}</Fv>
    <Fv label="Modified">{r.modified ? <>{'Yes'}{r.lastModification && <span className="s">{dateLabel(r.lastModification)}</span>}</> : 'No'}</Fv>
    <Fv label="Payoff">{r.payoffCode ? <>{PAYOFF_LABELS[r.payoffCode] ?? `Code ${r.payoffCode}`}{r.payoffDate && <span className="s">{dateLabel(r.payoffDate)}</span>}</> : 'None reported'}</Fv>
    <Fv label="Original amount">{r.originalAmountCents === null ? null : usd(r.originalAmountCents)}<span className="s">{r.originated ? `Originated ${dateLabel(r.originated)}` : ''}</span></Fv>
    <Fv label="Servicer">{r.servicer}</Fv>
    <Fv label="Trust"><Ext href={EDGAR_FILING_URL(r.cik, r.accession)}>{r.trust}</Ext><span className="s">{`Filed ${dateLabel(r.filed)}`}</span></Fv>
    <Fv label="Filing address">{[r.address, titleCase(r.city), r.state, r.zip].filter(Boolean).join(', ')}</Fv>
    <Fv label="Units">{r.units === null ? null : int(r.units)}</Fv>
  </>;
}
function Cmbs({ l }: { l: DebtLink<CmbsLoan> }) {
  return <details className="oz-prop" open={l.confidence === 'confirmed'}><summary><span>{titleCase(l.row.propertyName) ?? l.row.trust}</span><span className="u">{usdShort(l.row.balanceCents)}</span></summary>
    <dl className="oz-fv"><Fv label="Match">{CONFIDENCE[l.confidence]}<span className="s">{l.method}</span></Fv><CmbsRows r={l.row} /></dl></details>;
}
function Release({ l }: { l: DebtLink<ReleaseRecord> }) {
  const r = l.row, clerk = COUNTY_CLERKS[r.county];
  return <details className="oz-prop" open><summary><span>{r.docType === 'REL' ? 'Release' : 'Satisfaction'}</span><span className="u">{dateLabel(r.recorded)}</span></summary>
    <dl className="oz-fv">
      <Fv label="Match">{CONFIDENCE[l.confidence]}<span className="s">{l.method}</span></Fv>
      <Fv label="County record"><Ext href={clerk.search}>{`${clerk.name} ${r.instrument}`}</Ext></Fv>
      <Fv label="Cites">{r.citedInstrument}</Fv>
      <Fv label="Lender">{r.lenders.join(', ') || null}</Fv>
      <Fv label="Amount">{r.amountCents === null ? null : usd(r.amountCents)}</Fv>
    </dl></details>;
}
export function ServicerSections({ servicer }: { servicer: ServicerReading | null | undefined }) {
  if (!servicer) return null;
  const loans = servicer.hud.length + servicer.cmbs.length;
  return <>
    <section className="oz-dr-sec"><h3>Servicer loans <span className="n">{int(loans)}</span></h3>
      {loans === 0 ? <p className="oz-dr-note">None matched</p> : <>{servicer.hud.map((l, i) => <Hud key={`h${i}`} l={l} />)}{servicer.cmbs.map((l, i) => <Cmbs key={`c${i}`} l={l} />)}</>}
    </section>
    {servicer.releases.length > 0 && <section className="oz-dr-sec"><h3>Released (county record) <span className="n">{int(servicer.releases.length)}</span></h3>
      {servicer.releases.map((l, i) => <Release key={i} l={l} />)}
    </section>}
  </>;
}
/** The drawer for a CMBS loan outside the property data. */
export function OutsideLoanDrawer({ runId, seq, chrome }: { runId: string; seq: number; chrome: DrawerChrome }) {
  const loan = useJson<CmbsLoan | null>(`/api/research/debt/loan?run=${runId}&seq=${seq}`, 0, 'default');
  const r = loan.data;
  return <aside className="oz-drawer" aria-label="Loan detail">
    <DrawerTop {...chrome} />
    <div className="oz-dr-body">
      {loan.loading && !r && <p className="oz-dr-note" role="status">Loading</p>}
      {loan.error && <p className="oz-dr-note" role="alert">{loan.error}</p>}
      {r && <>
        <h2 className="oz-dr-title">{titleCase(r.propertyName) ?? 'CMBS loan'}</h2>
        <div className="oz-dr-id"><span>{[titleCase(r.city), r.state].filter(Boolean).join(', ')}</span><span>Outside our property data</span></div>
        <section className="oz-dr-sec"><h3>CMBS loan</h3><dl className="oz-fv"><CmbsRows r={r} />
          <Fv label="Map point">{r.geocode === 'census_address' ? 'Census geocoder' : r.geocode === 'zip_centroid' ? 'ZIP centroid' : null}</Fv>
        </dl></section>
      </>}
    </div>
  </aside>;
}
