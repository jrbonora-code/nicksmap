> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Planning stops, proposed integrations and build directions below describe September 12. The source-to-analysis foundation was subsequently delivered; dated research and acquisition limits remain evidence.

# BlackFin replacement plan

Date: 2026-09-12. Status: planning proposal, not implementation approval or evidence of working integrations. Implementation was stopped and a complete replacement was requested. This report was prepared from the original supplied concept and the actual repository; source selection relies on the companion [public-data research](PUBLIC-DATA-RESEARCH.md), and open-source tool choices require their separate evaluation. No application code, deployment, database or existing document was changed by this planning task.

## The product to build

An internal Florida multifamily intelligence and underwriting platform that assembles property, financing, market, sponsor and lender evidence, detects relevant changes, compares performance, and produces reproducible investment analyses. The primary question is the original one: **Which properties or sponsors deserve attention, why now, and what evidence supports that conclusion?**

The settled decisions are all 67 Florida counties; one shared internal workspace for a small allowlisted group; investment opportunities; acquisition, recapitalization, value-add and completion/development strategies; free public sources first; no paid data subscriptions for this stage; **a high-quality map central to the product**, linked to dense analytical tables inspired by the supplied trading-terminal image; and a complete product reset rather than further polishing the current deal tracker. This does not authorize public signup, billing, customer organizations, automatic outreach, trades, property purchases, or additional paid services.

The existing product name and logo can survive. The present information architecture, primary workflow and visual composition should not be the starting template. Record creation and task stages cannot be the main experience. A property exists in the research universe before the user has selected it as a deal.

## What the original concept said versus what exists

This is a product-delivery gap, not merely a visual gap. The written methodology already contains many appropriate ideas. The implementation and its acceptance sequence did not deliver them.

| Intended capability | Verified implementation boundary | Replacement consequence |
| --- | --- | --- |
| Property/loan universe populated from source records | `workspace_deals` is manually entered name/address/county/strategy/stage/price/notes/next action. No canonical property, parcel, facility or entity schema exists. | Start with a source-backed property universe and related observations; treat deal selection as an annotation later. |
| Data aggregation, refresh and change detection | No import adapter, ingestion-run schema, source-history process or market feed exists in the inspected app/lib/db code. The only map fetch loads bundled county geometry. | First usable release must import real public records and demonstrate a repeat refresh. |
| Maturity/refinancing screen | Annual operating inputs are manually submitted. Payment and debt-sizing primitives exist but are not a loan/maturity/refinance workflow. | Build a complete, sourced refinance scenario, including missing and disputed inputs, rather than exposing more disconnected formulas. |
| Comparable/benchmark analysis | No cohort membership, normalization, peer distribution or benchmark UI/data implementation. | Implement explicit cohort definitions, selection reasons, dates, distributions and comparability limits. |
| Sponsor/lender intelligence | No entity relationship or facility/collateral model. | Relationships must carry evidence, dates and review state; portfolio calculations must avoid double-counting facilities. |
| Explainable research screens and grading | Strategy/stage labels and qualitative decisions exist; no screening-rule engine or calibrated score exists. | Use reproducible rule results and separate policy/empirical/evidence dimensions. No invented weighted grade. |
| Financial evidence drilldown | Evidence records are notes and URLs associated with a deal. They are not typed observations bound to each financial input. | Every decision-useful value links to its observation, period and source locator; input selection is explicit. |
| Central research map and dense financial terminal | Current routes center overview, deals, next actions, county counts and manual forms; the map is a separate county-count view. | The entry route becomes a linked map and data screener; geographic investigation and table analysis operate on the same records. |

Evidence inspected: `docs/reference/initial-concept.txt` (especially original question, screens, refinance example and data relationships); `docs/METHODOLOGY.md`; `lib/workspace/types.ts`; `db/001-private-workspace.sql`; `lib/workspace/service.ts`; `app/(workspace)/overview/page.tsx`; `components/workspace/deal-detail.tsx`; `lib/finance/*`; `tests/finance/*`; `tests/workspace/*`; `tests/integration/auth.test.ts`.

