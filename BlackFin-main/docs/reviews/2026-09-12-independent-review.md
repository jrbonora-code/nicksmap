> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# Independent plan and implementation review — 2026-09-12

Reviewed commit: **`3004d554dcbbc977823809056c32ff8cef665b85`**. Calculation version: **`screening-0.1.0`**.

The reviewer was a fresh subagent with no participation in implementation. This was a read-only review of the specified repository. Product code, existing documentation, configuration, dependencies, Git history, GitHub settings and Railway were not changed. The only new tracked candidate is this report; reproducible review experiments are in ignored `.local/independent-review/`.

## Assessment

The implementation is a credible **bootstrap runtime and offline calculation foundation**, consistent with its advertised scope. It is not ready for investment decisions, and its documents correctly say so. I found **one P2 numerical correctness defect and one P3 numerical edge-case defect** in dated NPV. Neither affects an exposed financial endpoint: none exists. No P0/P1 defect or current private-data disclosure was established by this review.

The implemented operating formulas, debt-cap selection and exact-cent reconciliation agreed with independent checks. Payment and NPV calculations also agreed closely over the ordinary ranges sampled. The important exception is that finite output within the safe-number bound does not establish accurate NPV when much larger discounted terms cancel.

The product and architecture preserve the agreed one-workspace, small-allowlist, all-67-Florida-county scope, including incentives. They do not silently adopt the narrower historical concept, customer billing, public registration or a multitenant product. Acquisition/recapitalization first is a reasonable proposed sequence, conditional on the unresolved mandate and buy-versus-integrate decision. Two milestone exit gates need clearer placement: recoverability before sensitive imports, and immutable decision evidence before underwriting decisions.

## Confirmed implementation findings

### F1 — P2: large discounted terms can produce a materially false, apparently successful NPV

**Location:** `lib/finance/cash-flows.ts:43–49`; final acceptance at `lib/finance/validation.ts:136–147`.

**Trigger:** a negative discount rate and distant cash flows create very large opposing present values. All input amounts, dates and rates pass the declared contract; the erroneous final difference is finite and below `Number.MAX_SAFE_INTEGER`.

```js
analyzeCashFlows({
  currency: "USD",
  annualDiscountRate: -0.5,
  cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: 0 },
    { id: "out", date: "2064-12-22", amountCents: -1000000000 },
    { id: "in", date: "2065-12-22", amountCents: 500000000 }
  ]
});
```

Those dates are exactly 0, 40 and 41 Actual/365 years from the opening date. The independent integer oracle is:

```js
-(1000000000n * 2n ** 40n) + (500000000n * 2n ** 41n) === 0n
```

**Expected:** zero NPV within a declared numerical tolerance, or a structured error if the implementation cannot maintain that tolerance.

**Actual on Node 24.13.0:** `ok: true`, `npvCents: -1966080`, `issues: []`, `irrReadiness: "conventional"`. This fabricates a **$19,660.80 negative NPV**. At the otherwise analogous 50/51-year dates, the accepted error is `-5905580032` cents, or **-$59,055,800.32**. Both the Python Decimal oracle and a separate parent-agent BigInt reproduction corroborated the defect.

**Cause and impact:** the logarithm/exponential calculation rounds the individual huge terms before compensated summation. Compensation cannot recover precision already lost inside those terms. The output validator checks only the final magnitude and finiteness, so an unreliable cancellation residual is accepted without a numerical warning. A future caller can therefore receive incorrect scenario economics despite a successful result and no issues.

This is an **extreme supported-domain case**, not evidence of an error at normal commercial discount rates. The library is offline, and the separate ordinary-range checks below did not reproduce this failure. P2 reflects a real calculation-contract defect to address before exposing the primitive for decision use, not an existing production underwriting incident.

**Recommended fix:** define and enforce an explicit precision envelope for rate, date span, cash-flow magnitude and discounted-term conditioning. Use adequately precise arithmetic or return a blocking numerical-stability issue when the error budget cannot be supported. Checking only the final result is insufficient; merely changing the summation algorithm will not repair this example. Preserve this exact-integer regression and add cancellation cases on both sides of the accepted envelope. Narrowing the advertised domain is an acceptable initial solution if documented and tested.

### F2 — P3: a zero future cash flow can turn a valid result into an overflow error

**Location:** `lib/finance/cash-flows.ts:43–45`.

