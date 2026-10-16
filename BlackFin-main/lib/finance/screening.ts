import { Inspection, type CalculationResult } from "./validation.ts";

export type OperatingMetrics = {
  effectiveGrossIncomeCents: number;
  noiCents: number;
  cashFlowAfterReservesCents: number;
  cashFlowAfterDebtServiceCents: number;
  dscrAfterReserves: number | null;
  debtYieldOnNoi: number | null;
  entryCapRate: number;
  yieldOnCost: number;
  loanToCost: number;
  pricePerUnitCents: number;
};

/** Annual USD screening convention; reserves are below NOI, DSCR is after reserves. */
export function calculateOperatingMetrics(input: unknown): CalculationResult<OperatingMetrics> {
  const check = new Inspection();
  const moneyFields = ["grossPotentialRentCents", "vacancyLossCents", "concessionsCents", "creditLossCents",
    "otherIncomeCents", "operatingExpensesCents", "replacementReservesCents", "annualDebtServiceCents",
    "loanBalanceCents", "purchasePriceCents", "totalCostCents"] as const;
  const raw = check.record(input, ["currency", "period", "unitCount", ...moneyFields]);
  check.literal(raw.currency, "USD", "currency");
  check.literal(raw.period, "annual", "period");
  const money = Object.fromEntries(moneyFields.map(field => [field, check.cents(raw[field], field,
    field === "purchasePriceCents" || field === "totalCostCents" ? 1 : 0)])) as Record<typeof moneyFields[number], number>;
  const unitCount = check.number(raw.unitCount, "unitCount", 1, Number.MAX_SAFE_INTEGER, true);
  if (check.failed) return check.blocked();

  const losses = check.sum([money.vacancyLossCents, money.concessionsCents, money.creditLossCents], "rentLossesCents");
  if (losses > money.grossPotentialRentCents) check.issue("RENT_LOSS_EXCEEDS_POTENTIAL", "rentLossesCents", "Rent losses exceed gross potential rent; check period, sign and double counting.");
  if (money.totalCostCents < money.purchasePriceCents) check.issue("COST_BELOW_PRICE", "totalCostCents", "Total acquisition cost cannot exclude part of the purchase price in this convention.");
  if (money.loanBalanceCents === 0 && money.annualDebtServiceCents > 0) check.issue("INCONSISTENT_DEBT", "annualDebtServiceCents", "Debt service has no corresponding loan balance; verify dates and debt scope.");
  if (check.failed) return check.blocked();

  const effectiveGrossIncomeCents = check.sum([money.grossPotentialRentCents, -losses, money.otherIncomeCents], "effectiveGrossIncomeCents");
  const noiCents = check.sum([effectiveGrossIncomeCents, -money.operatingExpensesCents], "noiCents");
  const cashFlowAfterReservesCents = check.sum([noiCents, -money.replacementReservesCents], "cashFlowAfterReservesCents");
  const cashFlowAfterDebtServiceCents = check.sum([cashFlowAfterReservesCents, -money.annualDebtServiceCents], "cashFlowAfterDebtServiceCents");
  if (check.failed) return check.blocked();
  if (cashFlowAfterDebtServiceCents < 0) check.issue("NEGATIVE_CASH_FLOW", "cashFlowAfterDebtServiceCents", "Annual cash flow after reserves and debt service is negative.", "warning");
  if (money.annualDebtServiceCents === 0 && money.loanBalanceCents > 0) check.issue("DSCR_UNDEFINED", "annualDebtServiceCents", "Zero debt service makes DSCR undefined; verify any deferral or interest-only assumption.", "warning");
  if (money.loanBalanceCents > money.totalCostCents) check.issue("DEBT_EXCEEDS_COST", "loanBalanceCents", "Loan balance exceeds total cost; review the financing assumptions.", "warning");
  return check.result({
    effectiveGrossIncomeCents, noiCents, cashFlowAfterReservesCents, cashFlowAfterDebtServiceCents,
    dscrAfterReserves: money.annualDebtServiceCents === 0 ? null : cashFlowAfterReservesCents / money.annualDebtServiceCents,
    debtYieldOnNoi: money.loanBalanceCents === 0 ? null : noiCents / money.loanBalanceCents,
    entryCapRate: noiCents / money.purchasePriceCents,
    yieldOnCost: noiCents / money.totalCostCents,
    loanToCost: money.loanBalanceCents / money.totalCostCents,
    pricePerUnitCents: money.purchasePriceCents / unitCount
  });
}

