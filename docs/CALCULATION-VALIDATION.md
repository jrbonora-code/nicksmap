# Calculation validation and error controls

## Implemented boundary

Version `screening-0.2.0` retains the deterministic, offline calculation primitives and adds an explicit dated-NPV precision envelope and zero-net-flow correction. The original `screening-0.1.0` behavior and findings remain recorded in the [independent review](reviews/2026-09-12-independent-review.md). These primitives do not add a deal API, financial UI, grading model, lender approval, import pipeline or complete underwriting engine. They support normalized annual acquisition screening; construction, lease-up and complex financing need additional reviewed modules.

Run `npm test` for the financial suite and controlled fault-injection checks. `npm run check` includes these tests before the production build and HTTP smoke check. GitHub CI runs this command; Railway is configured to wait for passing CI. A failed financial test therefore fails CI instead of producing an accepted deployment check.

No test requires credentials, private documents, a database, a live vendor or AI access. The tests use Node.js 24's built-in runner and native TypeScript support; TypeScript checking runs separately. There is no new testing package dependency.

## Calculation contracts

Inputs are plain objects with explicit fields, no inferred defaults and no numeric-string coercion. Amounts ending in `Cents` are USD integer cents; negative amounts are allowed only where the function explicitly supports signed cash flow. Integer monetary additions use BigInt internally and reject totals outside JavaScript's safe integer range before returning a result. Returned ratios and discounted/payment amounts use floating-point arithmetic, with explicit tolerances in reference tests. Fractional-cent payment, NPV and per-unit results are unrounded screening values, not settlement amounts; no currency rounding or lender-specific payment-rounding policy is implied.

| Function | Definition and supported convention | Independent check |
| --- | --- | --- |
| `calculateOperatingMetrics` | Annual EGI = potential rent minus separately stated vacancy/concessions/credit losses plus other income. NOI = EGI minus operating expenses. Cash flow after reserves = NOI minus replacement reserves. Cash flow after debt service subtracts annual P&I. | Synthetic hand-worked annual case with fixed dollar totals and ratios |
| Operating ratios | DSCR uses cash flow **after reserves**; debt yield uses NOI. Entry cap = NOI/purchase price; yield on cost = NOI/total acquisition cost; LTC = loan/cost; price per unit = purchase price/unit count. | Fixed hand-worked ratios; expense/reserve sensitivity and scale invariance |
| `monthlyPayment` | Positive magnitude of constant monthly end-of-period P&I; nominal annual decimal rate divided by 12; zero residual. Zero-interest case uses principal/months. Supported annual rate 0–1 and term 1–1,200 months. No fees, escrows, IO period, balloon, floating rate or lender payment-rounding rule. | Published Microsoft PMT example, zero-rate and one-month hand cases, independent monthly balance reconstruction |
| `sizeDebt` | Minimum of explicitly supplied LTV, LTC, DSCR and debt-yield caps. DSCR numerator is after-reserve annual cash flow; debt yield uses annual NOI. Annual mortgage constant means annual debt service per dollar of loan, not the note rate. Negative income-based capacity is floored at zero. | Four fixed hand-computed caps, each binding case, tied constraints, zero capacity, and stress tests |
| Loan cap arithmetic | Canonical decimal representations of input ratios are evaluated as exact fractions, then floored to whole cents. This avoids binary rounding changing a whole-cent boundary (e.g. 100 cents × 29% must allow 29 cents). | Exact boundary cases, fractional-cent caps and scientific-notation inputs |
| `analyzeCashFlows` | Signed, dated USD flows discounted to the first date using Actual/365, subject to the NPV precision envelope below. Contributions are negative, distributions positive; equity multiple = all gross distributions/all gross contributions. Dates are ISO calendar days in UTC. Later entries may be unordered but cannot precede the first date. | Published Microsoft XNPV example, independent review regressions, exact-integer and 100-digit Decimal boundary references, leap day, negative/zero discount rates, extra equity calls, timing and scale tests |
| IRR readiness | Net same-date flows before counting chronological sign changes. Multiple changes warn about ambiguous/absent roots. No IRR value is calculated in this version. A conventional pattern is a readiness indicator, not a solver result. | Classic -100/+230/-132 two-root example and same-date offset cases |
| `reconcileSourcesAndUses` | Sum unique source and use lines; difference = sources minus uses. Exact-cent balance required. Funding gap and surplus are separate positive amounts. | Fixed balance, one-cent gap, surplus, duplicates, overflow and accounting identities |

