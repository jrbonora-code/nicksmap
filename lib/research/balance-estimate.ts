// Estimated balance range of a recorded mortgage. Display only: never an operating input, a recorded basis or a
// payoff (docs/DEBT-BASIS.md). The rule, approved October 16, 2026:
//   rate  = monthly-average 10-year Treasury in the recording month + a spread of 1.0 to 2.5 percentage points
//   term  = repayment over 30 to 35 years, monthly, from the recording month to the as-of month
//   range = low rate over 30 years (more principal repaid) to high rate over 35 years (less repaid)
// Interest-only periods, prepayments, extensions and refinancing are not modelled.
import { TREASURY_10Y } from './treasury-10y-data.ts';
import { usableRecordedAmount } from './debt.ts';
import { scenarioBase } from './finance.ts';
import { servicerBalance } from './debt-sources.ts';
import type { BalanceReading, DebtRecord, ResearchProperty } from './types.ts';

export const ESTIMATE_RULE = {
  spreadLowPct: 1.0, spreadHighPct: 2.5, amortizationLowYears: 30, amortizationHighYears: 35,
  benchmark: '10-year Treasury par yield, monthly average of daily readings',
} as const;

export type BalanceEstimate = {
  lowCents: number; highCents: number; midCents: number;
  treasuryMonth: string; treasuryPct: number; rateLowPct: number; rateHighPct: number; elapsedMonths: number;
};

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
/** The benchmark for a recording month: before the series starts there is none; after it ends, the latest month. */
export function treasury10y(month: string): { month: string; pct: number } | null {
  if (!/^\d{4}-\d{2}$/.test(month) || month < TREASURY_10Y.first) return null;
  const key = month > TREASURY_10Y.last ? TREASURY_10Y.last : month;
  const pct = TREASURY_10Y.months[key];
  return typeof pct === 'number' ? { month: key, pct } : null;
}
/** Balance after `elapsed` level monthly payments on a loan amortizing over `amortization` months. */
export function remainingBalance(principalCents: number, annualRatePct: number, amortization: number, elapsed: number): number {
  if (elapsed <= 0) return principalCents;
  if (elapsed >= amortization) return 0;
  const i = annualRatePct / 100 / 12;
  if (i === 0) return principalCents * (1 - elapsed / amortization);
  const grow = (n: number) => Math.pow(1 + i, n);
  return Math.max(0, principalCents * (grow(amortization) - grow(elapsed)) / (grow(amortization) - 1));
}
/** Whole months from the recording date to the as-of date; a partial month does not count. */
export function elapsedMonths(recordingDate: string, asOf: string): number {
  const months = monthIndex(asOf) - monthIndex(recordingDate) - (Number(asOf.slice(8, 10)) < Number(recordingDate.slice(8, 10)) ? 1 : 0);
  return Math.max(0, months);
}
export function estimateBalance(amountCents: number | null, recordingDate: string | null, asOf: string): BalanceEstimate | null {
  if (amountCents === null || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !recordingDate || !/^\d{4}-\d{2}-\d{2}$/.test(recordingDate) || recordingDate > asOf) return null;
  const benchmark = treasury10y(recordingDate.slice(0, 7));
  if (!benchmark) return null;
  const n = elapsedMonths(recordingDate, asOf);
  const rateLowPct = benchmark.pct + ESTIMATE_RULE.spreadLowPct, rateHighPct = benchmark.pct + ESTIMATE_RULE.spreadHighPct;
  const lowCents = Math.round(remainingBalance(amountCents, rateLowPct, ESTIMATE_RULE.amortizationLowYears * 12, n));
  const highCents = Math.round(remainingBalance(amountCents, rateHighPct, ESTIMATE_RULE.amortizationHighYears * 12, n));
  return { lowCents, highCents, midCents: Math.round((lowCents + highCents) / 2), treasuryMonth: benchmark.month, treasuryPct: benchmark.pct, rateLowPct, rateHighPct, elapsedMonths: n };
}
/** The estimate for one recorded entry, only where its amount qualifies (no aggregate, truncated, conflicting, duplicate or closed entry). */
export function debtEstimate(d: DebtRecord, asOf: string): BalanceEstimate | null {
  return usableRecordedAmount(d) ? estimateBalance(d.amountCents, d.recordingDate, asOf) : null;
}
/**
 * The property's balance figure, best source first: servicer-reported (a confirmed HUD or CMBS link), the provider's estimate, our
 * estimate of the default recorded instrument, then that instrument's recorded amount. Instruments are never summed.
 */
export function bestBalance(p: Pick<ResearchProperty, 'mortgages' | 'providerEstimate' | 'servicer'>, asOf: string, base: DebtRecord | null = scenarioBase(p.mortgages)): BalanceReading | null {
  const servicer = servicerBalance(p.servicer);
  if (servicer) return { source: 'servicer', cents: servicer.cents, via: servicer.via, asOf: servicer.asOf };
  const provider = p.providerEstimate?.mortgageBalanceCents ?? null;
  if (provider !== null && provider > 0) return { source: 'provider_estimate', cents: provider };
  if (base) {
    const e = estimateBalance(base.amountCents, base.recordingDate, asOf);
    if (e) return { source: 'estimate', cents: e.midCents, lowCents: e.lowCents, highCents: e.highCents, debtId: base.id };
    if (base.amountCents !== null) return { source: 'recorded', cents: base.amountCents, debtId: base.id };
  }
  return null;
}
export const BALANCE_SOURCE_LABELS = { servicer: 'Servicer-reported', provider_estimate: 'Provider estimate', estimate: 'Estimate', recorded: 'Recorded amount', none: 'No balance' } as const;