**Trigger and reproduction:** the following succeeds with NPV approximately `-1.0913936421275139e-11` cents, effectively zero:

```js
const input = {
  currency: "USD", annualDiscountRate: -0.999,
  cashFlows: [
    { id: "start", date: "2025-01-01", amountCents: -10000 },
    { id: "exit", date: "2026-01-01", amountCents: 10 }
  ]
};
analyzeCashFlows(input);
analyzeCashFlows({
  ...input,
  cashFlows: [...input.cashFlows,
    { id: "empty", date: "2200-01-01", amountCents: 0 }]
});
```

**Expected:** adding a zero cash flow preserves the computable NPV. The added date is valid under the documented input domain. A fully offset same-date group should likewise make no NPV contribution.

**Actual:** the second call returns `ok: false`, `value: null`, with `NUMERIC_OVERFLOW` at `result.npvCents`.

**Cause and impact:** the zero amount is still multiplied by an overflowing exponential. In JavaScript, `0 * Infinity` is `NaN`, which poisons the sum. This rejects otherwise calculable schedules containing irrelevant zero periods or fully offset date groups. The demonstrated rate and horizon are extreme; this fails closed and is lower priority than F1.

**Recommended fix:** skip zero **net** amounts in the discounting loop, while preserving the original valuation date and the gross contribution/distribution accounting. Add a zero-line-invariance test, including same-date offsets. If the overall supported domain is narrowed for F1, explicitly define the treatment of zero-only distant periods.

Both independent regression tests are in `.local/independent-review/npv-regressions.test.mjs`. Running `node --test .local/independent-review/npv-regressions.test.mjs` produces **2 failing assertions** at this SHA. They were not added to or substituted for the committed tests.

## Evidence and test results

The review read `AGENTS.md`, `CLAUDE.md`, README, all product/decision/methodology/architecture/evaluation/source/roadmap/deployment/calculation documents and the historical concept. It inspected every implemented finance module, committed financial test and fixture, CI and smoke/fault-injection scripts, root/health routes, package and lockfile metadata, TypeScript/Next/ESLint configuration, Docker packaging and Railway declaration.

Local environment: Windows, **Node 24.13.0**, **npm 11.19.0**, **Python 3.11.15**. No dependencies or providers were installed for this review.

| Check | Result and practical boundary |
| --- | --- |
| `npm.cmd run check` | Passed lint, types, all **75** committed financial tests, **10/10** controlled fault injections, production build and committed HTTP smoke. Run against the unchanged reviewed source before adding review scratch files. |
| Independent operating cases | **500** seeded cases agreed with separately evaluated integer accounting and ratio expectations. Included varying expense losses, reserves, leverage and price/cost. |
| Independent debt sizing | **500** cases agreed with Python `Fraction` arithmetic for each separately floored LTV/LTC/DSCR/debt-yield cap, minimum and ties. Expectations were not read from production results. |
| Independent sources/uses | **500** generated multi-line cases agreed exactly with Python integer totals, gap/surplus and balance status. |
| Independent payment oracle | **245** parameter combinations compared against 100-digit Decimal valuation of every individual monthly payment, rather than the production closed-form implementation. Covered 1–1,200 months and rates 0–100%, including near-zero. For principal at most `1e12` cents, the maximum observed error was **0.00009456 cents**. |
| Independent ordinary NPV oracle | **500** seeded schedules, discount rates approximately -10% to +50%, dates up to 30 years, and individual amounts below `1e10` cents. Decimal discounting and Python calendar-day differences yielded maximum observed error **0.00003295 cents**. |
| Numerical boundary probes | Seven exact-zero NPV schedules plus zero-line control/extension exposed F1/F2. Payment probes at `Number.MAX_SAFE_INTEGER` also showed expected floating-point precision degradation; see the limit discussion below. |
| Malformed-input probes | **10,560** JSON-shaped malformed/top-level and individual-field-mutation calls completed without an exception or a nonfinite successful output. Checked blocked-result/null/error contracts. This is finite sampling, not exhaustive fuzzing or a proxy/accessor sandbox test. |
| Standalone startup | Built output was copied into an ignored scratch directory with `public` and `.next/static`, matching the Docker copy layout, then launched through **`node server.js`** on a temporary localhost port. Seven route/method cases passed, including root 503, health 200, absent deal/finance APIs 404, unsupported POST 405, robots 200, no powered-by header and the configured security headers. This is Windows standalone proof, not a Linux container run. |
| Dependency consistency/audit | Installed top-level versions matched the manifest; lockfile is tracked. `npm.cmd audit --json` returned **zero known vulnerabilities** at review time. No audit fix was run. This does not establish the absence of unknown vulnerabilities. |