These are declared application conventions, not universal lender or investment rules. All sizing constraints must be supplied; no market/lender thresholds are hardcoded. The current sizing domain supports LTV/LTC constraints from 0 to 1, positive DSCR and mortgage constant, and a positive debt-yield constraint at most 1. Other structures need an explicit adapter. DSCR for a different lender cash-flow definition requires a separately named/versioned adapter. The operating inputs must refer to consistent annual and valuation scopes; this primitive does not reconcile statement dates or a midyear payoff.

The dated-NPV rate range is greater than -1 and at most 1, with the additional numerical support criterion below. This is the supported domain of this screening module, not a mathematical limit. One-sided flows still have mathematical NPV, but produce an IRR-readiness warning and no fabricated equity multiple. This differs from Excel's documented mixed-sign input requirement; this API is not a drop-in Excel replacement. Same-date flows are permitted and netted for discounting; gross contributions/distributions remain separate for the equity multiple. Zero net date groups are skipped only during discounting. They neither move the original valuation date nor erase gross transactions, and zero-only distant periods impose no discount-horizon restriction. Every original record still passes ID, date, amount and accounting-total validation.

### Output precision and rounding

Dated NPV has a **0.01-cent absolute accuracy target** ($0.0001) within its supported floating-point envelope on Node.js 24. The runtime rejects amplified rounding exposure before returning a usable NPV, even when the final difference is finite, small or mathematically zero. For each nonzero date-netted flow, let `t` be Actual/365 years, `x = -t * log1p(r)` and `PV = amountCents * exp(x)`. The support criterion is:

```text
reserveCents = 64 * Number.EPSILON * sum(abs(PV) * (2 + abs(x) + t * abs(r) / (1 + r)))
reserveCents <= 0.01
```

The magnitude sum captures exposure before cancellation. The exponent and rate-sensitivity terms account for amplification from the day/year conversion, log/exp evaluation and the binary representation of the supplied decimal rate, especially near -100%. The factor 64 reserves margin for those effects and compensated summation. A nonfinite discounted term produces `NUMERIC_OVERFLOW`; a larger reserve produces `NPV_PRECISION_UNSUPPORTED`, with `value: null` and no partial monetary outputs. This criterion is deliberately conservative: some exactly calculable schedules are outside this implementation's supported envelope. It is an engineering support rule tested against independent arithmetic, **not a formal, portable bound on ECMAScript transcendental implementations**, and it is not evidence that every mathematically valid cash-flow schedule is supported. A higher-precision implementation or independently reviewed adapter is required outside the envelope.

For example, at a 100% annual discount rate, a one-year receipt of twice an opening contribution has exact zero NPV. Opening contributions of 135 billion cents pass this criterion; 136 billion cents fail it. At -50%, the independent review's offsetting 40/41-year and 50/51-year schedules are rejected instead of returning a large fabricated loss. At a zero discount rate, or when every nonzero net flow is on the opening date, NPV uses the exact integer-cent net profit directly and retains the full safe-integer accounting domain.

Other floating outputs do **not** acquire that NPV accuracy target. Payment, per-unit values and ratios retain their existing explicit reference tolerances and binary64 representation. Safe-integer input limits ensure exact input cents and totals, not universal cent accuracy after division, exponentiation or payment calculation. The independent review observed payment error of about 1.2634 cents near the maximum permitted principal; no global sub-cent payment guarantee is claimed. A financial workflow must define and validate its principal/rate/term envelope and rounding policy before using payments for a schedule, settlement or underwriting approval. Existing published-example tolerances have not been loosened.

## Error and warning behavior

Each function returns `modelVersion`, `issues`, and a discriminated result:

```ts
{ ok: false, value: null, issues: [{ severity: "error", code, path, message }], modelVersion }
{ ok: true, value: calculatedMetrics, issues: [], modelVersion }
// Successful arithmetic may also contain warnings; callers must show them.
```