The current tests do useful work on their actual contracts: numeric conversion, formula examples, authorization, idempotency, snapshots and stale writes. They do not test aggregation, comparable selection, property/loan matching or useful research outputs because those features do not exist. A green suite was never evidence that the intended product had been built.

The original build request explicitly asked for GitHub/open-source acceleration, map tooling, financial metrics, comparative successful-project evidence, grading/evaluation metrics and prebuilt financial methodology. The implementation split subsequently narrowed the first release to manually entered deals. That narrowing predates Claude's frontend work; this plan does not attribute the whole failure to styling or to an interrupted Claude task.

The parent also checked fetched remote heads, all-history backend paths, worktrees, pull-request history, repository naming and linked Railway services. It found no alternate implemented data/analytics backend in that inspected scope. The integration-key branch stores provider credentials and registry metadata but does not call providers; the linked web deployment is the manual-workspace revision with a PostgreSQL service. This does not rule out an unlinked copy on another machine. Existing auth, financial primitives and MapLibre are real tools; they do not add up to the requested integrated analytics platform.

## Corrections adopted from independent plan challenge

The [independent challenge](PLAN-CHALLENGE.md) found that the first slice could still become a property directory with mostly empty financial columns. Its seven acceptance blockers are adopted into this plan. A map/inventory milestone may be an engineering prerequisite; it is not acceptance of the analytics product. The first substantive demonstration must also include a useful sourced financial scenario or defensible comparison from slices 2–3, with explicit coverage and missing-input treatment.

Before committing to the first financial slice, complete this source-to-output readiness record. These are the current research boundaries, not integrated features:

| Input | Verified now | First analytical use | Still required |
| --- | --- | --- | --- |
| FDOR parcels | Metadata and sample query work; inspected layer is 2025 | Spatial identity/context and source-defined assessment/transaction fields | Correct field dictionary/county crosswalk, full acquired counts, geometry QA and source-record reconciliation |
| DBPR apartment licenses/inspections | One district CSV and inspection extract parsed; 1,129 NAPT source rows in the tested license file | Apartment inventory and dated licensing/inspection events | All intended extracts, license/community/parcel matching and event resolution; these are not financial-distress facts |
| HUD disclosed multifamily loans | Publication and field descriptions found; direct download returned 403 | Covered facility terms/maturity and sourced scenario base | Supported acquisition, actual parsing, Florida counts, field semantics and collateral matching; this blocks claiming the financing source is ready |
| FDIC financials | Anonymous API and schema work | Bank-level multifamily exposure/performance lens | Actual Florida lender cohort and field/period validation; no property-specific attribution |
| NY Fed/Treasury/FRED | NY Fed dated SOFR endpoint works; other feeds have documented access paths | Dated reference rates for explicitly selected scenarios | Adapter validation, vintages and chosen spread/term conventions; a reference rate is not a lending quote |

Record grain is mandatory: source license, parcel, community, building and facility are distinct. Every screen declares its grain and denominator. Multi-parcel or multi-property loans cannot duplicate debt or silently allocate it; an unresolved unit/loan scope blocks dependent per-unit ratios. Unmatched records remain inspectable. Bank-level context, geography-level market series and property performance are separate lenses.

The minimum metric dictionary names a source, numerator/denominator, units, period, cohort, exclusions and user question for each supported metric. Initial categories include reported maturity/terms; scenario debt service and required cash-flow/value thresholds; supported transaction comparisons; separately labeled market context; and empirical peer position or explicit policy criteria. Actual operating ratios require sourced operating data. Geographic statistics cannot pass the property-performance or investment-outcome requirement.

With incomplete private financials, support calculations by their own dependencies. For a sourced covered loan and named financing assumptions, calculate the cash flow and collateral value required to refinance a selected amount, debt service and rate sensitivity across the filtered universe. A dated reported balance can initialize a scenario target with that basis visible; it is not verified payoff. Unknown actual NOI/payoff remain unknown, so actual DSCR or funding gap remain unavailable until their inputs are supported. These threshold/scenario calculations are useful tools, not inferred distress or financing approval, and require independent reference cases. Do not reproduce the old all-inputs-required manual form as the only calculator.