Scratch oracle generation and results are `.local/independent-review/generate-oracle-cases.mjs`, `check-oracle.py`, `oracle-cases.json` and `oracle-results.json`. The oracle records **2,254** financial input/result cases. It deliberately reports boundary discrepancies; a completed oracle script is not a claim that every case passed. Generated input data is synthetic.

At the extreme payment principal limit, the maximum observed absolute payment difference was about **1.2634 cents**. One one-month case at principal `9007199254740991` cents and annual rate `1e-15` has an exact payment of approximately `9007199254740991.7506` cents but rounds to the accepted upper bound. The documented use of floating-point fractional-cent outputs does not supply a global cent-accuracy guarantee; these results should inform the numerical envelope and adapter limits, rather than being represented as another ordinary-deal failure. Safe input integers alone do not guarantee precise fractional outputs near that bound.

## Financial definitions, validators and warning semantics

The formulas match the **declared application conventions**. EGI subtracts separate vacancy, concessions and credit losses; NOI excludes the separately provided replacement reserve; DSCR uses after-reserve cash flow; debt yield uses NOI. Debt sizing takes the minimum of all four required caps and floors exact canonical-decimal ratios to cents. Negative operating economics remain visible. Annual mortgage constant is correctly distinguished from annual note rate. These definitions must remain explicit in future lender adapters.

