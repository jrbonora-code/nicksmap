> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Planning stops, proposed integrations and build directions below describe September 12. The source-to-analysis foundation was subsequently delivered; dated research and acquisition limits remain evidence.

# Independent challenge of the replacement plan

2026-09-12. Planning review only. No application, database, provider integration or deployment changed. Reviewed the original concept, the replacement plan, open-source and public-data research drafts, and the existing financial-screening implementation. Public-source capability claims below are bounded by the companion research; unparsed sources remain unverified.

## Verdict

The replacement plan restores the intended product: source-backed property/loan intelligence, a central linked map and screener, reproducible financial analysis, comparisons, and sponsor/lender research. It correctly rejects the manual deal register as the foundation. It is still possible to follow this plan literally and deliver an attractive property directory with mostly unknown financial columns. The corrections below close that escape route.

Planning can finish with unresolved source limitations. Those limitations must block acceptance of the affected analytical capability, not prevent public-source research or force a return to manual-entry screens.

## Material corrections

### 1. Do not let the first release stop at inventory plus a maturity column

Slice 1 depends on a HUD loan file whose publication was found but whose download/parse has not yet been established. DBPR apartment records and FDOR parcels establish a useful research universe; they do not establish financial distress, operating performance or available investments. A public FHA subset also does not establish coverage of the bank-financed properties of interest.

Before selecting the first build slice, produce a source-to-output readiness table: actual acquired file/API; sampled fields and definitions; record grain; Florida count; useful dated metrics; missing inputs; and executable user question. A maturity screen must report the covered facilities and observation date. A bank-wide financial series must remain a separate lens. Do not silently pivot to a directory if loan acquisition fails.

The first substantive product demonstration should combine inventory/map work with a narrow, real analytical workflow from slices 2 or 3. The exact workflow follows the acquired evidence, not whichever columns make the screenshot look complete. An empty result can be valid when coverage is adequate and the rule finds no match; inventing a positive result is never an acceptance requirement.

The completed source research confirms a sharper present boundary: DBPR license and inspection extracts were actually parsed; HUD loan acquisition remains blocked by a direct-download 403; a 2026 SEC ABS-EE filing with an XML exhibit was located but not parsed; Fannie Mae historical monthly loan records and annual DSCR files require free account/terms and matching evaluation. Dated licensing/inspection change research can be demonstrated earlier, but must not be labeled loan distress or acceptance of the financing workflow. Resolve the loan-source acquisition/parse test before promising the first financing release. Preserve callback/resolution history before treating an inspection event as unresolved.

### 2. Missing private financials should not mean missing calculators

The current code requires a complete manually entered annual operating screen before returning its metric bundle. Carrying that interaction into the rebuild would recreate the same product even with imported property names.

Support calculations according to their own input dependencies. With a source-linked loan record and explicitly selected scenario terms, the analyst can explore debt service, the cash flow required to support a selected refinance amount, required collateral value, and sensitivity to rates/constraints. A selected target amount may be initialized from a dated reported balance only with that basis visible; it is not automatically a payoff amount. These are threshold/scenario results, not observed NOI, actual funding gaps, loan quotes, lender approval or distress findings.

Current NOI, payoff, rents and expenses stay unknown where unsupported. A complete funding-gap result requires the relevant supported facts or explicitly named assumptions. The same scenario must run across the screened universe and reconcile to the property inspector; a disconnected single-property form is insufficient. Evaluate the purpose-built financial candidates on this concrete contract before choosing custom code.

### 3. Establish the row and denominator before computing any ratio or map total

The plan has the right property/parcel/facility boundaries but does not yet specify how the first sources reconcile them. A lodging license, tax parcel, apartment community, building and collateral facility are different records. Several license or parcel rows may describe one community; one loan may cover several communities. A plausible address match is not enough to combine their units and debt.

Define source-native inventory separately from canonical communities. Keep unmatched records searchable and state why they cannot yet participate in a particular calculation. Distinguish proposed versus established community groupings. Every analytical view must declare its row grain and denominator: properties, parcels, units, facilities or reported principal. Changing between property and facility views must not duplicate debt or silently allocate portfolio loans. Price per unit and debt per unit require matching numerator/denominator scope and dates; unresolved unit scope blocks the ratio, not access to the source record.

### 4. Turn “performance, comparisons and grading” into named deliverables

Slice 3's general comparison contract is sound, but it could be postponed indefinitely or satisfied with county demographics. Select a small metric dictionary with a source, formula, period, unit, cohort, exclusions and user decision for every metric. Publish which metrics the first free-data release can actually evaluate.

