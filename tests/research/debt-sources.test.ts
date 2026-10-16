import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrganization, nameSimilarity, normalizeStreet, organizationOrNull, sameCity } from '../../scripts/debt-lib.mjs';
import { formIndexRow, isCmbsTrust, parseExhibit } from '../../scripts/debt-sec.mjs';
import { citedInstrument, storedRelease } from '../../scripts/debt-clerk.mjs';
import { matchCmbs, matchHud, matchReleases, parseAddress } from '../../scripts/debt-match.mjs';
import { validateDebtBundle } from '../../scripts/debt-import-core.mjs';
import { inSpecialServicing, releasedVerified, servicerBalance, type CmbsLoan, type DebtLink, type ServicerReading } from '../../lib/research/debt-sources.ts';
import { bestBalance } from '../../lib/research/balance-estimate.ts';
import { DEFAULT_RESEARCH_STATE, parseResearchState, serialiseResearchState } from '../../components/research/research-url.ts';
import { cmbsRecord, debtBundle, hudLoan } from './debt-fixture.ts';

const SNAPSHOT = 'c'.repeat(64);
const property = (patch: Record<string, unknown> = {}) => ({ id: 'reapi:p1', countyFips: '12057', ...parseAddress('100 Main St, Tampa, FL 33602'), units: [120], names: ['FIXTURE GARDENS APARTMENTS'], owner: 'FIXTURE OWNER LLC', mortgages: [{ id: 'reapi:p1:0', documentNumber: '2020135527', lender: 'Fixture Bank Na', recordingDate: '2020-05-01' }], ...patch });