The Microsoft fixtures reproduce the published end-of-month PMT magnitude and irregular-date XNPV example, including the Actual/365 convention. The public reference is sufficient for those formula examples, not for complete property underwriting. The declared one-sided/same-date NPV behavior and absence of an IRR solver are explicit departures or boundaries, not accidental missing functionality. [Microsoft PMT](https://support.microsoft.com/en-us/excel/functions/pmt-function), [Microsoft XNPV](https://support.microsoft.com/en-us/excel/functions/xnpv-function).

The distinction between a screening DSCR and an actual lender underwriting definition is necessary and correctly documented. Fannie Mae's referenced DSCR guide includes debt-scope and amortizing/stressed-service distinctions, so the library's manually supplied debt-service and mortgage-constant values cannot establish lender eligibility. No such eligibility claim is made by the current code. [Fannie Mae DSCR reference](https://capitalmarkets.fanniemae.com/media/5971/display).

Input validation is substantive: plain-record checks, explicit units/periods, no numeric coercion, safe integer cents, real calendar dates, unique IDs, bounded nonempty arrays, denominator checks, incompatible-total rejection and BigInt accumulation. Existing and independent tests support those behaviors for the sampled inputs. Important future import problems—semantic duplicates with new IDs, omitted periods, dollars mislabeled as cents, overlapping rent losses, changed source definitions and unsupported loan balances—are correctly acknowledged as outside structural validation. The primitive alone cannot establish lineage or factual accuracy.

`ok: true` currently means completed arithmetic, and warnings are retained for negative cash flow, undefined DSCR, debt over cost, zero capacity, unbalanced funding and IRR-pattern issues. In particular, a one-cent funding gap is a successful **unbalanced** reconciliation with a warning; it is not approval. There is no implemented approval, export, UI or AI call site that suppresses those issues. Future use needs a separate reviewed policy state, with warnings, unresolved evidence and hard blockers preserved in saved scenarios and exports.

Test independence is stronger than tests that only restate production outputs: fixed hand-worked cases, external published examples, period-by-period payment reconstruction and targeted fault assertions all add evidence. The ten injected faults are actual assertion-detected faults in isolated copies; the script does not merely count syntax failures as successes. Their finite scope also explains why F1/F2 were missed. Neither the fixtures nor this code review supplies the still-missing independently reviewed acquisition/development workbook pack or historical outcome validation.

## Plan risks and decisions — future exit gates, not missing-feature defects

| Priority / decision | Repository evidence | Recommended resolution |
| --- | --- | --- |
| Before sensitive imports: make recovery a tested exit gate | `docs/DECISIONS.md:20` requires a restore exercise before production data; ARCHITECTURE also requires recoverability before real data. But `docs/ROADMAP.md:29` names a backup/restore **approach**, Phase 2 adds document import at line 39, and a production recovery exercise appears at line 66 in Phase 5. | Make a measured database-and-object-reference restore exercise, recovery owner and recovery objectives explicit prerequisites for the first sensitive Phase 2 import. Phase 5 can repeat and extend the exercise. The requirement already exists; its milestone enforcement is unclear. |
| Before underwriting decisions: persist decision evidence and reasons | `docs/DECISIONS.md:27` requires every underwriting decision to retain its source/calculation versions. Phase 3 promises reproducible conclusions at `docs/ROADMAP.md:50`, while decision snapshots and rejection reasons appear in Phase 5 at line 63. | Require minimal immutable scenario/decision snapshots, source-version references, reviewer identity/reason and decline/outcome capture by the first Phase 3 decision. Later deal-management screens can wait. Otherwise later corrections can erase the evidence needed for reproduction and historical evaluation. |
| Next substantive work: resolve the mandate and reference workflow | D01–D05 and `docs/ROADMAP.md:24` are open. No dollar limits, return hurdle, approved leverage policy or vendor choice can be inferred from synthetic fixtures. | Produce a small signed-off mandate and permissioned case pack, then compare existing workbooks/services on those same documents. Separate the small formula-reference acceptance gate from the much larger outcome corpus needed for future calibration. An incomplete historical corpus need not block an empty private workspace. |
| Before statewide sourcing promises: define the verification sample and operational ownership | `docs/ROADMAP.md:35–41` proposes 30–50 diverse properties and an all-county status register; D06/D07 require coverage, rights and cadence. | Specify sample strata, covered fields, jurisdiction/source format, freshness thresholds, correction handling and connector owner. Include small/rural and multi-parcel/portfolio cases if within the mandate. A sample across several markets cannot validate all 67 counties, and the plan appropriately disclaims that inference. |
| Exercise incentive evidence early without assuming an award | Full incentive analysis is Phase 4; the initial schema already includes dated jurisdictions, rules, eligibility and award states. | Include a small manual incentive/jurisdiction case in the Phase 2 data pilot to test those relationships, then retain the later net-benefit and development milestone. Current designation, nomination eligibility, nomination and certification must remain separate. The IRS's 2027 process confirms why these states and effective dates matter. [IRS guidance](https://www.irs.gov/newsroom/treasury-irs-provide-guidance-to-states-for-nominating-census-tracts-as-qualified-opportunity-zones-under-the-one-big-beautiful-bill). |
| Before calibrated scoring: establish an achievable evaluation design | EVALUATION requires historical-date information, sponsor/property/vintage separation, ordinary outcomes and failures; ROADMAP leaves scoring until enough data exists. | Keep initial prioritization as visible mandate/policy filters and reviewer judgments. Define the labeled-set denominator and independent review process for top-10 usefulness/missed opportunities. Do not promise calibrated success probabilities from a small, selected internal deal history. |

A single managed database/identity/private-storage combination with Railway web hosting is a proportionate candidate for a small workspace. The plan correctly avoids requiring a second database, a full self-hosted identity stack, every suggested library or an OCR worker before real background work exists. An ADR, cost ceiling and provider-rights review should decide the implementation; this review did not establish a winning vendor or acquire any access.

The source inventory is a candidate register, not verified ingestion coverage or blanket reuse permission. The parent separately checked current A.CRE, Radix, Rockport and NCHMA primary materials and found the high-level candidate descriptions supported. NCHMA's actual Version 3.1 PDF identifies September 2025 adoption and use/version conditions. Actual workbook bundle terms, API contracts, fees, extraction performance and permitted retention remain untested. Preserve the existing download/license/same-document evaluation gates. [NCHMA Version 3.1](https://www.housingonline.com/wp-content/uploads/2025/11/Version-3.1-Final-Model-Content-Sept-2025.pdf), [A.CRE paired model/skill](https://www.adventuresincre.com/ai-skill-apartment-acquisition-model/), [Radix Underwriting](https://radix.com/radix-underwriting/), [Rockport ENGINE](https://www.therockportgroup.com/products/rockport-engine).

## Privacy, delivery and current external state

The current root exposes only a generic unavailable-workspace response; health exposes only liveness. No finance module is imported into a route, and there are no uploads, private-data APIs, database, AI integrations or customer routes to audit as operating features. Root/health responses disable storage caching; framework headers disable framing, MIME sniffing and indexing signals. These headers and a private GitHub repository are not application authentication. The instructions correctly require server-side identity and workspace access checks before introducing any private route or document.

The Dockerfile uses a non-root Node standalone runtime, copies only the runtime/static/public artifacts into its final stage and honors `PORT`. The Docker context excludes `.env*`, ignored local data/uploads and review scratch. The committed smoke starts `next start`; the independent smoke additionally exercised the actual standalone entry point. CI also builds the Linux Docker image, but does not run HTTP assertions inside that image. A real container smoke is a sensible future CI improvement, particularly when native data/worker dependencies arrive; no present startup defect was reproduced.

Railway configuration points to the exact private personal repository, `main`, a Dockerfile and `/api/health`, with wait-for-CI enabled. The IaC format and plan-before-apply workflow agree with the current official documentation. No infrastructure plan was applied by this review. [Railway IaC](https://docs.railway.com/infrastructure-as-code).

The following current-service facts were **verified by the parent agent through read-only service/API checks**, not inferred from old deployment documentation or independently re-queried by this reviewer:

| Item | Parent-verified current state |
| --- | --- |
| GitHub repository | The repository, **private**, personally owned by `npstewart87`; only listed collaborator is the owner/admin; zero pending invitations. |
| Revision | Local HEAD, GitHub `main` and Railway deployed revision all equal `3004d554dcbbc977823809056c32ff8cef665b85`. |
| GitHub CI | Run **34672478482**, **SUCCESS**. |
| Railway | Deployment **437d9a0f-a6ee-44b9-81fa-c528dca9b94b**, **SUCCESS**, in the linked Railway project's production environment. |
| Runtime configuration | Actual source is the stated personal repository on `main`; `checkSuites: true`, Dockerfile, health path `/api/health`, timeout 120. Read-only IaC plan reports no changes. |
| Branch governance | `main` is unprotected. This is an operational choice, not a privacy or calculation defect. Required review/check protections can be considered before more contributors or production financial changes; no setting was changed. |

These checks establish ownership, delivery and revision alignment. They do not establish financial approval, provider correctness or private-workspace authorization.

## Prioritized next implementation sequence

1. Preserve the two failing NPV regressions; fix or explicitly bound the numeric domain before exposing financial calculations. Set a concrete accuracy/rounding contract for outputs and future adapters.
2. Resolve D01–D05 through a concise mandate, a permissioned reference-case pack and a same-document buy/integrate/custom comparison. Record budgets and the limits of the first supported workflow.
3. Complete the identity/database/storage ADR and Phase 1 private workspace. Verify intended-user onboarding, nonmember/revoked-user denial, MFA/recovery/session revocation and object/export access before adding sensitive data. Establish and exercise recovery before the first such import.
4. Build the Phase 2 property/evidence slice: coverage register for all 67 counties, stratified sample, reversible identity links, source versions, rights/freshness status and manual reviewed import. Exercise a small date-correct incentive example without implying approval.
5. Implement the selected acquisition/recapitalization workflow with independently reviewed workbooks, complete debt/cash-flow schedules, scenarios and immutable decision snapshots. Validate source-to-unit conversion, warnings, funding gaps and user-visible/exported results together.
6. Expand incentive/development economics and county/municipal rule coverage, then monitoring and richer deal operations. Add aggregate scoring only when the outcome library supports a credible held-out evaluation.

## Remaining validation and explicit limits

- No actual project workbooks, loan terms, rent rolls, T12s or transaction outcomes were supplied or reconciled. No independent financial signoff is claimed.
- Authentication, row/object authorization, uploads, exports, source ingestion, geospatial coverage, document extraction, AI prompt isolation, incentives, backups and full debt/IRR/waterfall/construction workflows do not yet exist. Their absence is acknowledged scope, not a reported current implementation defect.
- No provider subscription, actual bundle license, paid-data feed, source connector, program eligibility determination or all-county coverage claim was validated. Primary pages substantiate narrow reference facts, not vendor performance.
- The independent runtime exercise used Windows-generated standalone output on localhost. Docker non-root/Linux execution and Railway runtime behavior were assessed through configuration and parent-provided CI/deployment evidence, not a new in-container session or production financial request.
- Numerical/randomized testing is bounded. It supports the stated samples and reproducible defects, not universal precision, arbitrary hostile JavaScript objects or production throughput.
- The reviewed SHA remains unchanged. No fix, commit, push, deployment or access-setting change was performed. The findings are ready for a separate authorized implementation pass.
