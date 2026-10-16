# Strategy discovery and execution requirements

Status: product requirements, September 14, 2026. The delivered research map, screener and financing-threshold scenarios remain the baseline. A first implementation pass of the evidence-linked case handoff (sequence steps 2 and parts of 3–4) was built and verified locally the same day; its actual contract and limits are recorded in [RESEARCH-RELEASE.md](RESEARCH-RELEASE.md#strategy-cases) and the [handoff](HANDOFF.md). This document remains the requirement, not a claim that every requirement below is met.

Research basis: [economic opportunity thesis and evidence register](research/2026-09-14-economic-opportunity-thesis.md). The purpose is to discover economically justified revenue opportunities, including unfamiliar ones, and connect property evidence to an executable next step.

## Decision contract

For a surfaced property or related institutional requirement, answer:

1. What dated evidence caused it to surface, and what does that evidence actually establish?
2. What financial or operating decision may be approaching? Is the deadline confirmed or merely recorded?
3. Who could pay for a solution, who controls the decision, and what relationship to the property is verified?
4. What role could the operator perform: assess, arrange, develop for a fee, oversee, partner, lend or acquire?
5. What contract or transaction would produce income, at what cost, and with what cash and guarantee exposure?
6. What evidence or consent is missing, what alternative should be compared, and what would reject the opportunity?

A research lead may answer only the first question. It must not appear as a qualified deal or a revenue forecast.

## Evidence and analysis states

| State | Required evidence | Permitted output |
| --- | --- | --- |
| Observed lead | Source, date, entity scope and actual observation | Why it surfaced; missing data; no confirmed distress or availability label |
| Hypothesis | Proposed need, potential payer/role, supporting and contrary evidence | Candidate strategy and next verification step; no promised fees or success score |
| Documented case | Permissioned current operating/loan evidence, reconciled property scope, actual decision/authority where needed | Transparent alternatives and analysis with explicit assumptions; unresolved eligibility/terms visible |
| Executable proposal | Applicable lender/program review, identified counterparties, proposed economics/consents and reviewed calculations | Reviewable proposed transaction or service scope; not a commitment or authorization to contact anyone |
| Agreed / outcome | Executed agreement or documented outcome, with provenance | Actual terms and observed results; distinguish booked, billed, collected and contingent compensation |
| Rejected / deferred | Reason, evidence and conditions for reconsideration | Visible disposition; preserve failures and counterexamples for learning |

Progress can stop at any state. Missing suitability limits block a personal recommendation, not public-data discovery. Source status, legal/program eligibility, investment policy and commercial readiness are separate dimensions.

## Minimum opportunity record

| Category | Required fields or explicit unknowns |
| --- | --- |
| Identity | Property/community/facility IDs and reconciled relationships; borrower/owner/lender roles and evidence dates |
| Trigger | Observed event, source location, observation period, retrieval date, confirmed versus inferred deadline, conflicting evidence |
| Strategy | Hypothesis, need, potential payer, proposed operator role, alternative including ordinary financing or no action, reason to reject |
| Execution | Required documents, decision-maker/authority, consents, proposed deliverable, next action and action owner |
| Economics | Proposed versus agreed fee basis, payment timing/conditions, delivery costs, cash needed, guarantees/recourse, capital provider, attribution between manager and investors |
| Analysis | Versioned inputs, observed versus assumed values, base/adverse/improving scenarios, deterministic results and evidence lineage |
| Outcome | Rejection/deferral reason, agreement status, amounts actually collected, realized costs and relevant milestone dates |

Unknown fee terms, staffing, available capital and willingness to transact remain unknown. Public records must not expose private contact details or become a proxy for sponsor liquidity. Avoid duplicating a facility's debt across its constituent parcels/buildings.

## Screen and workspace behavior

- Preserve the linked map and dense screener as the primary research surface. A strategy view filters the same reconciled population; rows, totals, evidence and saved cases must agree on the selected loan/property scope.
- Show a concise trigger, candidate role and next step. Keep educational explanations behind accessible information controls, with click/tap and keyboard support. Use badges/popups for evidence status and supporting context; do not rely on hover alone on mobile.
- Use consistent uppercase short statistical labels, with clear units and dates. Keep the existing quiet footer disclaimer; material unknowns belong beside the affected value, not buried in the footer.
- Save the property/source/assumption versions into a case without retyping. Preserve links back to the original evidence and conflicts; a later import must not silently rewrite a prior decision.
- Separate prospective service fees from investment returns. Do not count a loan's gross interest as personal income to the manager or a public subsidy as unrestricted sponsor profit.
- Compare strategies only when their inputs support comparison. No composite opportunity grade or success probability until its methodology and calibration are established.

## Initial research-to-case walkthrough

Use financing transition as the first proposed walkthrough because it can test both ordinary and stressed outcomes:

1. Surface a dated financing or completion record from actual data. Confirm collateral/community scope; record that maturity alone does not establish a problem.
2. Establish whether a current decision exists using permissioned loan statements/modifications and owner evidence. Stop or retain a research lead if unavailable.
3. Reconcile current operations, lease-up, obligations and remaining costs. Attach source periods and expose conflicts.
4. Compare normal refinancing, eligible early takeout, a restructuring/partner solution and sale/no-action where relevant. A program's published existence is not loan approval.
5. Identify the actual payer and proposed service scope separately from the property's investment model. Show staff/cash requirements and contingent exposure.
6. Produce one reviewable case with missing evidence and a next action. No contact, submission, guarantee or investment follows automatically.

No actual property is claimed to have passed these steps. Research order is not a suitability recommendation.

## Implementation sequence and verification

1. Establish source coverage and local comparability; address entity/loan scope conflicts before using totals to select cases.
2. Implement an evidence-linked hypothesis/case handoff from the research surface with explicit states and unknown fields. Reuse existing identity/access controls and provenance.
3. Add versioned operating/loan inputs and alternative analyses only with financial reference, error, invariant and fault-injection coverage. Full underwriting requires independent financial case review under [CALCULATION-VALIDATION.md](CALCULATION-VALIDATION.md).
4. Exercise actual desktop/mobile research-to-case navigation and saved evidence readback. Include missing payoff, expired maturity with later modification, multi-parcel collateral, no willing payer, a rejected case and a normal refinance case.
5. Run the repository checks and separately establish deployment status for any delivered implementation. Documentation, configured keys, a synthetic demo or successful healthcheck do not establish a working strategy.

The minimum acceptance packet includes one real source-linked walkthrough with clear limits, an ordinary-financing comparison, a rejected or indeterminate case, and a reconciliation showing the map, filter, row, case and evidence refer to the same underlying population. Coverage gaps are reported rather than concealed to satisfy a sample target.

This proposal does not add public signup, billing, multitenant organizations, paid data collection, new services, automatic outreach or scheduled jobs. Broader opportunity research can inform the internal platform without silently turning it into a different product.
