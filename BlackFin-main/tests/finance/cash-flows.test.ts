import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCashFlows } from "../../lib/finance/cash-flows.ts";
import { invalid, near, random, references, value, warning } from "./helpers.ts";

const input = references.datedNpv.input;
const simple = {
  currency: "USD", annualDiscountRate: 0.1,
  cashFlows: [{ id: "equity", date: "2025-01-01", amountCents: -1000000 }, { id: "sale", date: "2026-01-01", amountCents: 1100000 }]
};

test("dated NPV matches the independently published Excel irregular-date example", () => {
  near(value(analyzeCashFlows(input)).npvCents, references.datedNpv.expectedNpvCents, references.datedNpv.absoluteToleranceCents);
});

test("one-year hand case: 10% discount on 110 for 100 invested has zero NPV", () => {
  const result = value(analyzeCashFlows(simple));
  near(result.npvCents, 0, 1e-8);
  assert.equal(result.profitCents, 100000);
  assert.equal(result.contributionsCents, 1000000);
  assert.equal(result.distributionsCents, 1100000);
  assert.equal(result.equityMultiple, 1.1);
  assert.equal(result.irrReadiness, "conventional");
});

test("zero discount equals exact net profit and preserves loss cases", () => {
  const result = value(analyzeCashFlows({ ...simple, annualDiscountRate: 0, cashFlows: [simple.cashFlows[0], { ...simple.cashFlows[1], amountCents: 500000 }] }));
  assert.equal(result.npvCents, -500000);
  assert.equal(result.profitCents, -500000);
  assert.equal(result.equityMultiple, 0.5);
});

test("Actual/365 counts the leap day, without local daylight-saving effects", () => {
  const leap = { ...simple, cashFlows: [{ ...simple.cashFlows[0], date: "2024-01-01" }, { ...simple.cashFlows[1], date: "2025-01-01" }] };
  const withLeap = value(analyzeCashFlows(leap)).npvCents;
  assert.ok(withLeap < -260 && withLeap > -262, "366 days must be discounted more than 365");
  const day = { ...simple, annualDiscountRate: 0.21, cashFlows: [{ ...simple.cashFlows[0], date: "2025-03-08" }, { ...simple.cashFlows[1], date: "2025-03-09" }] };
  const elsewhere = { ...day, cashFlows: [{ ...day.cashFlows[0], date: "2025-06-01" }, { ...day.cashFlows[1], date: "2025-06-02" }] };
  assert.equal(value(analyzeCashFlows(day)).npvCents, value(analyzeCashFlows(elsewhere)).npvCents);
});

for (const date of ["2025-02-29", "2024-02-30", "2025-04-31", "2025-13-01", "01/02/2025", "2025-1-01", "2025-01-01T00:00:00Z", "", null]) {
  test(`reject impossible or ambiguous cash-flow date: ${String(date)}`, () => {
    invalid(analyzeCashFlows({ ...simple, cashFlows: [{ ...simple.cashFlows[0], date }, simple.cashFlows[1]] }), "INVALID_DATE");
  });
}

test("valid leap date is accepted; an entry before the first date is rejected", () => {
  value(analyzeCashFlows({ ...simple, cashFlows: [{ ...simple.cashFlows[0], date: "2024-02-29" }, simple.cashFlows[1]] }));
  invalid(analyzeCashFlows({ ...simple, cashFlows: [...simple.cashFlows].reverse() }), "DATE_BEFORE_START");
});

test("later entries may be unordered and sorting never changes caller data", () => {
  const reordered = { ...input, cashFlows: [input.cashFlows[0], ...input.cashFlows.slice(1).reverse()] };
  const before = structuredClone(reordered);
  assert.deepEqual(value(analyzeCashFlows(input)), value(analyzeCashFlows(reordered)));
  assert.deepEqual(reordered, before);
});

