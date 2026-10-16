// A small loan-source bundle shaped exactly as scripts/debt-refresh.mjs writes it, for the unit and database tests.
import { createHash } from 'node:crypto';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
export const hudLoan = (patch: Record<string, unknown> = {}) => ({
  status: 'active', project: '06735001', propertyName: 'FIXTURE GARDENS', city: 'TAMPA', state: 'FL', zip: '33602', units: 120,
  initialEndorsement: '2019-04-01', finalEndorsement: '2019-04-01', originalAmountCents: 1_200_000_000, firstPayment: '2019-06-01', maturity: '2054-05-01',
  termMonths: 420, ratePct: 3.45, monthlyPaymentCents: 4_700_000, balanceCents: 1_050_000_000, holder: 'FIXTURE CAPITAL LLC', servicer: 'FIXTURE CAPITAL LLC',
  sectionCode: 'HRI', sectionCategory: '207/ 223(F) PUR/ REFIN HSG.', businessType: 'MF Residential', terminationType: null, claim: null, terminated: null, ...patch,
});
export const cmbsRecord = (patch: Record<string, unknown> = {}) => ({
  trust: 'BANK 2020-BNK99', cik: '1234567', accession: '0001234567-26-000001', filed: '2026-09-25', asset: '7', propertyIndex: 0, periodEnd: '2026-09-11',
  propertyName: 'FIXTURE GARDENS', address: '100 MAIN STREET', city: 'Tampa', state: 'FL', zip: '33602', county: 'Hillsborough', units: 120, yearBuilt: 1998,
  originalAmountCents: 2_000_000_000, originated: '2020-02-01', maturity: '2030-03-01', ratePct: 3.9, balanceCents: 1_900_000_000, paidThrough: '2026-09-01',
  paymentStatus: '0', specialServicing: false, specialServicerTransfer: null, masterServicerReturn: null, workoutStrategy: null, modified: false, modificationCode: null,
  lastModification: null, payoffCode: null, payoffDate: null, interestOnly: false, amortizationMonths: 360, servicer: 'FIXTURE SERVICING LLC', originator: 'FIXTURE BANK NA',
  propertyCount: 1, occupancyPct: 94, occupancyDate: '2026-06-30', dscrNcf: 1.6, dscrNoi: 1.7, valuationCents: 3_000_000_000, valuationDate: '2020-01-10',
  lon: null, lat: null, geocode: 'none', ...patch,
});
export const release = (patch: Record<string, unknown> = {}) => ({ county: '12057', instrument: '2026394411', type: 'SAT', recorded: '2026-10-08', amountCents: null, citedInstrument: '2020135527', citedBook: null, citedPage: null, lenders: ['FIXTURE BANK NA'], ...patch });
/** A bundle with the given rows; its manifest, data hash and id are computed as the refresh does. */
export function debtBundle(researchSnapshotId: string, rows: { hud?: unknown[]; cmbs?: unknown[]; releases?: unknown[]; links?: unknown[] } = {}, tag = '') {
  const data = { hud: rows.hud ?? [hudLoan()], cmbs: rows.cmbs ?? [cmbsRecord(), cmbsRecord({ propertyName: 'ELSEWHERE', address: '9 OAK ST', city: 'Dallas', state: 'TX', zip: '75201', lon: -96.8, lat: 32.78, geocode: 'census_address', specialServicing: true, specialServicerTransfer: '2026-05-01' })], releases: rows.releases ?? [release()], clerkDays: [{ county: '12057', day: '2026-10-08', file: 'D2026100801id.29', sha256: 'a'.repeat(64), releases: 1, partySha256: null }],
    links: rows.links ?? [
      { propertyId: 'reapi:fixture', source: 'hud', sourceKey: 'hud:0', debtId: null, confidence: 'confirmed', method: 'HUD name, city, ZIP and units', detail: { nameScore: 1 } },
      { propertyId: 'reapi:fixture', source: 'cmbs', sourceKey: 'cmbs:0', debtId: null, confidence: 'confirmed', method: 'CMBS ZIP, number and street', detail: {} },
      { propertyId: 'reapi:fixture', source: 'release', sourceKey: '12057:2026394411', debtId: 'reapi:fixture:0', confidence: 'confirmed', method: 'Release cites the recorded instrument', detail: {} },
    ] };
  const counts = { hudLoans: data.hud.length, cmbsRecords: data.cmbs.length, releases: data.releases.length, clerkDays: data.clerkDays.length, links: data.links.length, tag };
  const manifest = { parserVersion: 'debt-sources-1', researchSnapshotId, builtAt: '2026-10-16T00:00:00Z', scriptSha256: 'b'.repeat(64), rule: 'Synthetic fixture.', sources: { fixture: true }, counts, dataSha256: sha(JSON.stringify(data)) };
  return { id: sha(JSON.stringify(manifest)), manifest, ...data };
}