Map, table, counts and inspector use one versioned query. The interface explicitly controls whether panning changes the result set. Unmapped records remain in the coverage denominator. Visual acceptance includes real data at statewide, metro, neighborhood and parcel scales, label hierarchy/collisions, overlapping features, vector/aerial contrast, attribution, source dates and failure states. Frame-rate measurements alone do not establish map quality.

## Architecture proposal

Prefer a modular application with one PostgreSQL/PostGIS system of record and a separate ingestion worker, not a collection of speculative services. Keep the selected Railway hosting target and verify its service configuration against the replacement's measured workload. Preserve the private repository and existing operational resources while planning. Do not drop the existing database or repurpose it as a scratch environment.

```text
Official downloads / supported public APIs / permitted public documents
                  |
       source acquisition + import run
                  |
       retained source snapshot / hash
                  |
      parser + validation + quarantine
                  |
   dated observations + identity assertions
                  |
 property / parcel / entity / loan / financial period
                  |
    derived metrics + cohorts + rule evaluation
                  |
 linked research map + dense screener <-> evidence / peers / scenarios
                  |
       reviewed research outcome and memo
```

The worker owns bounded downloads, parsing, retries and refreshes. User requests query persisted results; they do not perform long imports. Shared typed contracts connect ingestion, calculations and UI. AI is an optional assistant to extraction, matching and explanation after the deterministic path works, not a required source of numbers or a substitute for adapters.

### Required model boundaries

| Domain | Minimum contract |
| --- | --- |
| Source and source run | Owner, official locator, access/reuse basis, expected fields and coverage, snapshot date, retrieval time, content hash, parser version, start/end/outcome, row counts, rejects and error reason. |
| Property and parcel | Canonical community ID independent of address/vendor; jurisdiction + parcel ID; many parcels/buildings per community; geometry provenance and vintage; source-specific identifiers. Parcel classification alone does not establish community boundaries or unit counts. |
| Entity and relationship | Separate owner, borrower, sponsor, manager, registered agent, lender and servicer relationships; dated evidence; proposed/confirmed/disputed assertions; reversible merge/split history. |
| Facility and collateral | Loan IDs and dated terms; many-to-many collateral; recorded original principal distinct from reported balance and verified payoff; maturity distinct from extension status; source-reported allocations distinct from estimates. |
| Observation | Typed value, units, financial basis, period/effective date, source publication and retrieval dates, page/cell/record locator, extraction/review state, supersession/conflict relationship. Unknown, inapplicable and unavailable are distinct states. |
| Financial statement | Source period and scope, original line items, mapping version, adjustments and reviewer; NOI, lender cash flow and reserves kept distinct. Never overwrite a reported statement with a scenario. |
| Market series and cohort | Geography/vintage/definition, membership and exclusions, sample size, normalization, distribution and known comparability limits. A county rent statistic cannot become a property's actual rent. |
| Scenario and rule result | Versioned assumptions and selected observation IDs, calculation version, as-of date, warnings, rule expression, result, decisive missing inputs and output explanation. |
| Change and research outcome | Material source/interpretation change linked to earlier and later values; deduplicated refresh events; reviewed shortlist/decline/outcome kept apart from source truth. |

Store queryable typed fields for important observations; do not turn the data model into an unvalidated JSON evidence bucket. Preserve original source values alongside normalized values. The selected current observation is a reversible resolution, not deletion of alternatives. Historical queries must distinguish what was effective at a date from what the system actually knew then.

### The map and table workspace the user should open

The main route is a linked geographic research map and populated, filterable financial table. Both are first-class parts of the workspace, with a resizable split and saved layout preference. Geographic selections constrain the table; table selections identify and focus the corresponding property/parcel/loan context on the map. A thin toolbar supplies saved screens, spatial tools, layer controls, precise numerical formatting, visible as-of dates and source freshness. No giant metric tiles, landing-page hero, decorative card grid or next-action panel precedes the research surface.

Proposed desktop presentation follows the supplied table: about 30–34 px ordinary rows, compact rectangular labels, restrained gray headers, clear row/column alignment, right-aligned numeric fields, units in headers, sticky identity columns, keyboard navigation, column resizing and horizontal scrolling. A contextual detail panel opens source, benchmark and scenario analysis without losing map extent or screen filters. These are proposed measurable design targets, not evidence that they have already been implemented.