| Analytical output | Honest early capability | What cannot be inferred |
| --- | --- | --- |
| Reported maturity and financing terms | Filter and compare covered facilities after the loan source is acquired and parsed | Extension status, current payoff, default or seller motivation |
| Financing threshold/scenario comparison | Show required cash flow/value and rate sensitivities under named assumptions | Actual DSCR, actual refinance gap or available financing when inputs are absent |
| Recorded transaction comparison | Compare qualified transactions with supported community/unit scope and dates | Current executable value, cap rate or NOI from price alone |
| Geographic market context | Show source-defined rent, supply, demographic or financing series at their actual geography and period | A specific property's achieved rent, occupancy or expenses |
| Property operating performance | Normalize and compare sourced statements when available; show the unavailable subset explicitly | Fill missing T-12s from geographic averages |
| Empirical position / criteria | Reproducible cohort percentile and separate met/not-met/unknown criteria where data supports them | A calibrated investment grade or success probability from adjustable weights |

This matrix is a proposed output contract, not a claim that those sources or outputs are integrated. Do not equate “financial-grade calculations” with an investment recommendation: numerical correctness, input reliability, comparability and the workspace's investment policy remain separate.

### 5. Make the high-quality map an analytical acceptance test

The proposed renderer, parcel context, aerial layer and synchronized selection are appropriate. A crisp map with pins is still insufficient. A reviewer must be able to open the application directly into the map/screener, draw or refine an area, apply financial/source-date filters, inspect overlapping or multi-parcel communities, compare the selected assets, and trace a result to its source without losing the query.

Use one persisted query definition for map, grid, counts, inspector and later exports. Define whether panning changes results or only the view; make that behavior visible. Count all matching records, not merely loaded rows or rendered tiles. When a row has no reliable location, keep it in the result denominator with an explicit unmapped state; do not place it at a county centroid. Keep display simplification separate from exact spatial queries.

The visual review must use real representative data at statewide, metropolitan, neighborhood and parcel scales. Inspect label hierarchy/collision, selected geometry contrast over both vector and aerial layers, dense overlaps, attribution, imagery vintage, missing coverage and delayed/error responses. Measure the proposed latency/memory budgets, but do not treat FPS as a substitute for cartographic quality. The supplied table requires shallow rows, aligned numbers, compact headers, resizing/pinning and genuine numeric filters; it should not become a large-card layout inside a map shell.

### 6. Preserve multiple opportunity paths without pretending they share one score

Refinance/recapitalization, acquisition/value-add, lender/sponsor intervention and completion/development have different evidence and economics. A first covered-loan demonstration is reasonable; it must not redefine the whole product as “FHA maturities.” Preserve an explicit capability/coverage view for each path and sequence its real source and model work. Development cash flows, bank-wide concentration and property operating comparisons cannot be hidden under one distressed/not-distressed label.

Do not open unsupported modules as empty tables whose main action is Add Record. State which source/model is absent and retain an honest route to the working analytical surfaces. Analyst corrections and authorized enrichment support aggregation; they must not be the only means by which the universe exists.

## Acceptance blockers for the replacement

These block claiming the affected slice is delivered; they are not a new permission process or prerequisites for all research.

1. **No acquired analytical source:** a listed URL, stored key, source catalogue or parser stub cannot pass the loan/performance slice. Documented acquisition failures remain failures.
2. **No end-to-end analytical use:** a real property/source chain must support a named decision question through the linked map, screener, calculation/comparison and evidence inspector. A directory alone cannot pass the analytics release.
3. **Unexplained identity, amount, date or scope discrepancy:** unresolved records can remain visible, but dependent ratios/aggregates cannot be presented as complete. Show observed error and abstention rates on the review sample.
4. **Unknowns create favorable results:** missing payoff, operating performance, maturity or coverage cannot become zero, healthy, no risk or a better grade. Scenario assumptions cannot overwrite observations.
5. **Map/table disagreement or inaccessible detail:** filtering, counts, spatial selection and grain must reconcile on real data. An attractive standalone map cannot pass the central-workspace requirement.
6. **A financial library stands in for a validated workflow:** adopted or retained engines must pass the agreed independent cases for the supported scope and expose conventions/limitations. Do not block the source-map slice on unrelated waterfall cases, or claim underwriting acceptance from UI fixtures and unit tests.
7. **Freshness or repeatability is false:** identical refreshes must not invent new events; failed refreshes must retain dated prior data as stale; saved analytical results must preserve their inputs, query and assumption versions.

## Review evidence and limits

- Original intent: [initial concept](../reference/initial-concept.txt), particularly the central question, three screens, evidence model, refinancing concept and canonical relationships. Later direction makes the map central and supersedes the concept's optional-map wording.
- Plan under challenge: [replacement plan](REPLACEMENT-PLAN.md), particularly slices 1–3 and the map/table contract.
- Tool evidence: [open-source research](OPEN-SOURCE-RESEARCH.md). Candidate capabilities and licenses were researched by the assigned researcher; this challenge did not install or execute their code.
- Source readiness: [public-data research](PUBLIC-DATA-RESEARCH.md), to be read with its acquisition/parse evidence and limitations. No new source access is claimed by this challenge.
- Existing implementation inspected: `lib/finance/screening.ts`. Its annual metric bundle, payment primitive and four-constraint debt sizing are useful bounded code, not the integrated replacement.

This report does not determine whether a separate backend exists; the separate branch and service audit owns that factual question. It does not authorize a rebuild, deployment, purchase or data migration.