test("duplicates are blocked rather than double-counted; separate same-date events are allowed", () => {
  invalid(analyzeCashFlows({ ...simple, cashFlows: [...simple.cashFlows, simple.cashFlows[1]] }), "DUPLICATE_CASH_FLOW");
  const result = value(analyzeCashFlows({ ...simple, cashFlows: [simple.cashFlows[0], { ...simple.cashFlows[1], amountCents: 500000 }, { ...simple.cashFlows[1], id: "sale-b", amountCents: 600000 }] }));
  near(result.npvCents, 0, 1e-8);
  assert.equal(result.equityMultiple, 1.1);
});

test("additional capital calls enter the equity multiple denominator", () => {
  const result = value(analyzeCashFlows({ ...simple, cashFlows: [simple.cashFlows[0], { id: "capital-call", date: "2025-06-01", amountCents: -1000000 }, { ...simple.cashFlows[1], amountCents: 3000000 }] }));
  assert.equal(result.equityMultiple, 1.5);
  assert.equal(result.profitCents, 1000000);
});

test("multiple-IRR classic (-100, +230, -132) is flagged, no fabricated return", () => {
  const result = analyzeCashFlows({ currency: "USD", annualDiscountRate: 0.1, cashFlows: [
    { id: "a", date: "2025-01-01", amountCents: -10000 },
    { id: "b", date: "2026-01-01", amountCents: 23000 },
    { id: "c", date: "2027-01-01", amountCents: -13200 }
  ] });
  warning(result, "NONCONVENTIONAL_CASH_FLOWS");
  assert.equal(value(result).signChanges, 2);
  assert.equal(value(result).irrReadiness, "nonconventional");
  near(value(result).npvCents, 0, 1e-8);
  assert.ok(!("irr" in value(result)));
});

test("IRR pattern is based on net amounts by date, not arbitrary line order", () => {
  const result = value(analyzeCashFlows({ ...simple, cashFlows: [simple.cashFlows[0], { id: "refund", date: "2025-01-01", amountCents: 1 }, { id: "expense", date: "2025-01-01", amountCents: -1 }, simple.cashFlows[1]] }));
  assert.equal(result.signChanges, 1);
  assert.equal(result.irrReadiness, "conventional");
});

test("single-sign, all-zero and reversed-sign flows have no investment IRR", () => {
  const positive = analyzeCashFlows({ ...simple, cashFlows: [simple.cashFlows[1]] });
  warning(positive, "NO_CONTRIBUTIONS");
  warning(positive, "IRR_NOT_APPLICABLE");
  assert.equal(value(positive).equityMultiple, null);
  const zero = analyzeCashFlows({ ...simple, cashFlows: [{ ...simple.cashFlows[0], amountCents: 0 }] });
  assert.equal(value(zero).npvCents, 0);
  assert.equal(value(zero).irrReadiness, "not_applicable");
  const reversed = analyzeCashFlows({ ...simple, cashFlows: [{ ...simple.cashFlows[0], amountCents: 1000000 }, { ...simple.cashFlows[1], amountCents: -1100000 }] });
  warning(reversed, "IRR_NOT_APPLICABLE");
});