The map needs a legible, properly licensed basemap, parcel-level context at close zoom, property/community selection, linked disclosed-loan context, meaningful clustering at wider extents, and spatial searches by viewport, polygon and distance. Statewide aggregates need denominators and clear definitions; clusters cannot imply distress merely because they contain many records. An uncovered area differs from an area with no matching records. Show geometry vintage, positional precision, missing locations, unresolved matches, source attribution and layer-specific dates. Never place an unknown property at a county centroid and present the point as its actual location.

Use spatial indexes and scale-appropriate feature delivery. Do not download all statewide parcel polygons into the browser as one GeoJSON document. Evaluate vector tiles or bounded feature requests against the actual acquisition volume and source rights. On narrow screens use a deliberate map/table mode switch that preserves selection, filters and analysis context; do not hide the central map behind a county tab. Private addresses/coordinates must not leak through public tiles, unauthenticated responses, geocoder queries or third-party telemetry without an explicit permitted data flow.

Column sets reflect the screen's actual data:

- Inventory/event screen: community, location, supported units/year/type, recorded owner, source event and date, recorded transaction fields, source vintage and unresolved matches.
- Financing screen: borrower/lender, facility scope, reported balance/date, maturity/extension evidence, financial period, source-reported or calculated coverage, selected scenario proceeds/gap, rule reasons and missing inputs.
- Comparison screen: selected cohort, source-defined price/unit or rent/expense metric, observation period, peer median/range, inclusion count and comparability warning.
- Sponsor/lender screen: supported relationships, covered properties/facilities, supported exposures, maturities and explicit coverage denominator. Bank-wide context is visually distinct from property-specific evidence.

Selecting a value opens its source and transformation; selecting a reason opens the rule and inputs; selecting a property opens ownership, debt, financials, peers and scenarios in context. Manual correction adds a reviewed observation; it does not replace ingestion. An unsupported analytical view should say what data is missing and why. It must not be padded with invented rows or masquerade as a delivered capability.

## Concrete delivery slices

These are proposed implementation packages for later authorization. No duration is promised before source/tool experiments. Run source discovery and calculation/tool evaluation in parallel, but each delivered slice must end in a useful, verified user flow.

### 0. Replacement contract and evidence pack

Finish the comparison with the original requests, remove superseded guidance from active entrypoints, and agree a concise capability map. Preserve historical source records as historical evidence rather than build instructions. Create a clean replacement branch only when implementation resumes; preserve the rejected branch and any actual research records. Classify existing records as synthetic QA or user-entered evidence before any migration.

Acceptance: a reviewer can inspect a concrete primary screen specification and the exact proposed first source-to-analysis flow. Every planned capability has an input source, computation/interpretation, user decision and acceptance demonstration. Repeated lists of aspirational integrations are not completion evidence.

### 1. Real public-data map, property inventory and disclosed-loan screen

The source researcher found a queryable statewide Florida Department of Revenue cadastral FeatureServer, successfully downloaded and parsed a DBPR lodging-license CSV with nontransient-apartment records, and found an official HUD active FHA multifamily loan XLSX listing loan/property fields. The first proposal is therefore **DBPR apartment identifiers/locations plus FDOR parcel identity/geometry and linked HUD disclosed multifamily loans**, with FDIC bank context as a separate lender-level dataset. DBPR is a licensed-property inventory source, not proof of operating performance, distress or complete apartment-community coverage. One tested district file contained 1,129 nontransient-apartment rows among 28,295 lodging rows; the other six district extracts still require acquisition and verification before a statewide count is claimed. Validate headers rather than assuming fixed column positions.

FDOR's inspected layer is a 2025 vintage, not a live parcel feed. The HUD publication was listed as 2026-08-31, but programmatic download returned 403 and parsing was not established in the research run. The publication listing is not proof of a usable adapter. Confirm the [source report's](PUBLIC-DATA-RESEARCH.md) exact evidence and access conditions before implementing. These research experiments establish source feasibility, not app ingestion.

