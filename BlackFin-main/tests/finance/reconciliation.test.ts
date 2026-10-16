import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileSourcesAndUses } from "../../lib/finance/reconciliation.ts";
import { calculateOperatingMetrics, monthlyPayment, sizeDebt } from "../../lib/finance/screening.ts";
import { analyzeCashFlows } from "../../lib/finance/cash-flows.ts";
import { invalid, random, value, warning } from "./helpers.ts";

const input = { currency: "USD", sources: [{ id: "loan", amountCents: 70000000 }, { id: "equity", amountCents: 30000000 }],
  uses: [{ id: "price", amountCents: 90000000 }, { id: "fees", amountCents: 10000000 }] };

test("sources and uses hand check: exact cent balance", () => {
  assert.deepEqual(value(reconcileSourcesAndUses(input)), { sourcesCents: 100000000, usesCents: 100000000,
    differenceCents: 0, fundingGapCents: 0, surplusCents: 0, balanced: true });
});

test("a one-cent funding gap is never rounded away or declared balanced", () => {
  const result = reconcileSourcesAndUses({ ...input, uses: [...input.uses, { id: "extra-fee", amountCents: 1 }] });
  warning(result, "UNBALANCED_SOURCES_USES");
  assert.equal(value(result).balanced, false);
  assert.equal(value(result).differenceCents, -1);
  assert.equal(value(result).fundingGapCents, 1);
  assert.equal(value(result).surplusCents, 0);
});

test("surplus is explicitly unallocated, not silently treated as equity profit", () => {
  const result = reconcileSourcesAndUses({ ...input, sources: [...input.sources, { id: "extra", amountCents: 100 }] });
  warning(result, "UNBALANCED_SOURCES_USES");
  assert.equal(value(result).surplusCents, 100);
  assert.equal(value(result).fundingGapCents, 0);
  assert.equal(value(result).balanced, false);
});

test("duplicate line IDs within and across sources/uses block double counting", () => {
  invalid(reconcileSourcesAndUses({ ...input, sources: [...input.sources, input.sources[0]] }), "DUPLICATE_LINE");
  invalid(reconcileSourcesAndUses({ ...input, uses: [...input.uses, input.sources[0]] }), "DUPLICATE_LINE");
});

test("line currency, amounts and identifiers require explicit valid values", () => {
  invalid(reconcileSourcesAndUses({ ...input, currency: "CAD" }), "UNSUPPORTED_CONVENTION");
  for (const amountCents of [-1, 0.01, "100", undefined, null, Infinity]) {
    invalid(reconcileSourcesAndUses({ ...input, sources: [{ id: "a", amountCents }] }));
  }
  for (const id of ["", " loan", "loan ", "x".repeat(201), null, 7]) {
    invalid(reconcileSourcesAndUses({ ...input, sources: [{ id, amountCents: 100 }] }), "INVALID_IDENTIFIER");
  }
  invalid(reconcileSourcesAndUses({ ...input, sources: [{ id: "loan", amountCents: 100, currency: "USD" }] }), "UNKNOWN_FIELD");
});

test("overflow, missing sides, empty and sparse arrays fail without partial balances", () => {
  invalid(reconcileSourcesAndUses({ ...input, sources: [{ id: "a", amountCents: Number.MAX_SAFE_INTEGER }, { id: "b", amountCents: 1 }] }), "NUMERIC_OVERFLOW");
  for (const uses of [null, undefined, [], new Array(2), new Array(10001)]) invalid(reconcileSourcesAndUses({ ...input, uses }));
});

test("reconciliation identities hold for varied independent transaction totals", () => {
  const next = random(6);
  for (let i = 0; i < 200; i++) {
    const source = Math.floor(next() * 1e10);
    const use = Math.floor(next() * 1e10);
    const result = value(reconcileSourcesAndUses({ currency: "USD", sources: [{ id: "source", amountCents: source }], uses: [{ id: "use", amountCents: use }] }));
    assert.equal(result.sourcesCents + result.fundingGapCents, result.usesCents + result.surplusCents);
    assert.equal(result.balanced, source === use);
    assert.ok(result.fundingGapCents === 0 || result.surplusCents === 0);
  }
});

test("every public calculation rejects malformed top-level inputs without throwing", () => {
  for (const calculate of [calculateOperatingMetrics, monthlyPayment, sizeDebt, analyzeCashFlows, reconcileSourcesAndUses]) {
    for (const bad of [null, undefined, "", 42, [], new Date(), true, { unexpected: "value" }]) invalid(calculate(bad));
  }
});

test("inherited values cannot masquerade as explicitly provided inputs", () => {
  invalid(reconcileSourcesAndUses(Object.create(input)), "INVALID_OBJECT");
});
