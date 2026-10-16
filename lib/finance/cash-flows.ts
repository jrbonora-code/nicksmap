import { Inspection, type CalculationResult } from "./validation.ts";

// Supported binary64 screening envelope, in cents; see CALCULATION-VALIDATION.md.
// This reserve accounts for large terms before they can cancel in the final NPV.
const NPV_ABSOLUTE_TOLERANCE_CENTS = 0.01;
const NPV_ROUNDOFF_RESERVE = 64 * Number.EPSILON;

export type CashFlowAnalysis = {
  npvCents: number;
  contributionsCents: number;
  distributionsCents: number;
  profitCents: number;
  equityMultiple: number | null;
  signChanges: number;
  irrReadiness: "conventional" | "nonconventional" | "not_applicable";
};

/** Actual/365 dated NPV and gross contribution/distribution totals. No IRR solver. */
export function analyzeCashFlows(input: unknown): CalculationResult<CashFlowAnalysis> {
  const check = new Inspection();
  const raw = check.record(input, ["currency", "annualDiscountRate", "cashFlows"]);
  check.literal(raw.currency, "USD", "currency");
  const rate = check.number(raw.annualDiscountRate, "annualDiscountRate", -1, 1);
  if (rate === -1) check.issue("INVALID_DISCOUNT_RATE", "annualDiscountRate", "The annual discount rate must exceed -100%.");
  const ids = new Set<string>();
  const flows = check.list(raw.cashFlows, "cashFlows").map((item, index) => {
    const path = `cashFlows[${index}]`;
    const flow = check.record(item, ["id", "date", "amountCents"], path);
    const id = check.text(flow.id, `${path}.id`);
    if (ids.has(id)) check.issue("DUPLICATE_CASH_FLOW", `${path}.id`, "Duplicate cash-flow identifier; check for a repeated import.");
    ids.add(id);
    return { timestamp: check.date(flow.date, `${path}.date`), amount: check.cents(flow.amountCents, `${path}.amountCents`, -Number.MAX_SAFE_INTEGER) };
  });
  if (check.failed) return check.blocked();
  const baseDate = flows[0].timestamp;
  if (flows.some(flow => flow.timestamp < baseDate)) check.issue("DATE_BEFORE_START", "cashFlows", "The first cash-flow date must be the earliest; later entries may be unordered.");
  if (check.failed) return check.blocked();
  const contributionsCents = check.sum(flows.filter(flow => flow.amount < 0).map(flow => -flow.amount), "contributionsCents");
  const distributionsCents = check.sum(flows.filter(flow => flow.amount > 0).map(flow => flow.amount), "distributionsCents");
  const profitCents = check.sum([distributionsCents, -contributionsCents], "profitCents");
  const byDate = new Map<number, number[]>();
  for (const flow of flows) byDate.set(flow.timestamp, [...(byDate.get(flow.timestamp) ?? []), flow.amount]);
  const netByDate = [...byDate].sort(([a], [b]) => a - b).map(([date, amounts]) => ({ date, amount: check.sum(amounts, "netCashFlowCents") }));
  if (check.failed) return check.blocked();
  // Zero-rate and opening-date-only series have an exact integer-cent answer.
  let npvCents = profitCents;
  if (rate !== 0 && netByDate.some(flow => flow.amount !== 0 && flow.date !== baseDate)) {
    npvCents = 0;
    let compensation = 0;
    let precisionReserveCents = 0;
    for (const flow of netByDate) {
      // Do this after gross accounting and after fixing the original valuation date.
      // A zero amount has zero PV even if its unused discount factor would overflow.
      if (flow.amount === 0) continue;
      const years = (flow.date - baseDate) / 86_400_000 / 365;
      const exponent = -years * Math.log1p(rate);
      const term = flow.amount * Math.exp(exponent);
      if (!Number.isFinite(term)) {
        check.issue("NUMERIC_OVERFLOW", "result.npvCents", "A discounted cash flow exceeds the supported numeric range.");
        return check.blocked();
      }
      // log/exp, date division and input-rate sensitivity scale with the exponent
      // and years * |r| / (1+r). The constant also reserves summation roundoff.
      // Use absolute terms: a small final sum cannot repair already-rounded terms.
      precisionReserveCents += NPV_ROUNDOFF_RESERVE * Math.abs(term) *
        (2 + Math.abs(exponent) + years * Math.abs(rate) / (1 + rate));
      const adjusted = term - compensation;
      const next = npvCents + adjusted;
      compensation = (next - npvCents) - adjusted;
      npvCents = next;
    }
    if (precisionReserveCents > NPV_ABSOLUTE_TOLERANCE_CENTS) {
      check.issue("NPV_PRECISION_UNSUPPORTED", "result.npvCents", "The discounted terms exceed the supported 0.01-cent NPV precision envelope; use a reviewed higher-precision calculation.");
    }
  }
  if (check.failed) return check.blocked();
  const signs = netByDate.map(flow => Math.sign(flow.amount)).filter(sign => sign !== 0);
  const signChanges = signs.slice(1).filter((sign, index) => sign !== signs[index]).length;
  const irrReadiness = signChanges === 1 && signs[0] === -1 ? "conventional" : signChanges > 1 ? "nonconventional" : "not_applicable";
  if (irrReadiness === "nonconventional") check.issue("NONCONVENTIONAL_CASH_FLOWS", "cashFlows", "Multiple sign changes can produce multiple or absent IRRs; do not select a single solver result blindly.", "warning");
  if (irrReadiness === "not_applicable") check.issue("IRR_NOT_APPLICABLE", "cashFlows", "This series does not have a conventional investment-return pattern.", "warning");
  if (contributionsCents === 0) check.issue("NO_CONTRIBUTIONS", "cashFlows", "Equity multiple is undefined without an equity contribution.", "warning");
  return check.result({ npvCents, contributionsCents, distributionsCents, profitCents,
    equityMultiple: contributionsCents === 0 ? null : distributionsCents / contributionsCents, signChanges, irrReadiness });
}