test("discount rate domain, unknown fields, empty/sparse/oversized lists and numeric errors are blocked", () => {
  for (const annualDiscountRate of [-1, -2, 9, null, NaN, Infinity, "0.09"]) invalid(analyzeCashFlows({ ...input, annualDiscountRate }));
  for (const cashFlows of [[], null, {}, new Array(2), new Array(10001)]) invalid(analyzeCashFlows({ ...input, cashFlows }));
  invalid(analyzeCashFlows({ ...input, discountRate: 0.09 }), "UNKNOWN_FIELD");
  for (const amountCents of [null, NaN, Infinity, "100", 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    invalid(analyzeCashFlows({ ...simple, cashFlows: [{ ...simple.cashFlows[0], amountCents }, simple.cashFlows[1]] }));
  }
});

test("negative discount rate is supported; numerical overflow is blocked", () => {
  const result = value(analyzeCashFlows({ ...simple, annualDiscountRate: -0.5 }));
  assert.equal(result.npvCents, 1200000);
  invalid(analyzeCashFlows({ ...simple, annualDiscountRate: -0.999, cashFlows: [simple.cashFlows[0], { ...simple.cashFlows[1], date: "2200-01-01" }] }), "NUMERIC_OVERFLOW");
  invalid(analyzeCashFlows({ ...simple, cashFlows: [simple.cashFlows[0], { ...simple.cashFlows[1], amountCents: Number.MAX_SAFE_INTEGER }, { id: "extra", date: "2026-01-01", amountCents: 1 }] }), "NUMERIC_OVERFLOW");
});

test("independent F1 regression: finite cancellation cannot establish an accurate NPV", () => {
  const regression = { currency: "USD", annualDiscountRate: -0.5, cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: 0 },
    { id: "out", date: "2064-12-22", amountCents: -1000000000 },
    { id: "in", date: "2065-12-22", amountCents: 500000000 }
  ] };
  // The independent review's exact integer oracle: 40 and 41 Actual/365 years.
  const expected = -(1000000000n * 2n ** 40n) + (500000000n * 2n ** 41n);
  assert.equal(expected, 0n);
  const result = analyzeCashFlows(regression);
  assert.ok(!result.ok || Math.abs(result.value.npvCents - Number(expected)) <= 0.01, JSON.stringify(result));
});

test("independent F2 regression: adding a distant zero preserves a computable NPV", () => {
  const regression = { currency: "USD", annualDiscountRate: -0.999, cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: -10000 },
    { id: "exit", date: "2026-01-01", amountCents: 10 }
  ] };
  const control = value(analyzeCashFlows(regression));
  const withZero = value(analyzeCashFlows({ ...regression, cashFlows: [
    ...regression.cashFlows, { id: "zero", date: "2200-01-01", amountCents: 0 }
  ] }));
  assert.deepEqual(withZero, control);
});

test("NPV precision envelope accepts its supported side and blocks the adjacent larger schedule", () => {
  const { supportedBoundary, unsupportedBoundary, absoluteToleranceCents } = references.datedNpvPrecision;
  near(value(analyzeCashFlows(supportedBoundary.input)).npvCents, supportedBoundary.expectedNpvCents, absoluteToleranceCents);
  invalid(analyzeCashFlows(unsupportedBoundary.input), unsupportedBoundary.expectedIssue);
});

test("NPV near the precision envelope agrees with independent 100-digit Decimal references", () => {
  for (const reference of references.datedNpvPrecision.decimalCases) {
    near(value(analyzeCashFlows(reference.input)).npvCents, reference.expectedNpvCents, references.datedNpvPrecision.absoluteToleranceCents);
  }
});

test("large opposing terms are blocked at both independently reviewed horizons", () => {
  for (const dates of [["2064-12-22", "2065-12-22"], ["2074-12-20", "2075-12-20"]]) {
    const result = analyzeCashFlows({ currency: "USD", annualDiscountRate: -0.5, cashFlows: [
      { id: "start", date: "2025-01-01", amountCents: 0 },
      { id: "out", date: dates[0], amountCents: -1000000000 },
      { id: "in", date: dates[1], amountCents: 500000000 }
    ] });
    invalid(result, "NPV_PRECISION_UNSUPPORTED");
  }
});

test("extreme future offset groups preserve NPV, gross accounting and the chronological sign pattern", () => {
  const result = value(analyzeCashFlows({ currency: "USD", annualDiscountRate: -0.999, cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: -10000 },
    { id: "exit", date: "2026-01-01", amountCents: 10 },
    { id: "future-in", date: "9999-12-31", amountCents: 20000 },
    { id: "future-out", date: "9999-12-31", amountCents: -20000 }
  ] }));
  near(result.npvCents, 0, 0.01);
  assert.equal(result.contributionsCents, 30000);
  assert.equal(result.distributionsCents, 20010);
  assert.equal(result.profitCents, -9990);
  assert.equal(result.equityMultiple, 20010 / 30000);
  assert.equal(result.signChanges, 1);
  assert.equal(result.irrReadiness, "conventional");
});