Evaluate actual acquisition, parser, identifiers, joins, dates, fields and terms. Verify which reported fields are loan rate, scheduled maturity, amortized balance and monthly principal/interest, and which cannot support current performance or payoff. Do not substitute Treasury rates or a generic parcel inventory for the disclosed-loan portion. If supported HUD acquisition remains unavailable, publish that blocker and evaluate another verified free loan-level source; do not fill the loan table from hypothetical cases. Use a deliberately varied county/loan sample for matching verification while retaining all-67-county architecture and explicit coverage status. The first sample is not a silent geographic scope reduction.

Deliver the entire chain: acquisition → retained provenance → parser validation → canonical property/parcel/loan identity → linked map and financial table → source drilldown → second import. Proposed first analytical outputs are reported maturity screens and disclosed financing characteristics with explicit observation dates, spatial context and missing operating data. Add FDIC lender context only where entity matching is supported, clearly labeled as bank-level data. Do not claim complete Florida loan coverage from an FHA subset. The exact initial screens depend on successful source parsing and field validation.

Acceptance:

1. Starting from a clean test database, an operator can run a documented source import and obtain real named properties, without hand-entering each row or seeded demonstrations.
2. Publish the acquired universe, imported/rejected counts and exact field coverage. Independently inspect a proposed 30–50-record sample across the selected formats; include multi-parcel properties, ambiguous matches and missing fields. The sample is an audit, not the total inventory.
3. Every displayed decision-useful field reconciles to its source record and period. No sampled critical identity/money/date discrepancy remains unexplained. Report the sample and observed error/abstention rates rather than claiming universal correctness.
4. Re-importing the identical source makes no duplicate properties/observations/events. A changed real snapshot creates a traceable revision. A deliberately failed fetch leaves the last valid dataset visible as stale, not newly fresh or empty.
5. A saved screen, table, map and detail query reconcile to the same filter/version and coverage denominator. Demonstrate a useful covered-loan result, including a valid empty screen when acquired coverage and the rule support it. Before calling this the first analytics release, also demonstrate a sourced scenario or defensible comparison from slices 2–3; a directory or a maturity column alone is insufficient.
6. On real multi-county data, a reviewer can draw an area, inspect the resulting financial rows, select a row to inspect its parcel/community/loan context, and open the exact evidence without losing the spatial screen. Boundary-edge cases, missing coordinates, multi-parcel communities and unresolved joins behave explicitly. Cluster counts reconcile; collapsed map groups do not change totals.
7. Establish and measure a map/query performance budget on the acquired representative volume. Record dataset size, device, viewport and network conditions. Demonstrate statewide-to-parcel zoom, pan, selection and filter response without rendering the entire parcel dataset in memory; verify desktop and narrow-screen behavior, keyboard table access, layer attribution and authorization. A static screenshot or county choropleth cannot pass this criterion.

### 2. Evidence-backed debt and refinance analysis

First verify whether free public sources supply sufficient loan-level fields for a covered Florida subset. Candidate sources from the separate research must be tested, not assumed. Publicly accessible debt/servicing disclosure coverage may support a subset; recorded mortgages alone cannot establish current payoff or financial performance. If the free-source experiment cannot produce enough evidence, publish the exact coverage limitation and maintain incomplete results. Do not quietly substitute simulated financials to pass this slice.

Deliver facilities, collateral links, reported maturities, extension evidence, financial periods, debt-service conventions and a refinance scenario. Show each sizing constraint and binding limit; subtract fees/reserves and compare to supported payoff/obligations. Report observed values separately from analyst scenario assumptions. Include rate/cap/NOI sensitivity and decisive missing inputs. A public benchmark rate is market context, not a lender quote or automatic underwriting rate.

Acceptance: a real covered property can be followed from source document/record through the calculator to a screening explanation. A reviewer independently reproduces supported results under the same assumptions. Required cases include incomplete payoff, maturity extension, IO/amortization change, portfolio collateral, conflicting periods, fees/reserves and negative economics. Synthetic cases remain essential regression tests, but do not replace this end-to-end real-source demonstration or independent financial reference review.

