// Loan sources (migration 010): HUD FHA loans, CMBS loans from SEC filings and county release records, linked to the
// research properties. Read at query time and attached to each property as `servicer`; the balance, the filters and
// the drawer read it from there. Kept apart from service.ts so the database test can exercise it without the identity
// boundary. Before migration 010 is applied, or before a run is imported, every property reads `servicer: null`.
import type { PoolClient } from 'pg';
import type { ResearchProperty } from './types.ts';

export type DebtConfidence = 'confirmed' | 'probable';
export type HudLoan = {
  seq: number; project: string; status: 'active' | 'terminated'; propertyName: string | null; city: string | null; state: string | null; zip: string | null; units: number | null;
  finalEndorsement: string | null; originalAmountCents: number | null; maturity: string | null; ratePct: number | null; balanceCents: number | null; monthlyPaymentCents: number | null;
  holder: string | null; servicer: string | null; sectionCategory: string | null; terminationType: string | null; claim: boolean | null; terminated: string | null;
};
export type CmbsLoan = {
  seq: number; trust: string; accession: string; cik: string; filed: string; asset: string | null; periodEnd: string | null; propertyName: string | null; address: string | null; city: string | null; state: string | null; zip: string | null;
  units: number | null; originalAmountCents: number | null; originated: string | null; maturity: string | null; ratePct: number | null; balanceCents: number | null; paidThrough: string | null;
  paymentStatus: string | null; specialServicing: boolean; specialServicerTransfer: string | null; workoutStrategy: string | null; modified: boolean; modificationCode: string | null; lastModification: string | null;
  payoffCode: string | null; payoffDate: string | null; servicer: string | null; propertyCount: number; occupancyPct: number | null; occupancyDate: string | null; dscrNcf: number | null; dscrNoi: number | null;
  lon: number | null; lat: number | null; geocode: 'census_address' | 'zip_centroid' | 'none';
};
export type ReleaseRecord = { county: '12057' | '12103'; instrument: string; docType: string; recorded: string | null; amountCents: number | null; citedInstrument: string | null; lenders: string[] };
export type DebtLink<T> = { confidence: DebtConfidence; method: string; debtId: string | null; detail: Record<string, unknown>; row: T };
export type ServicerReading = { runId: string; hud: DebtLink<HudLoan>[]; cmbs: DebtLink<CmbsLoan>[]; releases: DebtLink<ReleaseRecord>[] };
export type DebtRun = { id: string; importedAt: string; researchSnapshotId: string; counts: Record<string, unknown>; sources: Record<string, unknown> };

