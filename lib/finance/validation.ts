export const MODEL_VERSION = "screening-0.2.0";

export type Issue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

export type CalculationResult<T> = {
  modelVersion: typeof MODEL_VERSION;
  issues: Issue[];
} & ({ ok: true; value: T } | { ok: false; value: null });

/** Internal parser. Sentinel values never leave a failed result. No input coercion. */
export class Inspection {
  issues: Issue[] = [];

  issue(code: string, path: string, message: string, severity: Issue["severity"] = "error") {
    this.issues.push({ severity, code, path, message });
  }

  get failed() { return this.issues.some(issue => issue.severity === "error"); }

  record(value: unknown, keys: readonly string[], path = "input"): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      this.issue("INVALID_OBJECT", path, "Expected a plain object.");
      return {};
    }
    for (const key of Object.keys(value)) {
      if (!keys.includes(key)) this.issue("UNKNOWN_FIELD", `${path}.${key}`, "Field is not supported; check the name and units.");
    }
    return value as Record<string, unknown>;
  }

  number(value: unknown, path: string, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.issue("INVALID_NUMBER", path, "A finite number is required; missing values and numeric strings are not zero.");
      return 0;
    }
    if (value < min || value > max || (integer && !Number.isSafeInteger(value))) {
      this.issue("OUT_OF_RANGE", path, `Expected ${integer ? "a safe integer" : "a number"} between ${min} and ${max}.`);
      return 0;
    }
    return value;
  }

  cents(value: unknown, path: string, min = 0) {
    return this.number(value, path, min, Number.MAX_SAFE_INTEGER, true);
  }

  positive(value: unknown, path: string, max = Number.MAX_SAFE_INTEGER) {
    const number = this.number(value, path, 0, max);
    if (number === 0) this.issue("ZERO_DENOMINATOR", path, "A positive value is required.");
    return number;
  }

  literal(value: unknown, expected: string, path: string) {
    if (value !== expected) this.issue("UNSUPPORTED_CONVENTION", path, `Expected ${expected}; no automatic conversion is performed.`);
  }

  text(value: unknown, path: string) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 200) {
      this.issue("INVALID_IDENTIFIER", path, "A nonempty identifier without surrounding whitespace is required (maximum 200 characters).");
      return "";
    }
    return value;
  }

  date(value: unknown, path: string) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.issue("INVALID_DATE", path, "Expected an ISO calendar date, YYYY-MM-DD, without a time zone.");
      return 0;
    }
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
      this.issue("INVALID_DATE", path, "The calendar date does not exist.");
      return 0;
    }
    return timestamp;
  }

  list(value: unknown, path: string) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 10_000) {
      this.issue("INVALID_LIST", path, "Expected between 1 and 10,000 records.");
      return [];
    }
    return Array.from(value) as unknown[];
  }

  sum(values: readonly number[], path: string) {
    // Integer arithmetic catches overflow before any precision is lost.
    const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(-Number.MAX_SAFE_INTEGER)) {
      this.issue("NUMERIC_OVERFLOW", path, "The total exceeds the supported exact-cent range.");
      return 0;
    }
    return Number(total);
  }

  floorRatio(cents: number, multipliers: number[], divisors: number[], path: string) {
    // Treat each input's canonical decimal representation as the supplied ratio.
    // Binary float multiplication can turn 100 * 0.29 into 28.999999999999996.
    const fraction = (number: number): [bigint, bigint] => {
      const [mantissa, exponent = "0"] = number.toString().split("e");
      const [whole, decimal = ""] = mantissa.split(".");
      const scale = decimal.length - Number(exponent);
      const digits = BigInt(whole + decimal);
      return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
    };
    let numerator = BigInt(cents);
    let denominator = 1n;
    for (const factor of multipliers) {
      const [top, bottom] = fraction(factor);
      numerator *= top;
      denominator *= bottom;
    }
    for (const divisor of divisors) {
      const [top, bottom] = fraction(divisor);
      numerator *= bottom;
      denominator *= top;
    }
    const floored = numerator / denominator;
    if (floored > BigInt(Number.MAX_SAFE_INTEGER)) {
      this.issue("NUMERIC_OVERFLOW", path, "The loan constraint exceeds the supported exact-cent range.");
      return 0;
    }
    return Number(floored);
  }

  blocked(): { ok: false; value: null; issues: Issue[]; modelVersion: typeof MODEL_VERSION } {
    return { ok: false, value: null, issues: this.issues, modelVersion: MODEL_VERSION };
  }

  result<T>(value: T): CalculationResult<T> {
    const inspectOutput = (item: unknown, path: string) => {
      if (typeof item === "number" && (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER)) {
        this.issue("NUMERIC_OVERFLOW", path, "The calculation exceeded the supported numeric range.");
      } else if (item !== null && typeof item === "object") {
        for (const [key, child] of Object.entries(item)) inspectOutput(child, `${path}.${key}`);
      }
    };
    inspectOutput(value, "result");
    return this.failed
      ? this.blocked()
      : { ok: true, value, issues: this.issues, modelVersion: MODEL_VERSION };
  }
}
