import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTIMATE_RULE, bestBalance, elapsedMonths, estimateBalance, remainingBalance, treasury10y } from '../../lib/research/balance-estimate.ts';
import { maturityWall } from '../../lib/research/maturity-wall.ts';
import { emptyQuery, screenProperties, summarize, validateQuery } from '../../lib/research/query.ts';
import { defaultScenario } from '../../lib/research/finance.ts';
import { providerEstimate } from '../../lib/research/provider.ts';
import { TREASURY_10Y } from '../../lib/research/treasury-10y-data.ts';
import { DEFAULT_RESEARCH_STATE, parseResearchState, queryOf, serialiseResearchState } from '../../components/research/research-url.ts';
import { validateBundle } from '../../scripts/research-import-core.mjs';
import type { DebtRecord, ResearchProperty } from '../../lib/research/types.ts';

const debt = (id: string, patch: Partial<DebtRecord> = {}): DebtRecord => ({ id, sourceId: 's', sequence: 0, instrumentKey: '12057:' + id, lender: 'Bank A', amountCents: 1_000_000_000, recordingDate: '2021-03-10', documentDate: null, maturity: '2027-01-01', documentNumber: id, reportedRate: null, sharedPropertyCount: 1, instrumentConflict: false, loanType: null, position: 'First', ...patch });
const property = (id: string, patch: Partial<ResearchProperty> = {}): ResearchProperty => ({ id, providerId: id, address: 'Test ' + id, countyFips: '12057', countyName: 'Hillsborough', apn: null, longitude: -82, latitude: 27, owner: null, propertyType: 'MFR', providerUnits: null, licensedUnits: [], licenseCount: 0, yearBuilt: null, estimatedValueCents: null, sourceId: 's', retrievedAt: '2026-09-12', providerDate: null, strictAddress: false, needsReview: false, flags: [], mortgages: [], tractId: null, oz: 'unmapped', rural: null, ...patch });
const scenario = { ...defaultScenario(), asOf: '2026-10-16' };

