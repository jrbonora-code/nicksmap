import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CalculationResult } from "../../lib/finance/validation.ts";
import type referenceTypes from "./reference-cases.json";

export const references: typeof referenceTypes = JSON.parse(readFileSync(new URL("./reference-cases.json", import.meta.url), "utf8"));

export function value<T>(result: CalculationResult<T>): T {
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  if (!result.ok) throw new Error("Expected a successful result");
  assert.ok(!result.issues.some(issue => issue.severity === "error"));
  assert.equal(result.modelVersion, references.modelVersion);
  return result.value;
}

export function invalid(result: CalculationResult<unknown>, code?: string) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.value, null, "A blocked calculation must not leak partial numeric results");
  assert.ok(result.issues.some(issue => issue.severity === "error" && (!code || issue.code === code)), JSON.stringify(result.issues));
}

export function warning(result: CalculationResult<unknown>, code: string) {
  value(result);
  assert.ok(result.issues.some(issue => issue.severity === "warning" && issue.code === code), JSON.stringify(result));
}

export function near(actual: number, expected: number, absoluteTolerance = 1e-12) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected));
  assert.ok(Math.abs(actual - expected) <= absoluteTolerance, `Actual ${actual}; expected ${expected}; absolute tolerance ${absoluteTolerance}`);
}

/** Reproducible inputs, not a second implementation of the financial formulas. */
export function random(seed = 20260912) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