### 3. Comparables, performance and transparent grading

Deliver separate market, operating and investment-outcome comparison types. Start only with metrics supported by acquired data. Public transactions may support selected sale comparisons; public geographic series may support market context. Do not present either as private-property NOI, current occupancy, achievable rent, cap-rate evidence or realized investor returns without the necessary observations.

Expose cohort inclusion/exclusion rules, sample size, dispersion and period. Allow reasoned cohort edits. Implement criterion-level results: met, not met, conditional, unknown or inapplicable. Keep lender/program eligibility, workspace investment policy, empirical peer position and evidence completeness separate. An overall grade remains unavailable until its purpose, policy and validation are established; this is not a reason to omit usable metric comparisons and rule explanations.

Acceptance: an independently enumerated real cohort reproduces its displayed members and statistics; changing the cohort changes only the relevant comparisons; missing property inputs cannot improve a grade; a hard blocker cannot be averaged away; sparse cohorts remain visible as sparse; changing the analysis date does not use later information. A reviewer can explain exactly why two properties appear in different result bands.

### 4. Lender and sponsor intelligence

Deliver sourced relationship graphs and analytical portfolio tables. Separate recorded borrower/lender relationships from ultimate sponsor attribution. Do not establish common ownership from a registered agent or similar name alone. Where available, connect bank-level public performance/context to a lender entity without attributing bank-wide delinquency to an individual property.

Acceptance: known related and unrelated examples produce justified relationships; disputed matches stay reviewable; a reversible split repairs aggregates; shared-collateral loans count once at portfolio level; exposures and maturity concentrations display covered amounts and unknown coverage. The output must support an actual lender/sponsor research question, not a contact or task list.

### 5. Full investment and development workflows

After source-backed screening, extend the selected underwriting engine with acquisition/recapitalization cash flows, normalized operations, operating improvement costs, exit assumptions, equity requirements and dated returns. Add completion/development cash flow, draw schedules, cost to complete, delays and stabilization as a separate supported model. Evaluate incentive programs using date-correct rules and status, with unapproved benefit scenarios separate from base economics.

Acceptance: independently reviewed reference cases reconcile line items, debt balances, cash flow, capital calls and reported returns. Include ordinary outcomes and failures as well as successful projects. Model scope is explicit: a single senior-loan model cannot silently price cross-collateralized facilities, preferred equity or a development waterfall. Free public evidence will not necessarily close the private financial gaps; missing actuals are a limitation, not a license to invent them.

### 6. Continuous research operation

Source revision history and deduplication start in slice 1. Extend them with bounded schedules, material-change feeds and saved-screen alerts once the real adapters demonstrate stable behavior. Add AI only to specific measured extraction/research tasks, with visible source citations and review of consequential fields.

Acceptance: repeated unchanged refreshes produce no spurious changes; corrected source records recalculate affected results with explainable old/new versions; failed imports do not erase prior coverage; a reviewer can reproduce an older saved analysis; source and document recovery works; no revoked user gains access through exports, cached results, files or AI retrieval.

## Keep, revalidate, rewrite or discard

This is a proposed disposition matrix. It does not authorize deleting historical records or running migrations now.