test('remaining balance matches the closed-form amortization and its edges', () => {
  // Checked against a payment-by-payment schedule: $1,000,000 at 6% over 30 years, after 60 payments.
  const i = 0.06 / 12, payment = 100_000_000 * i / (1 - Math.pow(1 + i, -360));
  let b = 100_000_000; for (let n = 0; n < 60; n++) b = b * (1 + i) - payment;
  assert.ok(Math.abs(remainingBalance(100_000_000, 6, 360, 60) - b) < 0.01);
  assert.equal(Math.round(b), 93_054_357);
  assert.equal(remainingBalance(100_000_000, 6, 360, 0), 100_000_000);
  assert.equal(remainingBalance(100_000_000, 6, 360, 360), 0);
  assert.equal(remainingBalance(100_000_000, 0, 360, 180), 50_000_000);
});
test('whole months elapse; a partial month does not count', () => {
  assert.equal(elapsedMonths('2021-03-10', '2026-10-16'), 67);
  assert.equal(elapsedMonths('2021-03-20', '2026-10-16'), 66);
  assert.equal(elapsedMonths('2026-10-20', '2026-10-16'), 0);
});
test('the Treasury series covers 1990 onward and holds later months at the latest reading', () => {
  assert.equal(TREASURY_10Y.first, '1990-01');
  assert.equal(treasury10y('1989-12'), null);
  assert.equal(treasury10y('2099-01')?.month, TREASURY_10Y.last);
  assert.ok(TREASURY_10Y.files.length >= 37 && TREASURY_10Y.files.every(f => /^[a-f0-9]{64}$/.test(f.sha256)));
});
test('the estimate range runs from low rate over 30 years to high rate over 35 years', () => {
  const e = estimateBalance(1_000_000_000, '2021-03-10', '2026-10-16')!;
  const benchmark = TREASURY_10Y.months['2021-03'];
  assert.equal(e.treasuryMonth, '2021-03');
  assert.equal(e.rateLowPct, benchmark + ESTIMATE_RULE.spreadLowPct);
  assert.equal(e.lowCents, Math.round(remainingBalance(1_000_000_000, benchmark + 1, 360, 67)));
  assert.equal(e.highCents, Math.round(remainingBalance(1_000_000_000, benchmark + 2.5, 420, 67)));
  assert.ok(e.lowCents < e.highCents && e.highCents < 1_000_000_000);
  assert.equal(estimateBalance(1_000_000_000, null, '2026-10-16'), null);
  assert.equal(estimateBalance(1_000_000_000, '2027-01-01', '2026-10-16'), null);
  assert.equal(estimateBalance(1_000_000_000, '1985-01-01', '2026-10-16'), null);
});
test('balance order: provider estimate, then our estimate, then the recorded amount; never a summed or unusable loan', () => {
  const withProvider = property('a', { mortgages: [debt('a')], providerEstimate: { mortgageBalanceCents: 900_000_000, openMortgageCents: 1_000_000_000, equityCents: null, equityPercent: null, mortgagePaymentCents: null, sourceId: 's', retrievedAt: '2026-09-12' } });
  assert.deepEqual(bestBalance(withProvider, '2026-10-16'), { source: 'provider_estimate', cents: 900_000_000 });
  const estimated = bestBalance(property('b', { mortgages: [debt('b')] }), '2026-10-16')!;
  assert.equal(estimated.source, 'estimate'); assert.equal(estimated.debtId, 'b');
  assert.equal(estimated.cents, Math.round((estimated.lowCents! + estimated.highCents!) / 2));
  assert.deepEqual(bestBalance(property('c', { mortgages: [debt('c', { recordingDate: null })] }), '2026-10-16'), { source: 'recorded', cents: 1_000_000_000, debtId: 'c' });
  assert.equal(bestBalance(property('d', { mortgages: [debt('d', { loanType: 'Loan Amount Keyed Is An Aggregate Amount' })] }), '2026-10-16'), null);
  assert.equal(bestBalance(property('e', { mortgages: [debt('e', { sharedPropertyCount: 2 })] }), '2026-10-16'), null);
});
test('provider estimates read numbers and numeric strings; zero reads as not reported', () => {
  const e = providerEstimate({ estimatedMortgageBalance: '16901534', openMortgageBalance: 17000000, estimatedEquity: 8204566, equityPercent: 32, estimatedMortgagePayment: 0 }, 'src', '2026-09-12')!;
  assert.equal(e.mortgageBalanceCents, 1_690_153_400); assert.equal(e.openMortgageCents, 1_700_000_000); assert.equal(e.equityCents, 820_456_600);
  assert.equal(e.equityPercent, 32); assert.equal(e.mortgagePaymentCents, null);
  assert.equal(providerEstimate({ estimatedMortgageBalance: '0', openMortgageBalance: 0, estimatedEquity: 0 }, 'src', '2026-09-12'), null);
});
test('24-month and balance-source filters, and balance sort', () => {
  const props = [
    property('soon', { mortgages: [debt('soon', { maturity: '2027-06-01' })] }),
    property('later', { mortgages: [debt('later', { maturity: '2030-06-01', amountCents: 5_000_000_000 })] }),
    property('passed', { mortgages: [debt('passed', { maturity: '2025-01-01', recordingDate: null })] }),
    property('none'),
  ];
  assert.deepEqual(screenProperties(props, { ...emptyQuery, within24: true }, scenario).map(r => r.id), ['soon']);
  assert.deepEqual(screenProperties(props, { ...emptyQuery, balanceSource: 'recorded' }, scenario).map(r => r.id), ['passed']);
  assert.deepEqual(screenProperties(props, { ...emptyQuery, balanceSource: 'none' }, scenario).map(r => r.id), ['none']);
  assert.deepEqual(screenProperties(props, { ...emptyQuery, sort: 'balance', direction: 'desc' }, scenario).map(r => r.id), ['later', 'passed', 'soon', 'none']);
  const coverage = summarize(screenProperties(props, emptyQuery, scenario), scenario).balanceCoverage;
  assert.deepEqual(coverage, { servicer: 0, provider_estimate: 0, estimate: 2, recorded: 1, none: 0 });
  assert.throws(() => validateQuery({ ...emptyQuery, balanceSource: 'guess' }));
  assert.equal(validateQuery({ text: 'x' }).within24, false);
});
test('the maturity wall counts a shared document once and never estimates a maturity', () => {
  const shared = debt('doc', { maturity: '2027-02-01', sharedPropertyCount: 2 });
  const rows = [
    { id: 'a', mortgages: [shared, debt('undated', { maturity: null })] },
    { id: 'b', mortgages: [{ ...shared, id: 'b:0' }, debt('old', { maturity: '2024-05-01', lender: 'Bank B' }), debt('big', { maturity: '2028-12-01', amountCents: 6_000_000_000 })] },
  ];
  const wall = maturityWall(rows, '2026-10-16');
  assert.equal(wall.loans, 4); assert.equal(wall.dated, 3); assert.equal(wall.through24, '2028-10-16');
  const by = Object.fromEntries(wall.buckets.map(b => [b.key, b]));
  assert.equal(by.past.loans, 1); assert.equal(by.undated.loans, 1);
  assert.equal(by['2027-Q1'].loans, 1); assert.equal(by['2027-Q1'].next24, true);
  assert.equal(by['2028-Q4'].loans, 1); assert.equal(by['2028-Q4'].next24, true);
  assert.equal(by['2026-Q4'].from, '2026-10-16'); assert.equal(wall.buckets.filter(b => b.kind === 'quarter').length, 20);
  // Only the February 2027 loan is inside the exact 24-month window; December 2028 is past it.
  assert.deepEqual(wall.lenders24.map(l => [l.name, l.loans]), [['Bank A', 1]]);
  assert.equal(wall.sizes24.find(s => s.label === '$10M to $25M')?.loans, 1);
});
test('the property page URL round-trips and never yields a query the server rejects', () => {
  const state = { ...DEFAULT_RESEARCH_STATE, view: 'table' as const, tab: 'maturities' as const, property: 'reapi:abc-1', colour: 'maturity' as const, county: '12057', balanceSource: 'estimate' as const, within24: true, maturityAfter: '2026-10-16', minAmount: 1000000, bounds: [-82.5, 27.1, -82.2, 27.4] as [number, number, number, number], sort: 'balance' as const, direction: 'desc' as const, at: [-82.4, 27.9, 10] as [number, number, number] };
  const query = serialiseResearchState(state);
  assert.deepEqual(parseResearchState(new URLSearchParams(query)), state);
  assert.equal(serialiseResearchState(DEFAULT_RESEARCH_STATE), '');
  const junk = parseResearchState(new URLSearchParams('view=x&tab=y&p=<script>&county=99999&src=guess&mfrom=2027-01-01&mto=2026-01-01&amin=-5&box=1,2&sort=nope'));
  assert.deepEqual(junk, DEFAULT_RESEARCH_STATE);
  validateQuery(queryOf(junk, null));
  validateQuery(queryOf(state, ['reapi:a']));
});
test('the importer accepts the research-import-3 parser and still checks the manifest', () => {
  assert.throws(() => validateBundle({ parserVersion: 'research-import-3', manifest: {}, id: 'x' }), /Invalid import manifest/);
  assert.throws(() => validateBundle({ parserVersion: 'research-import-9', manifest: {}, id: 'x' }), /Invalid import manifest/);
});
