// The maturity wall: current recorded mortgages by reported maturity. Quarters for five years from the scenario
// date, the first 24 months emphasised, then "Later", "Passed" and "No reported maturity". No maturity is estimated.
// A recorded instrument seen on several property records counts once (county + document identity).
import { usableRecordedAmount } from './debt.ts';
import { debtEstimate } from './balance-estimate.ts';
import type { DebtRecord, MaturityWall, MaturityWallBucket, ScreenRow } from './types.ts';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
};
const quarterOf = (date: string) => ({ year: Number(date.slice(0, 4)), q: Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1 });
const quarterStart = (year: number, q: number) => `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
const quarterEnd = (year: number, q: number) => iso(new Date(Date.UTC(year, q * 3, 0)));
export const SIZE_CLASSES = [['Under $5M', 0, 5e8], ['$5M to $10M', 5e8, 1e9], ['$10M to $25M', 1e9, 2.5e9], ['$25M to $50M', 2.5e9, 5e9], ['$50M and over', 5e9, Infinity]] as const;
const QUARTERS = 20;

export function maturityWall(rows: Pick<ScreenRow, 'id' | 'mortgages'>[], asOf: string): MaturityWall {
  const through24 = addMonths(asOf, 24);
  // One loan per recorded instrument across property records.
  const loans = new Map<string, DebtRecord>();
  for (const row of rows) for (const d of row.mortgages) { const key = d.instrumentKey ?? d.id; if (!loans.has(key)) loans.set(key, d); }
  const start = quarterOf(asOf);
  const buckets: MaturityWallBucket[] = [];
  const blank = (key: string, label: string, kind: MaturityWallBucket['kind'], next24: boolean, from: string | null, to: string | null): MaturityWallBucket =>
    ({ key, label, kind, next24, loans: 0, recordedCents: 0, recordedLoans: 0, estimateLowCents: 0, estimateHighCents: 0, estimatedLoans: 0, lenders: [], from, to });
  buckets.push(blank('past', 'Passed', 'past', false, null, dayBefore(asOf)));
  for (let i = 0; i < QUARTERS; i++) {
    const year = start.year + Math.floor((start.q - 1 + i) / 4), q = ((start.q - 1 + i) % 4) + 1;
    const from = i === 0 ? asOf : quarterStart(year, q), to = quarterEnd(year, q);
    buckets.push(blank(`${year}-Q${q}`, `Q${q} ${year}`, 'quarter', from <= through24, from, to));
  }
  const lastEnd = buckets.at(-1)!.to!;
  buckets.push(blank('later', 'Later', 'later', false, dayAfter(lastEnd), null));
  buckets.push(blank('undated', 'No reported maturity', 'undated', false, null, null));
  const lenderCounts = new Map<string, Map<string, number>>();
  const lenders24 = new Map<string, MaturityWall['lenders24'][number]>();
  const sizes24 = SIZE_CLASSES.map(([label]) => ({ label: label as string, loans: 0 }));
  let unsized24 = 0;
  for (const d of loans.values()) {
    const m = d.maturity;
    const bucket = m === null ? buckets.at(-1)! : m < asOf ? buckets[0] : m > lastEnd ? buckets.at(-2)! : buckets.find(b => b.kind === 'quarter' && m >= b.from! && m <= b.to!)!;
    bucket.loans++;
    const amount = usableRecordedAmount(d) ? d.amountCents! : null;
    if (amount !== null) { bucket.recordedCents += amount; bucket.recordedLoans++; }
    const estimate = debtEstimate(d, asOf);
    if (estimate) { bucket.estimateLowCents += estimate.lowCents; bucket.estimateHighCents += estimate.highCents; bucket.estimatedLoans++; }
    const name = d.lender ?? 'Lender not reported';
    const counts = lenderCounts.get(bucket.key) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1); lenderCounts.set(bucket.key, counts);
    if (m !== null && m >= asOf && m <= through24) {
      const l = lenders24.get(name) ?? { name, loans: 0, recordedCents: 0, estimateLowCents: 0, estimateHighCents: 0, earliest: m };
      l.loans++; l.recordedCents += amount ?? 0; l.estimateLowCents += estimate?.lowCents ?? 0; l.estimateHighCents += estimate?.highCents ?? 0;
      if (m < l.earliest) l.earliest = m;
      lenders24.set(name, l);
      if (amount === null) unsized24++;
      else sizes24[SIZE_CLASSES.findIndex(([, lo, hi]) => amount >= lo && amount < hi)].loans++;
    }
  }
  for (const b of buckets) b.lenders = [...(lenderCounts.get(b.key) ?? new Map()).entries()].map(([name, n]) => ({ name, loans: n })).sort((a, b2) => b2.loans - a.loans || a.name.localeCompare(b2.name)).slice(0, 3);
  if (unsized24) sizes24.push({ label: 'Amount not usable', loans: unsized24 });
  return {
    asOf, through24, loans: loans.size, dated: [...loans.values()].filter(d => d.maturity !== null).length, buckets,
    lenders24: [...lenders24.values()].sort((a, b) => b.loans - a.loans || b.recordedCents - a.recordedCents || a.name.localeCompare(b.name)),
    sizes24,
  };
}
function dayBefore(date: string) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return iso(d); }
function dayAfter(date: string) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return iso(d); }
export { addMonths };