| Existing material | Disposition | Reason / prerequisite |
| --- | --- | --- |
| Original concept and direct user requirements | Keep as dated evidence; reconcile later explicit decisions | The original product question and data relationships remain relevant; old pilot geography and vendor suggestions are not current decisions. |
| Product methodology distinctions | Keep the concepts, rewrite as executable contracts | Correct ideas on periods, lineage, cohorts and grades were never made into delivered workflows. |
| Private repository, logo, one-workspace policy | Keep | They remain within the stated scope. |
| Better Auth, allowlist/session code and auth tests | Revalidate and selectively reuse | Security scaffolding has value, but the replacement must test every new source/file/query/export/worker boundary. Confirm actual login/recovery separately. |
| `lib/finance` primitives and independent regression fixtures | Revalidate; selectively reuse behind explicit adapters | They are limited formula kernels. Current `sizeDebt` requires all four constraints, uses fixed cash-flow conventions and is not a full refinance engine. NPV is not IRR; PMT is not a full debt schedule. |
| Exact-dollar conversion, immutable audit/idempotency ideas | Revalidate and adapt | Useful engineering behavior, currently coupled to a deal-form schema. |
| Current deal schema, service and form-first flows | Rewrite | Wrong root entity and primary interaction. Do not evolve by adding dozens of nullable fields to `workspace_deals`. |
| Current overview, giant tiles, recent-deals table and next-action-led detail | Discard as product design | They prioritize work tracking and manual records. No further restyling should be counted toward the replacement. |
| County catalogue/official geometry | Keep with source/date check | Useful reference data. Manual deal counts cannot represent property/source coverage. |
| Current MapLibre component | Keep the library only if the tool evaluation supports it; rewrite the map experience | A viable renderer does not validate the existing county-count UX. The replacement needs a central linked research map, parcel detail, source-aware layers, spatial queries and measured statewide scale. |
| Existing migrations and actual persisted history | Preserve; design explicit migration/archive later | Do not rewrite applied migrations or wipe a database to simulate a clean rebuild. Synthetic QA records must not migrate into real research. |
| Docker/CI/Railway configuration and recovery scripts | Revalidate | Reuse only after verifying replacement runtime, schema, worker and storage needs. Health/build success is not product acceptance. |
| Reviews claiming completion of limited prior milestones | Historical evidence only | Keep exact scope/revision when useful, remove from active build authority. No inherited completion status for unimplemented analytics. |
| Stylistic recovery notes and superseded next-task instructions | Remove from active guidance | They can send another agent back into polishing the rejected product. Parent owns the exact document cleanup. |
| Synthetic UI fixtures and screenshots | QA-only, excluded from capability proof | They can test density and failure states; they cannot establish source coverage or usefulness. |
| Lists of tool names without an integration experiment | Replace with evaluation records | Each adopted tool needs a real input/output test, license/version check, limitations and a reason to adopt over a simpler alternative. |

## Gates that must not recreate the same failure

Unknown buy box, capital limits and return hurdles block personalized ranking and investment approval. They do not block public-source ingestion, canonical property identification, neutral comparisons or building reproducible calculators. A private production restore gate belongs before sensitive real documents and operational private data; it should not be misrepresented as a reason to avoid isolated public-data adapter experiments. Specific output gates should replace a single broad chain that makes a manual workspace the only deliverable.

Every feature review must present five things together: **the original user need, real input evidence, implemented transformation, usable output, and explicit unsupported scope**. Unit tests and synthetic fault tests support this evidence but cannot replace it. A working module means a user can exercise that chain in the application, not merely find its function in a library.

The source/tool researchers should deliver evaluated choices, not a shopping list: access and license, actual sample fields, dates/coverage, a successful read/parse experiment where feasible, missing fields, operational requirements and integration fit. Do not require payment or a vendor account to make the initial research screen useful.

## Questions that genuinely change the design

Free public sources first is answered. Geography and internal scope are answered. Styling is not the next uncertainty. The remaining choices should be asked against the source experiment results:

1. Which analytical outcome should be the first deep workflow: covered-loan refinance/recapitalization, acquisition/value-add comparisons, or lender/sponsor research? Proposed default: refinance/recapitalization **if** the public-source sample supports it; otherwise present the precise tradeoff rather than silently building a different product.
2. What property-size and asset-type boundary defines an apartment opportunity: all multifamily, a minimum unit count, or a few explicit segments? This changes inventory matching, denominators and valid cohorts. It need not block retaining the broader source inventory.
3. For an incomplete public record, which analyst-supplied assumptions are acceptable for scenario exploration, and which missing facts must leave an output unevaluable? Proposed default: assumptions are allowed only in explicitly named scenarios; reported facts remain missing.
4. Which familiar completed or failed investments can later be supplied and independently reviewed to validate the full financial workflow and any workspace-specific grade? Their absence blocks decision-ready calibration, not initial data research.

Capital limits, minimum returns, strategy concentration and execution authority are subsequent investment-policy decisions, not prerequisites for an honest public-data research engine. Do not require the entire vision to be restated before source work can begin.