export function monthlyPayment(input: unknown): CalculationResult<{ paymentCents: number }> {
  const check = new Inspection();
  const raw = check.record(input, ["currency", "principalCents", "annualRate", "amortizationMonths"]);
  check.literal(raw.currency, "USD", "currency");
  const principal = check.cents(raw.principalCents, "principalCents", 1);
  const annualRate = check.number(raw.annualRate, "annualRate", 0, 1);
  const months = check.number(raw.amortizationMonths, "amortizationMonths", 1, 1200, true);
  if (check.failed) return check.blocked();
  const rate = annualRate / 12;
  // End-of-month constant P&I, zero residual. No fees, escrows or IO transition.
  const paymentCents = rate === 0 ? principal / months : principal * rate / -Math.expm1(-months * Math.log1p(rate));
  return check.result({ paymentCents });
}

export type DebtSizing = { maximumLoanCents: number; limitsCents: Record<"ltv" | "ltc" | "dscr" | "debtYield", number>; bindingConstraints: string[] };

export function sizeDebt(input: unknown): CalculationResult<DebtSizing> {
  const check = new Inspection();
  const raw = check.record(input, ["currency", "period", "propertyValueCents", "totalCostCents", "annualNoiCents",
    "annualCashFlowAfterReservesCents", "annualMortgageConstant", "maxLtv", "maxLtc", "minDscr", "minDebtYield"]);
  check.literal(raw.currency, "USD", "currency");
  check.literal(raw.period, "annual", "period");
  const value = check.cents(raw.propertyValueCents, "propertyValueCents", 1);
  const cost = check.cents(raw.totalCostCents, "totalCostCents", 1);
  const noi = check.cents(raw.annualNoiCents, "annualNoiCents", -Number.MAX_SAFE_INTEGER);
  const cashFlow = check.cents(raw.annualCashFlowAfterReservesCents, "annualCashFlowAfterReservesCents", -Number.MAX_SAFE_INTEGER);
  const constant = check.positive(raw.annualMortgageConstant, "annualMortgageConstant");
  const ltv = check.number(raw.maxLtv, "maxLtv", 0, 1);
  const ltc = check.number(raw.maxLtc, "maxLtc", 0, 1);
  const dscr = check.positive(raw.minDscr, "minDscr");
  const debtYield = check.positive(raw.minDebtYield, "minDebtYield", 1);
  if (cashFlow > noi) check.issue("CASH_FLOW_EXCEEDS_NOI", "annualCashFlowAfterReservesCents", "Cash flow after nonnegative reserves cannot exceed NOI in this convention.");
  if (check.failed) return check.blocked();
  // Floor each cap to whole cents so rounding cannot authorize excess proceeds.
  const limitsCents = {
    ltv: check.floorRatio(value, [ltv], [], "limitsCents.ltv"),
    ltc: check.floorRatio(cost, [ltc], [], "limitsCents.ltc"),
    dscr: check.floorRatio(Math.max(0, cashFlow), [], [dscr, constant], "limitsCents.dscr"),
    debtYield: check.floorRatio(Math.max(0, noi), [], [debtYield], "limitsCents.debtYield")
  };
  if (check.failed) return check.blocked();
  const maximumLoanCents = Math.min(...Object.values(limitsCents));
  if (maximumLoanCents === 0) check.issue("NO_DEBT_CAPACITY", "maximumLoanCents", "At least one specified constraint permits no debt.", "warning");
  return check.result({ maximumLoanCents, limitsCents,
    bindingConstraints: Object.entries(limitsCents).filter(([, cap]) => cap === maximumLoanCents).map(([name]) => name) });
}