export const PAYMENT_STATUS_LABELS: Record<string, string> = { '0': 'Current', '1': '30 to 59 days late', '2': '60 to 89 days late', '3': '90 days or more late', '4': 'Matured balloon, performing', '5': 'Matured balloon, not performing', A: 'In grace period', B: 'Late, under 30 days' };
export const PAYOFF_LABELS: Record<string, string> = { '1': 'Partial liquidation', '2': 'Payoff before maturity', '3': 'Disposition', '4': 'Repurchase or substitution', '5': 'Full payoff at maturity', '6': 'Discounted payoff', '7': 'Liquidation', '8': 'Payoff with penalty', '9': 'Payoff with yield maintenance', '10': 'Curtailment with penalty', '11': 'Curtailment with yield maintenance' };
export const COUNTY_CLERKS: Record<string, { name: string; search: string }> = {
  '12057': { name: 'Hillsborough', search: 'https://publicaccess.hillsclerk.com/oripublicaccess/' },
  '12103': { name: 'Pinellas', search: 'https://officialrecords.mypinellasclerk.gov/' },
};
export const EDGAR_FILING_URL = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}/${accession}-index.htm`;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : null);
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const missingTable = (e: unknown) => (e as { code?: string })?.code === '42P01';

export async function currentDebtRun(client: PoolClient): Promise<DebtRun | null> {
  try {
    const r = (await client.query("SELECT r.id, r.imported_at, r.research_snapshot_id, r.counts, r.sources FROM research_debt_current c JOIN research_debt_runs r ON r.id=c.run_id WHERE c.workspace_id='primary'")).rows[0];
    return r ? { id: r.id, importedAt: r.imported_at instanceof Date ? r.imported_at.toISOString() : r.imported_at, researchSnapshotId: r.research_snapshot_id, counts: r.counts, sources: r.sources } : null;
  } catch (e) { if (missingTable(e)) return null; throw e; }
}
export const hudRow = (r: Record<string, unknown>): HudLoan => ({
  seq: Number(r.seq), project: String(r.project), status: r.status as HudLoan['status'], propertyName: r.property_name as string | null, city: r.city as string | null, state: r.state as string | null, zip: r.zip as string | null,
  units: n(r.units), finalEndorsement: iso(r.final_endorsement), originalAmountCents: n(r.original_amount_cents), maturity: iso(r.maturity), ratePct: n(r.rate_pct), balanceCents: n(r.balance_cents), monthlyPaymentCents: n(r.monthly_payment_cents),
  holder: r.holder as string | null, servicer: r.servicer as string | null, sectionCategory: r.section_category as string | null, terminationType: r.termination_type as string | null, claim: r.claim as boolean | null, terminated: iso(r.terminated),
});
export const cmbsRow = (r: Record<string, unknown>): CmbsLoan => ({
  seq: Number(r.seq), trust: String(r.trust), accession: String(r.accession), cik: String(r.cik), filed: iso(r.filed)!, asset: r.asset as string | null, periodEnd: iso(r.period_end), propertyName: r.property_name as string | null,
  address: r.address as string | null, city: r.city as string | null, state: r.state as string | null, zip: r.zip as string | null, units: n(r.units), originalAmountCents: n(r.original_amount_cents), originated: iso(r.originated), maturity: iso(r.maturity),
  ratePct: n(r.rate_pct), balanceCents: n(r.balance_cents), paidThrough: iso(r.paid_through), paymentStatus: r.payment_status as string | null, specialServicing: !!r.special_servicing, specialServicerTransfer: iso(r.special_servicer_transfer),
  workoutStrategy: r.workout_strategy as string | null, modified: !!r.modified, modificationCode: r.modification_code as string | null, lastModification: iso(r.last_modification), payoffCode: r.payoff_code as string | null, payoffDate: iso(r.payoff_date),
  servicer: r.servicer as string | null, propertyCount: Number(r.property_count), occupancyPct: n(r.occupancy_pct), occupancyDate: iso(r.occupancy_date), dscrNcf: n(r.dscr_ncf), dscrNoi: n(r.dscr_noi),
  lon: n(r.lon), lat: n(r.lat), geocode: r.geocode as CmbsLoan['geocode'],
});
const releaseRow = (r: Record<string, unknown>): ReleaseRecord => ({ county: r.county_fips as ReleaseRecord['county'], instrument: String(r.instrument), docType: String(r.doc_type), recorded: iso(r.recorded), amountCents: n(r.amount_cents), citedInstrument: r.cited_instrument as string | null, lenders: (r.lenders as string[]) ?? [] });

/** Attach each property's linked loans and releases from the current run; `null` when there is no run. */
export async function debtOverlay(client: PoolClient, properties: ResearchProperty[]): Promise<ResearchProperty[]> {
  const run = await currentDebtRun(client);
  if (!run) return properties.map(p => ({ ...p, servicer: null }));
  const ids = properties.map(p => p.id);
  const links = (await client.query('SELECT property_id, source, source_key, debt_id, confidence, method, detail FROM research_debt_links WHERE run_id=$1 AND property_id = ANY($2::text[])', [run.id, ids])).rows;
  const hudSeqs = links.filter(l => l.source === 'hud').map(l => Number(String(l.source_key).slice(4)));
  const cmbsSeqs = links.filter(l => l.source === 'cmbs').map(l => Number(String(l.source_key).slice(5)));
  const releaseKeys = links.filter(l => l.source === 'release').map(l => String(l.source_key));
  const hud = new Map((hudSeqs.length ? (await client.query('SELECT * FROM research_debt_hud_loans WHERE run_id=$1 AND seq = ANY($2::int[])', [run.id, hudSeqs])).rows : []).map(r => [Number(r.seq), hudRow(r)]));
  const cmbs = new Map((cmbsSeqs.length ? (await client.query('SELECT * FROM research_debt_cmbs_loans WHERE run_id=$1 AND seq = ANY($2::int[])', [run.id, cmbsSeqs])).rows : []).map(r => [Number(r.seq), cmbsRow(r)]));
  const releases = new Map((releaseKeys.length ? (await client.query("SELECT * FROM research_debt_releases WHERE run_id=$1 AND (county_fips || ':' || instrument) = ANY($2::text[])", [run.id, releaseKeys])).rows : []).map(r => [`${r.county_fips}:${r.instrument}`, releaseRow(r)]));
  const byProperty = new Map<string, ServicerReading>();
  for (const l of links) {
    const reading = byProperty.get(l.property_id) ?? { runId: run.id, hud: [], cmbs: [], releases: [] };
    const base = { confidence: l.confidence as DebtConfidence, method: String(l.method), debtId: l.debt_id as string | null, detail: l.detail as Record<string, unknown> };
    if (l.source === 'hud') { const row = hud.get(Number(String(l.source_key).slice(4))); if (row) reading.hud.push({ ...base, row }); }
    if (l.source === 'cmbs') { const row = cmbs.get(Number(String(l.source_key).slice(5))); if (row) reading.cmbs.push({ ...base, row }); }
    if (l.source === 'release') { const row = releases.get(String(l.source_key)); if (row) reading.releases.push({ ...base, row }); }
    byProperty.set(l.property_id, reading);
  }
  const order = (a: { confidence: DebtConfidence }, b: { confidence: DebtConfidence }) => (a.confidence === b.confidence ? 0 : a.confidence === 'confirmed' ? -1 : 1);
  return properties.map(p => {
    const r = byProperty.get(p.id);
    if (!r) return { ...p, servicer: { runId: run.id, hud: [], cmbs: [], releases: [] } };
    r.hud.sort((a, b) => order(a, b) || (a.row.status === b.row.status ? (b.row.finalEndorsement ?? '').localeCompare(a.row.finalEndorsement ?? '') : a.row.status === 'active' ? -1 : 1));
    r.cmbs.sort(order); r.releases.sort((a, b) => order(a, b) || (b.row.recorded ?? '').localeCompare(a.row.recorded ?? ''));
    return { ...p, servicer: r };
  });
}
/** The servicer-reported balance a property can show: a confirmed, active HUD loan, else a confirmed single-property CMBS loan not paid off. */
export function servicerBalance(s: ServicerReading | null | undefined): { cents: number; via: 'hud' | 'cmbs'; asOf: string | null } | null {
  if (!s) return null;
  const hud = s.hud.find(l => l.confidence === 'confirmed' && l.row.status === 'active' && l.row.balanceCents !== null && l.row.balanceCents > 0);
  if (hud) return { cents: hud.row.balanceCents!, via: 'hud', asOf: null };
  // A loan split into notes held by several trusts reports one note per trust: notes with the same origination and
  // maturity are one loan and are added; otherwise the most recently originated loan stands.
  const live = s.cmbs.filter(l => l.confidence === 'confirmed' && l.row.propertyCount === 1 && !l.row.payoffCode && l.row.balanceCents !== null && l.row.balanceCents > 0);
  if (!live.length) return null;
  const latest = [...live].sort((a, b) => (b.row.originated ?? '').localeCompare(a.row.originated ?? ''))[0].row;
  const notes = live.filter(l => l.row.originated === latest.originated && l.row.maturity === latest.maturity);
  return { cents: notes.reduce((sum, l) => sum + l.row.balanceCents!, 0), via: 'cmbs', asOf: latest.periodEnd };
}
export const inSpecialServicing = (s: ServicerReading | null | undefined) => !!s?.cmbs.some(l => l.row.specialServicing);
/** A verified release: a release citing the recorded instrument, a HUD termination, or a CMBS payoff code, each on a confirmed link. */
export const releasedVerified = (s: ServicerReading | null | undefined) => !!s && (s.releases.some(l => l.confidence === 'confirmed') || s.hud.some(l => l.confidence === 'confirmed' && l.row.status === 'terminated') || s.cmbs.some(l => l.confidence === 'confirmed' && !!l.row.payoffCode));

/** CMBS multifamily loans with no link to a property, for the map layer. Compact rows; the drawer fetches one by seq. */
export async function outsideLoans(client: PoolClient) {
  const run = await currentDebtRun(client);
  if (!run) return null;
  const rows = (await client.query(`SELECT seq, lon, lat, property_name, city, state, balance_cents, maturity, special_servicing, geocode FROM research_debt_cmbs_loans c
    WHERE run_id=$1 AND geocode<>'none' AND NOT EXISTS (SELECT 1 FROM research_debt_links l WHERE l.run_id=c.run_id AND l.source='cmbs' AND l.source_key='cmbs:' || c.seq) ORDER BY seq`, [run.id])).rows;
  return { runId: run.id, rows: rows.map(r => [Number(r.seq), Number(r.lon), Number(r.lat), r.property_name ?? '', r.city ?? '', r.state ?? '', n(r.balance_cents), iso(r.maturity), r.special_servicing ? 1 : 0, r.geocode === 'zip_centroid' ? 1 : 0] as const) };
}
export async function cmbsLoan(client: PoolClient, runId: string, seq: number) {
  const r = (await client.query('SELECT * FROM research_debt_cmbs_loans WHERE run_id=$1 AND seq=$2', [runId, seq])).rows[0];
  return r ? cmbsRow(r) : null;
}