test('street normalization folds suffixes, directions and units; the city and plurals do not count as a name', () => {
  assert.deepEqual(normalizeStreet('3805 South Hopkins Avenue, Unit 4'), { number: '3805', street: 'S HOPKINS AVE', key: '3805 S HOPKINS AVE' });
  assert.equal(normalizeStreet('1400-1420 Main Street').number, '1400');
  assert.equal(nameSimilarity('SEVEN PALMS APTS', 'SEVEN PALM APARTMENTS'), 1);
  assert.equal(nameSimilarity('CLEARWATER APARTMENTS', 'ARCHWAY CLEARWATER GARDENS, LLC', { cities: ['CLEARWATER'] }), 0);
  assert.ok(sameCity('ST. PETERSBURG', 'Saint Petersburg'));
});
test('only organizations are ever stored as a party name', () => {
  for (const n of ['WELLS FARGO BANK, N.A.', 'MIDFIRST BANK', 'FIXTURE CAPITAL LLC', 'Federal National Mortgage Association', 'CITY OF TAMPA']) assert.ok(isOrganization(n), n);
  for (const n of ['JOHN Q SMITH', 'Carol H Aase Etux', 'MARIA GARCIA']) assert.equal(organizationOrNull(n), null, n);
});
test('the CMBS filter keeps trusts and skips depositors and other asset classes', () => {
  assert.deepEqual(formIndexRow('ABS-EE           BANK 2017-BNK5                                                1706303     2026-10-01  edgar/data/1706303/0001888524-26-018118.txt         '),
    { company: 'BANK 2017-BNK5', cik: '1706303', filed: '2026-10-01', file: 'edgar/data/1706303/0001888524-26-018118.txt' });
  assert.equal(formIndexRow('10-D             BANK 2017-BNK5     1706303     2026-10-01  edgar/data/x.txt'), null);
  for (const n of ['BANK 2019-BNK17', 'Benchmark 2020-B16 Mortgage Trust', 'CSAIL 2019-C15 Commercial Mortgage Trust', 'JPMF1 Multifamily Mortgage Trust 2026-FX1']) assert.ok(isCmbsTrust(n), n);
  for (const n of ['BMO Commercial Mortgage Securities LLC', 'CarMax Auto Owner Trust 2024-1', 'Ally Auto Receivables Trust 2024-2']) assert.ok(!isCmbsTrust(n), n);
});
const EX102 = `<?xml version="1.0"?><assetData xmlns="http://www.sec.gov/edgar/document/absee/cmbs/assetdata">
<assets><assetNumber>43</assetNumber><reportingPeriodEndDate>09-11-2026</reportingPeriodEndDate><originatorName>Morgan Stanley Bank, N.A.</originatorName><originationDate>08-25-2017</originationDate><originalLoanAmount>3500000.00</originalLoanAmount><maturityDate>09-05-2027</maturityDate><originalInterestRatePercentage>0.0442</originalInterestRatePercentage><reportPeriodInterestRatePercentage>0.0442</reportPeriodInterestRatePercentage><reportPeriodEndActualBalanceAmount>2903931.89</reportPeriodEndActualBalanceAmount><paidThroughDate>09-05-2026</paidThroughDate><paymentStatusLoanCode>0</paymentStatusLoanCode><primaryServicerName>Trimont LLC</primaryServicerName><modifiedIndicator>false</modifiedIndicator><NumberProperties>1</NumberProperties>
<property><propertyName>SUNRISE APARTMENTS</propertyName><propertyAddress>3805 SOUTH HOPKINS AVENUE</propertyAddress><propertyCity>Titusville</propertyCity><propertyState>FL</propertyState><propertyZip>32780</propertyZip><propertyTypeCode>MF</propertyTypeCode><unitsBedsRoomsNumber>97</unitsBedsRoomsNumber><mostRecentPhysicalOccupancyPercentage>0.93</mostRecentPhysicalOccupancyPercentage><mostRecentDebtServiceCoverageNetCashFlowpercentage>2.5989</mostRecentDebtServiceCoverageNetCashFlowpercentage><mostRecentFinancialsEndDate>06-30-2026</mostRecentFinancialsEndDate></property></assets>
<assets><assetNumber>44</assetNumber><mostRecentSpecialServicerTransferDate>05-01-2026</mostRecentSpecialServicerTransferDate><reportPeriodEndActualBalanceAmount>9000000</reportPeriodEndActualBalanceAmount><property><propertyName>OFFICE ONE</propertyName><propertyTypeCode>OF</propertyTypeCode></property></assets></assetData>`;
test('EX-102: multifamily property records with servicer-reported terms; other property types are skipped', () => {
  const parsed = parseExhibit(Buffer.from(EX102), { company: 'MSC 2017-H1', cik: '1715846', accession: '0001888524-26-017887', filed: '2026-09-28' });
  assert.equal(parsed.cmbs, true); assert.equal(parsed.loans, 2); assert.equal(parsed.records.length, 1);
  const r = parsed.records[0];
  assert.deepEqual([r.balanceCents, r.ratePct, r.maturity, r.originated, r.occupancyPct, r.dscrNcf, r.paymentStatus, r.specialServicing, r.servicer, r.units, r.zip],
    [290393189, 4.42, '2027-09-05', '2017-08-25', 93, 2.5989, '0', false, 'Trimont LLC', 97, '32780']);
  assert.equal(parseExhibit(Buffer.from('<assetData xmlns="http://www.sec.gov/edgar/document/absee/autoloan/assetdata"></assetData>'), {}).cmbs, false);
});
test('a release cites its mortgage by clerk number, or by book and page', () => {
  assert.deepEqual(citedInstrument('CLK # 2020135527'), { instrument: '2020135527', book: null, page: null });
  assert.deepEqual(citedInstrument('CLK#2026269310'), { instrument: '2026269310', book: null, page: null });
  assert.deepEqual(citedInstrument('OR BK 24886 PG 604'), { instrument: null, book: '24886', page: '604' });
  assert.deepEqual(citedInstrument('L 3 B 7 SUMMERFIELD VILL'), { instrument: null, book: null, page: null });
  const stored = storedRelease({ county: '12103', instrument: '1', type: 'S', recorded: null, amountCents: null, citedInstrument: null, citedBook: null, citedPage: null, lenders: [], parties: { from: ['A BANK'], to: ['JANE DOE'] } } as never);
  assert.equal('parties' in stored, false, 'party names never leave memory');
});
test('matching: HUD needs name, ZIP and units; CMBS needs number and street; a release must cite the instrument', () => {
  const p = property();
  assert.equal(matchHud([hudLoan()], [p])[0].confidence, 'confirmed');
  assert.equal(matchHud([hudLoan({ units: 300 })], [p]).length, 0, 'units far apart');
  assert.equal(matchHud([hudLoan({ businessType: 'MF Healthcare' })], [p]).length, 0, 'apartments only');
  assert.equal(matchHud([hudLoan({ city: 'TEMPLE TERRACE' })], [p])[0].confidence, 'confirmed', 'a postal-city alias with an exact name');
  assert.equal(matchCmbs([cmbsRecord()], [p])[0].confidence, 'confirmed');
  assert.equal(matchCmbs([cmbsRecord({ address: '100 MAIN ST NORTH' })], [p])[0].confidence, 'probable');
  assert.equal(matchCmbs([cmbsRecord({ address: '102 MAIN STREET' })], [p]).length, 0);
  const hit = matchReleases([{ county: '12057', instrument: '2026394411', citedInstrument: '2020135527', recorded: '2026-10-08', parties: { from: [], to: [] } }], [p]);
  assert.deepEqual([hit[0].confidence, hit[0].debtId], ['confirmed', 'reapi:p1:0']);
  // Pinellas: one fitting mortgage gives a probable link; two fits give none.
  const pin = property({ id: 'reapi:p2', countyFips: '12103', mortgages: [{ id: 'reapi:p2:0', documentNumber: '1', lender: 'Fixture Bank Na', recordingDate: '2020-05-01' }] });
  const rel = { county: '12103', instrument: '2026264704', citedInstrument: null, recorded: '2026-10-05', parties: { from: ['FIXTURE BANK N.A.'], to: ['FIXTURE OWNER LLC'] } };
  assert.equal(matchReleases([rel], [pin])[0].confidence, 'probable');
  assert.equal(matchReleases([rel], [pin, { ...pin, id: 'reapi:p3' }]).length, 0);
});
test('the importer refuses a person named as a party, an unexpected release field, and a dangling link', () => {
  validateDebtBundle(debtBundle(SNAPSHOT));
  assert.throws(() => validateDebtBundle(debtBundle(SNAPSHOT, { hud: [hudLoan({ holder: 'JOHN Q SMITH' })] })), /not an organization/);
  assert.throws(() => validateDebtBundle(debtBundle(SNAPSHOT, { releases: [{ ...(debtBundle(SNAPSHOT).releases[0] as Record<string, unknown>), parties: { to: ['X'] } }] })), /unexpected field/);
  assert.throws(() => validateDebtBundle(debtBundle(SNAPSHOT, { links: [{ propertyId: 'reapi:fixture', source: 'hud', sourceKey: 'hud:9', debtId: null, confidence: 'confirmed', method: 'x', detail: {} }] })), /missing row/);
  const tampered = debtBundle(SNAPSHOT); (tampered.hud[0] as { balanceCents: number }).balanceCents = 1;
  assert.throws(() => validateDebtBundle(tampered), /Data does not match/);
});
const link = <T,>(row: T, confidence: 'confirmed' | 'probable' = 'confirmed'): DebtLink<T> => ({ confidence, method: 'm', debtId: null, detail: {}, row });
const cmbs = (patch: Partial<CmbsLoan>) => ({ ...cmbsRecord(), seq: 0, ...patch }) as unknown as CmbsLoan;
test('servicer balance: confirmed active HUD first, then CMBS notes of one loan added; probable links never count', () => {
  const reading = (r: Partial<ServicerReading>): ServicerReading => ({ runId: 'r', hud: [], cmbs: [], releases: [], ...r });
  const hudActive = { ...hudLoan(), seq: 0 } as never;
  assert.deepEqual(servicerBalance(reading({ hud: [link(hudActive)] })), { cents: 1_050_000_000, via: 'hud', asOf: null });
  assert.equal(servicerBalance(reading({ hud: [link(hudActive, 'probable')] })), null);
  const notes = reading({ cmbs: [link(cmbs({ balanceCents: 3_000_000_000 })), link(cmbs({ balanceCents: 4_700_000_000 }))] });
  assert.equal(servicerBalance(notes)?.cents, 7_700_000_000);
  assert.equal(servicerBalance(reading({ cmbs: [link(cmbs({ propertyCount: 3 }))] })), null, 'a portfolio total is not a property balance');
  assert.equal(servicerBalance(reading({ cmbs: [link(cmbs({ payoffCode: '2' }))] })), null);
  assert.equal(bestBalance({ mortgages: [], providerEstimate: null, servicer: notes }, '2026-10-16')?.source, 'servicer');
  assert.ok(inSpecialServicing(reading({ cmbs: [link(cmbs({ specialServicing: true }), 'probable')] })));
  assert.ok(releasedVerified(reading({ cmbs: [link(cmbs({ payoffCode: '5' }))] })));
  assert.ok(!releasedVerified(reading({ releases: [link({ county: '12103', instrument: '1', docType: 'S', recorded: null, amountCents: null, citedInstrument: null, lenders: [] } as never, 'probable')] })));
});
test('the three loan filters round-trip in the URL', () => {
  const s = { ...DEFAULT_RESEARCH_STATE, realBalance: true, specialServicing: true, releasedVerified: true, balanceSource: 'servicer' as const };
  assert.deepEqual(parseResearchState(new URLSearchParams(serialiseResearchState(s))), s);
});
