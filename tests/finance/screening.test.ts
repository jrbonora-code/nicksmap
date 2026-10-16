import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateOperatingMetrics, monthlyPayment, sizeDebt } from "../../lib/finance/screening.ts";
import { invalid, near, random, references, value, warning } from "./helpers.ts";

const operating = references.operating.input;
const payment = references.payment.input;
const debt = references.debtSizing.input;

test("operating reference: EGI, NOI, reserves, debt and all ratios match hand arithmetic", () => {
  assert.deepEqual(value(calculateOperatingMetrics(operating)), references.operating.expected);
});

test("payment reference: published Excel PMT amount, end of month", () => {
  near(value(monthlyPayment(payment)).paymentCents, references.payment.expectedPaymentCents, references.payment.absoluteToleranceCents);
});

test("debt sizing reference: each independent cap and the binding constraint", () => {
  assert.deepEqual(value(sizeDebt(debt)), references.debtSizing.expected);
});

for (const bad of [null, undefined, "", "14500000", NaN, Infinity, -Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
  test(`reject invalid expense input: ${String(bad)}`, () => {
    invalid(calculateOperatingMetrics({ ...operating, operatingExpensesCents: bad }));
  });
}

for (const field of Object.keys(operating)) {
  test(`missing required operating field remains missing: ${field}`, () => {
    const input: Record<string, unknown> = { ...operating };
    delete input[field];
    invalid(calculateOperatingMetrics(input));
  });
}

test("unknown fields and period/currency mismatches block calculations", () => {
  invalid(calculateOperatingMetrics({ ...operating, expenseCents: 100 }), "UNKNOWN_FIELD");
  invalid(calculateOperatingMetrics({ ...operating, period: "monthly" }), "UNSUPPORTED_CONVENTION");
  invalid(calculateOperatingMetrics({ ...operating, currency: "EUR" }), "UNSUPPORTED_CONVENTION");
});

test("reject zero or fractional denominators and inconsistent acquisition inputs", () => {
  for (const field of ["unitCount", "purchasePriceCents", "totalCostCents"]) invalid(calculateOperatingMetrics({ ...operating, [field]: 0 }));
  invalid(calculateOperatingMetrics({ ...operating, unitCount: 1.5 }));
  invalid(calculateOperatingMetrics({ ...operating, totalCostCents: 1 }), "COST_BELOW_PRICE");
  invalid(calculateOperatingMetrics({ ...operating, loanBalanceCents: 0 }), "INCONSISTENT_DEBT");
  invalid(calculateOperatingMetrics({ ...operating, vacancyLossCents: operating.grossPotentialRentCents }), "RENT_LOSS_EXCEEDS_POTENTIAL");
});

test("negative economics remain negative and visible, not invalid or clamped to zero", () => {
  const result = calculateOperatingMetrics({ ...operating, operatingExpensesCents: 50000000 });
  warning(result, "NEGATIVE_CASH_FLOW");
  assert.equal(value(result).noiCents, -15500000);
  near(value(result).dscrAfterReserves!, -1.32);
});

test("zero debt has no fabricated DSCR or debt yield; loan with zero service needs review", () => {
  const unlevered = value(calculateOperatingMetrics({ ...operating, annualDebtServiceCents: 0, loanBalanceCents: 0 }));
  assert.equal(unlevered.dscrAfterReserves, null);
  assert.equal(unlevered.debtYieldOnNoi, null);
  const deferred = calculateOperatingMetrics({ ...operating, annualDebtServiceCents: 0 });
  warning(deferred, "DSCR_UNDEFINED");
  assert.equal(value(deferred).dscrAfterReserves, null);
});

test("debt above cost warns and preserves the actual ratio", () => {
  const result = calculateOperatingMetrics({ ...operating, loanBalanceCents: 600000000 });
  warning(result, "DEBT_EXCEEDS_COST");
  assert.equal(value(result).loanToCost, 1.2);
});

test("safe individual amounts whose totals overflow are blocked", () => {
  invalid(calculateOperatingMetrics({ ...operating, grossPotentialRentCents: Number.MAX_SAFE_INTEGER, otherIncomeCents: Number.MAX_SAFE_INTEGER }), "NUMERIC_OVERFLOW");
});

test("zero interest and one-month payment have closed-form hand checks", () => {
  assert.equal(value(monthlyPayment({ ...payment, principalCents: 120000, annualRate: 0, amortizationMonths: 12 })).paymentCents, 10000);
  near(value(monthlyPayment({ ...payment, principalCents: 100000, annualRate: 0.12, amortizationMonths: 1 })).paymentCents, 101000, 1e-8);
});

test("near-zero interest stays stable and does not divide by rounded zero", () => {
  near(value(monthlyPayment({ ...payment, annualRate: 1e-15 })).paymentCents, 100000, 1e-7);
});

test("loan terms reject percent/decimal mixups, negative rates and unsupported payment counts", () => {
  for (const annualRate of [-0.01, 8, Infinity, "0.08"]) invalid(monthlyPayment({ ...payment, annualRate }));
  for (const amortizationMonths of [0, -1, 12.5, 1201, null]) invalid(monthlyPayment({ ...payment, amortizationMonths }));
  invalid(monthlyPayment({ ...payment, principalCents: 0 }));
  invalid(monthlyPayment({ ...payment, principalCents: Number.MAX_SAFE_INTEGER, amortizationMonths: 1, annualRate: 1 }), "NUMERIC_OVERFLOW");
});

test("payment amortizes in an independent period-by-period balance reconstruction", () => {
  const next = random();
  for (let i = 0; i < 150; i++) {
    const principalCents = Math.floor(100000 + next() * 1e9);
    const annualRate = next() * 0.2;
    const amortizationMonths = 12 + Math.floor(next() * 349);
    const pmt = value(monthlyPayment({ currency: "USD", principalCents, annualRate, amortizationMonths })).paymentCents;
    let balance = principalCents;
    for (let month = 0; month < amortizationMonths; month++) balance += balance * annualRate / 12 - pmt;
    near(balance, 0, 0.01); // one hundredth of a cent; no contractual payment rounding in this primitive
  }
});

test("LTC, DSCR and debt yield can each bind; all tied constraints are reported", () => {
  const ltc = value(sizeDebt({ ...debt, maxLtc: 0.5 }));
  assert.equal(ltc.maximumLoanCents, 600000000);
  assert.deepEqual(ltc.bindingConstraints, ["ltc"]);
  const dscr = value(sizeDebt({ ...debt, annualCashFlowAfterReservesCents: 60000000 }));
  assert.equal(dscr.maximumLoanCents, 600000000);
  assert.deepEqual(dscr.bindingConstraints, ["dscr"]);
  const dy = value(sizeDebt({ ...debt, minDebtYield: 0.15 }));
  assert.equal(dy.maximumLoanCents, 600000000);
  assert.deepEqual(dy.bindingConstraints, ["debtYield"]);
  assert.deepEqual(value(sizeDebt({ ...debt, maxLtv: 0.6, maxLtc: 0.5 })).bindingConstraints, ["ltv", "ltc"]);
});

test("debt caps are floored to whole cents and never rounded up", () => {
  assert.equal(value(sizeDebt({ ...debt, propertyValueCents: 101, maxLtv: 0.5 })).maximumLoanCents, 50);
  assert.equal(value(sizeDebt({ ...debt, propertyValueCents: 100, maxLtv: 0.29 })).maximumLoanCents, 29);
  assert.equal(value(sizeDebt({ ...debt, propertyValueCents: 100, maxLtv: 0.58 })).maximumLoanCents, 58);
  assert.equal(value(sizeDebt({ ...debt, maxLtv: 1e-8 })).maximumLoanCents, 10);
  assert.equal(value(sizeDebt({ ...debt, annualMortgageConstant: 1e8 })).maximumLoanCents, 0);
  assert.equal(value(sizeDebt({ ...debt, maxLtv: 0 })).maximumLoanCents, 0);
});

test("negative NOI/cash flow yields zero debt capacity with a warning", () => {
  const result = sizeDebt({ ...debt, annualNoiCents: -100, annualCashFlowAfterReservesCents: -200 });
  warning(result, "NO_DEBT_CAPACITY");
  assert.equal(value(result).maximumLoanCents, 0);
});

test("missing or invalid sizing constraints cannot silently be omitted", () => {
  for (const field of Object.keys(debt)) {
    const input: Record<string, unknown> = { ...debt };
    delete input[field];
    invalid(sizeDebt(input));
  }
  for (const field of ["annualMortgageConstant", "minDscr", "minDebtYield"]) invalid(sizeDebt({ ...debt, [field]: 0 }), "ZERO_DENOMINATOR");
  invalid(sizeDebt({ ...debt, maxLtv: 75 }));
  invalid(sizeDebt({ ...debt, annualCashFlowAfterReservesCents: 100000000 }), "CASH_FLOW_EXCEEDS_NOI");
  invalid(sizeDebt({ ...debt, annualMortgageConstant: Number.MIN_VALUE }), "NUMERIC_OVERFLOW");
});

test("operating invariants: expense/reserve changes, unit scaling and loss shock", () => {
  const next = random(74);
  for (let i = 0; i < 200; i++) {
    const extra = Math.floor(next() * 1000000);
    const base = value(calculateOperatingMetrics(operating));
    const stressed = value(calculateOperatingMetrics({ ...operating, operatingExpensesCents: operating.operatingExpensesCents + extra }));
    assert.equal(stressed.noiCents, base.noiCents - extra);
    assert.equal(stressed.cashFlowAfterDebtServiceCents, base.cashFlowAfterDebtServiceCents - extra);
    assert.ok(stressed.dscrAfterReserves! <= base.dscrAfterReserves!);
    const reserves = value(calculateOperatingMetrics({ ...operating, replacementReservesCents: operating.replacementReservesCents + extra }));
    assert.equal(reserves.noiCents, base.noiCents);
    assert.equal(reserves.cashFlowAfterReservesCents, base.cashFlowAfterReservesCents - extra);
  }
  const scaled = { ...operating };
  for (const key of Object.keys(scaled) as (keyof typeof scaled)[]) {
    if (typeof scaled[key] === "number") Object.assign(scaled, { [key]: Number(scaled[key]) * 3 });
  }
  const tripled = value(calculateOperatingMetrics(scaled));
  near(tripled.dscrAfterReserves!, 1.52);
  near(tripled.entryCapRate, 0.05);
  assert.equal(tripled.pricePerUnitCents, 20000000);
});

test("debt sizing stress cannot increase permitted leverage or breach any cap", () => {
  const next = random(17);
  for (let i = 0; i < 200; i++) {
    const input = { ...debt, annualCashFlowAfterReservesCents: Math.floor(next() * 80000000), maxLtv: next(), maxLtc: next() };
    const base = value(sizeDebt(input));
    assert.ok(Number.isSafeInteger(base.maximumLoanCents));
    for (const cap of Object.values(base.limitsCents)) assert.ok(base.maximumLoanCents <= cap);
    assert.ok(base.maximumLoanCents * input.annualMortgageConstant * input.minDscr <= input.annualCashFlowAfterReservesCents + 1e-6);
    const stressed = value(sizeDebt({ ...input, minDscr: input.minDscr + 0.2, minDebtYield: input.minDebtYield + 0.02 }));
    assert.ok(stressed.maximumLoanCents <= base.maximumLoanCents);
  }
});