Errors identify the relevant field without echoing the document or input payload. Any error blocks all numeric outputs from that function. No partial result, fabricated zero, NaN or Infinity is returned as a usable answer. Ordinary malformed JSON-compatible inputs return structured issues rather than throwing. The library is not a sandbox for arbitrary JavaScript proxies/accessors; validate serialized input at the future API boundary as well.

| Blocks calculation | Returns an explicit review warning |
| --- | --- |
| Missing/null/nonfinite/numeric-string values; fractional cents; unsafe integers | Negative operating cash flow, preserved as a negative amount |
| Unknown fields, unsupported currency or monthly/annual convention | Debt service zero with a nonzero balance: DSCR is null |
| Invalid dates, time strings, dates before the opening flow | Loan above total acquisition cost |
| Duplicate cash-flow IDs or source/use line IDs | No capacity under the supplied debt constraints |
| Zero required denominator or out-of-domain rate/term | Unbalanced sources/uses, including a one-cent gap or surplus |
| Rent losses exceeding potential rent; total cost below purchase price | Multiple cash-flow sign changes or another nonconventional investment pattern |
| After-reserve cash flow above NOI; debt service without a corresponding balance | No contributions: equity multiple is null |
| Numeric overflow or malformed/empty/oversized record lists | |
| Dated NPV outside the supported 0.01-cent precision envelope, including cancellation of large discounted terms | |

Unlevered DSCR/debt yield are null as mathematically inapplicable, not infinite; that case alone does not create a warning. `ok: true` means arithmetic completed under the declared contract. It does not mean a deal passed investment policy, source verification, incentive eligibility, reconciliation, or human review. A warning may prevent downstream approval under a future policy even when the amount is calculated correctly. No approval/export workflow currently exists.

Stable IDs catch repeated records, not semantic duplicates assigned different IDs. Annual labels do not prove statement coverage. A dollar amount mistakenly labeled as cents can be structurally valid. Correct source-to-unit conversion, source lineage, conflicting evidence and classification require import-level validation and human reference checks.

## Reference evidence and test strength

The committed [reference cases](../tests/finance/reference-cases.json) contain fixed inputs, fixed expected outputs, provenance, conventions and model version. Published examples are checked to half a cent because their results are published to two USD decimal places. Integer accounting identities require exact cents; rate comparisons use explicit absolute tolerances. The independent period-by-period payment balance reconstruction must reconcile to one hundredth of a cent under the unrounded convention.

Do not regenerate expected values from the production functions or loosen tolerances to make a regression pass. Correct the formula/convention or explain and review the reference change. If a convention changes, change the model version and retain the earlier decision snapshots. Every discovered defect needs a reproducible failing case before its fix.

The suite includes deterministic generated cases: payment balance conservation, scaling, stricter financing constraints, negative cash flows, delayed receipts, and source/use identities. Generated cases strengthen coverage but are not historical project validation.

The two independent NPV findings were first added as failing committed-suite regressions and reproduced against `screening-0.1.0`: the finite cancellation returned -1,966,080 cents and a distant zero caused a numeric-overflow error. They now pass. Additional references include exact integer zero-NPV support boundaries, 100-digit Decimal cases with irregular dates/negative rates/leap days, zero-line and date-group invariance, original-date preservation and exact-path extremes. The original independent report and its reviewed revision are unchanged; this fix is a subsequent implementation, not a rewrite of that evidence.

`npm run test:guards` copies only the finance code and synthetic tests into an ignored, isolated scratch directory. It first requires the unmodified baseline to pass, then deliberately introduces twelve known financial faults, one at a time, including bypassing the NPV precision envelope and discounting zero net amounts. Every fault must cause an assertion failure. It restores/removes only that scratch copy. This checks that the tests can detect those specific mistakes; it is not exhaustive mutation coverage.

The reference pack is marked `engineering_reference_only`, with no independent financial reviewer recorded. Neither passing tests nor a deployment healthcheck constitutes external underwriting signoff. D04/D05 remain open.

## Required expansion before financial workflows ship

