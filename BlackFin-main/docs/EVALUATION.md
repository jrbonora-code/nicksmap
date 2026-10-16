# Evaluation and acceptance

## Current executable checks

`npm run check` verifies lint, types, financial references/error cases/invariants, controlled financial fault injection, production build and HTTP behavior. CI also builds the Docker image. The deployment configuration requests waiting for passing CI; verify the actual service setting before delivery. Healthcheck success makes no claim about authentication, financial accuracy or source accuracy.

The implemented deterministic calculation foundation covers annual operating metrics, constant monthly P&I, four-constraint debt sizing, dated NPV/equity multiple, IRR-pattern warnings and sources/uses reconciliation. See [calculation validation](CALCULATION-VALIDATION.md) for precise conventions, current tests and unimplemented coverage. These engineering references have not received independent financial signoff; the complete acquisition/development workflow is not validated yet.

The next feature acceptance follows [STRATEGY-EXECUTION.md](STRATEGY-EXECUTION.md): a source-linked case, visible unknowns, supported alternatives, ordinary-financing comparison and rejected/indeterminate outcome. Unit tests and a synthetic preview alone do not establish that workflow.

## Financial reference cases

Use reviewed reference workbooks and independently checked small cases, not tests derived only from the same implementation. Keep inputs, expected cash flows, formula convention, reviewer and provenance. Cover amortization and IO transitions, refinance constraints, fees/reserves, equity calls, development delays, sale costs, waterfalls, irregular dates, zero rates, missing inputs and ambiguous IRRs.

Proposed numerical reconciliation targets for the agreed convention: cent-level scheduled cash-flow agreement and at most one basis point for reported returns, with differences explained before acceptance. These are engineering comparison targets, not investment thresholds; confirm them with the reference-case reviewer.

## Data and AI checks

- Measure critical-field accuracy on a manually labeled sample, separately by source/document type; count abstentions and extraction failures.
- Test false entity merges and reversibility, parcel geocoding and date-correct boundary joins.
- Reconcile rent-roll totals and statement periods; identify stale/incomplete sources and contradictory values.
- Verify every critical output has source lineage; money, balance, rate, date and eligibility errors require review before use.
- Evaluate incentive false positives against the administering authority's requirements, including ineligible examples.
- Use adversarial documents to confirm source text cannot trigger actions or disclose secrets.
- Run access checks across routes, exports, files and AI retrieval for unauthenticated, nonmember and revoked users.

No error found in a finite sample is not proof of universal accuracy. Publish coverage, sample size and observed failure rates.

## Historical and prospective decision evaluation

Freeze the policy and use only information available at each historical decision date. Split evaluation by later vintages and related sponsor/property groups to limit information leakage. Include mediocre projects and failures; record missing/unfinished outcomes. Do not fit and evaluate on the same examples.

Compare a proposed ranking to simple alternatives, such as mandate filters and analyst review. Track the proportion of top-10 recommendations independently judged worthy of further diligence, missed known opportunities in the labeled set, analyst time per qualified lead and changes in conclusions after full diligence. The number of purchased deals is not by itself an accuracy measure.

Track projected vs actual rent, NOI, costs, timing, capital calls and realized distributions. Evaluate prediction intervals for empirical coverage before showing calibrated probabilities. Until the sample supports calibration, show ranges and evidence grades instead of a probability of investment success.

## Operations and delivery

Verify import retry/idempotency, recoverability of source revisions, cost per completed import, stale-data visibility, backup restore and performance on statewide queries. Set latency/spend objectives after representative data measurements. Verify deployed revision and required dependencies separately from local tests.