test("a zero opening date remains the valuation date, including an offset opening group", () => {
  const zeroOpening = { currency: "USD", annualDiscountRate: 1, cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: 0 },
    { id: "later", date: "2026-01-01", amountCents: 100 }
  ] };
  assert.equal(value(analyzeCashFlows(zeroOpening)).npvCents, 50);
  const result = value(analyzeCashFlows({ ...zeroOpening, cashFlows: [
    { ...zeroOpening.cashFlows[0], amountCents: -100 },
    { id: "offset", date: "2025-01-01", amountCents: 100 },
    zeroOpening.cashFlows[1]
  ] }));
  assert.equal(result.npvCents, 50);
  assert.equal(result.contributionsCents, 100);
  assert.equal(result.distributionsCents, 200);
  assert.equal(result.equityMultiple, 2);
});

test("zero-only distant dates impose no discount horizon limit, but validation still applies", () => {
  const zeros = { currency: "USD", annualDiscountRate: -0.9999999999999999, cashFlows: [
    { id: "start", date: "0000-01-01", amountCents: 0 },
    { id: "end", date: "9999-12-31", amountCents: 0 }
  ] };
  const result = analyzeCashFlows(zeros);
  assert.equal(value(result).npvCents, 0);
  warning(result, "NO_CONTRIBUTIONS");
  warning(result, "IRR_NOT_APPLICABLE");
  invalid(analyzeCashFlows({ ...zeros, cashFlows: [...zeros.cashFlows, zeros.cashFlows[1]] }), "DUPLICATE_CASH_FLOW");
  invalid(analyzeCashFlows({ ...zeros, cashFlows: [...zeros.cashFlows].reverse() }), "DATE_BEFORE_START");
  invalid(analyzeCashFlows({ ...zeros, cashFlows: [zeros.cashFlows[0], { ...zeros.cashFlows[1], date: "9999-02-29" }] }), "INVALID_DATE");
});

test("exact NPV paths retain the full safe-integer range without a floating precision rejection", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const zeroRate = value(analyzeCashFlows({ currency: "USD", annualDiscountRate: 0, cashFlows: [
    { id: "start", date: "0000-01-01", amountCents: -maximum },
    { id: "end", date: "9999-12-31", amountCents: maximum - 1 }
  ] }));
  assert.equal(zeroRate.npvCents, -1);
  const openingOnly = value(analyzeCashFlows({ currency: "USD", annualDiscountRate: -0.9999999999999999, cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: maximum },
    { id: "zero", date: "9999-12-31", amountCents: 0 }
  ] }));
  assert.equal(openingOnly.npvCents, maximum);
});

test("rate sensitivity near minus 100 percent can exceed the supported precision envelope", () => {
  invalid(analyzeCashFlows({ currency: "USD", annualDiscountRate: -0.9999999999999999, cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: -1 },
    { id: "end", date: "2025-01-02", amountCents: 1 }
  ] }), "NPV_PRECISION_UNSUPPORTED");
});

test("dated NPV invariants: scaling, delayed receipt and rate stress", () => {
  const next = random(9);
  const base = value(analyzeCashFlows(simple));
  for (let i = 0; i < 150; i++) {
    const factor = 1 + Math.floor(next() * 100);
    const scaled = value(analyzeCashFlows({ ...simple, cashFlows: simple.cashFlows.map(flow => ({ ...flow, amountCents: flow.amountCents * factor })) }));
    near(scaled.npvCents, base.npvCents * factor, 1e-6);
    assert.equal(scaled.equityMultiple, base.equityMultiple);
    const shocked = value(analyzeCashFlows({ ...simple, annualDiscountRate: 0.1 + next() * 0.8 }));
    assert.ok(shocked.npvCents <= base.npvCents + 1e-8);
  }
  const delayed = value(analyzeCashFlows({ ...simple, cashFlows: [simple.cashFlows[0], { ...simple.cashFlows[1], date: "2027-01-01" }] }));
  assert.ok(delayed.npvCents < base.npvCents);
});