| Future component | Required checks before use |
| --- | --- |
| Full debt schedule and refinance | IO-to-amortization transition, maturity/balloon, rate resets, interest conventions, rounded final payment, payoff/fees/reserves and refinance shortfall |
| IRR/XIRR and waterfalls | Reviewed dated returns, solver residual and convergence bounds, multiple roots/no root, negative returns, LP/sponsor fee/promote treatment, reinvestment assumptions and conservation of distributions |
| Construction and lease-up | Sources equal uses by period, beginning cash plus net flow equals ending cash, draw/loan balances, cumulative interest, cost to complete, contingency use, delays, absorption and peak equity |
| Document/CSV imports | Source and period metadata, dollar/cent and percent conversion, rent-roll unit counts, occupied/vacant totals, T12 completeness, line/subtotal reconciliation, duplicate imports and conflicting observations |
| Sources and AI outputs | Source/date/lineage required, configurable freshness checks, uncertainty and extraction confidence, original evidence retained, missing facts remain missing, adversarial documents do not change tool authority |
| Incentives | Date-correct jurisdiction/rules, eligibility evidence, award status, expiry, compliance/recapture, benefit timing and no double counting in NOI/cost/equity returns |
| Persistence and UI | Server rejects invalid inputs; failed writes are atomic; retries are idempotent; tables/maps/memos/exports reconcile to the same version; warnings cannot disappear on export |
| Operational errors | Structured redacted errors, request/job IDs, useful retry/review states, timeouts, source failures, stale cached data, authorization denial and backup/restore checks |

Adopt independently reviewed, licensed acquisition and development workbooks with reviewer, review date, model version and reconciliation notes before those workflows become decision-ready. Include actual project outcomes and failures separately from synthetic formula tests. Do not treat an unimplemented module as passing because the current suite is green.

## Primary references

- [Microsoft PMT definition and example](https://support.microsoft.com/en-us/excel/functions/pmt-function)
- [Microsoft XNPV convention and example](https://support.microsoft.com/en-us/excel/functions/xnpv-function)
- [Fannie Mae underwritten DSCR definition distinctions](https://capitalmarkets.fanniemae.com/media/5971/display)
- [Node.js 24 test runner](https://nodejs.org/docs/latest-v24.x/api/test.html) and [native TypeScript support](https://nodejs.org/docs/latest-v24.x/api/typescript.html)

Retrieved 2026-09-12. Published examples anchor individual formulas; they do not validate our complete business methodology.

## Source-linked financing thresholds

New research scenario defaults use the `America/New_York` calendar date. The previous UTC default advanced the scenario date during Eastern evenings. Fixed-clock regression cases first reproduced four failures across EDT/EST evenings and the moments before local midnight. The corrected cases cover both local-midnight boundaries and both daylight-saving transitions; an injected instant makes date initialization reproducible. Explicit analyst dates and saved scenario dates remain unchanged, as do `threshold-1` arithmetic and the UTC calendar-day convention of the dated-NPV primitive. See [scenario date regressions](../tests/research/scenario-date.test.ts).

The threshold-1 adapter is specified and bounded in [RESEARCH-RELEASE.md](RESEARCH-RELEASE.md). It retains the existing monthly-payment convention and explicitly adds below-NOI reserves to the DSCR income requirement. Seven additional financial cases plus four targeted fault injections cover its first scope. The release comparison used 305 independent 80-digit Decimal cases; full underwriting acceptance remains separate.

Strategy cases add no arithmetic. A case origin stores the threshold-1 result for its fixed debt basis at capture, and each alternative with financing assumptions reruns the same adapter on that basis server-side; submitted results are discarded and recalculated. Proposed, agreed, billed, contingent, delivery-cost, cash, guarantee, investor-capital, collected and realized-cost amounts are recorded whole-cent inputs validated for range only; no net fee, return, funding gap or probability is derived from them. The [case-model tests](../tests/research/cases.test.ts) cover tampered results, missing debt basis, amount bounds, evidence-register validation and the per-state gates.

Scenario input conversion: the original screener scenario form converted the annual reserves field with a float division (`dollars / 0.01`), which yields fractional cents for ordinary amounts (1234.56 becomes 123455.99999999999) that the integer-cent validator then rejects. The shared scenario fields now parse reserves through the exact decimal `dollarsToCents` used by manual deals; the regression case is in the same test file. The threshold arithmetic and its validator were unchanged, and no tolerance was added.
