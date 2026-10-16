# Product brief

This charter records the intended product, including capabilities beyond the delivered release. The current [source-to-analysis contract](RESEARCH-RELEASE.md) covers private ingestion, a linked property map and dense screener, source evidence, nomination-eligibility geometry and financing-threshold scenarios. Full underwriting, verified parcel/community reconciliation, broader coverage and calibrated grading remain future work.

## Objective and agreed scope

Find situations in which multifamily development and lending judgment can produce executable investments or paid services, financing and partnership work. Use software and AI to reduce research and underwriting effort. Every opportunity must connect an evidenced need to a potential payer, operator role, revenue mechanism, required commitment and next action. The research should discover new business possibilities as well as evaluate existing investment strategies.

- Geography: all 67 Florida counties, including municipal and unincorporated jurisdictions. Pilot data verification may be sampled statewide; product scope must not silently shrink to southwest Florida.
- Access: one shared internal workspace with an explicit allowlist; one administrator controls access.
- Hosting: Railway.
- Incentives: federal, state, county, municipal and special-district programs; Opportunity Zones, affordability programs and related development benefits.
- Evidence: public records, licensed sources and private uploads, with recorded source, effective date and retrieval date.

## Investment lenses retained in the broader workflow

1. Acquisition from a financially constrained owner: conservative operating economics, total basis and evidence of transaction feasibility.
2. Recapitalization: viable property, funding gap, preferred equity/JV economics, lender consent and downside recovery.
3. Completion or stabilization: independently supported cost to complete, liabilities, schedule, reserves and absorption.
4. Incentive-supported development/repositioning: net benefit after restrictions, compliance, timing and funding/approval conditions.
5. Land control and development value: options or landowner JVs, assemblage, entitlement feasibility, infrastructure and residual land value.

The next implementation is the financing-decision research-to-case workflow in [STRATEGY-EXECUTION.md](STRATEGY-EXECUTION.md), with ordinary refinance, early takeout and restructuring alternatives where evidence supports them. Fee assessment, execution services and partnerships are additional ways to earn; the five investment lenses above are not an exhaustive strategy catalogue. Capital/return limits in [DECISIONS.md](DECISIONS.md) gate suitability conclusions rather than this build.

## Working flow

Repeatable aggregation of real sources is the foundation. Manual corrections and permissioned documents complement ingestion; manual deal tracking and Ideas are supporting workflows. The central map and financial table share selection and query state, with source dates, coverage, conflicts and missing fields inspectable. A community may span parcels and loans, and a facility may secure several assets; sponsor/lender relationships require evidence and may remain uncertain.

Explore -> evidence-linked hypothesis -> verify records -> obtain permissioned inputs -> compare supported alternatives -> review proposed service/transaction or reject -> record agreement and outcome when established. External requests, offers and submissions require the applicable user authorization.

Each decision includes why this property and why now, proposed transaction, capital required, return mechanism, downside, next decisive unknown, next action, owner and due date. Preserve decline reasons and later outcomes. No automatic outreach is part of the initial scope.

## Screens

The following describes the target experience, not a list of completed routes:

- Explore: synchronized map/table, strategy and geography filters, saved searches, coverage and freshness indicators.
- Property: parcel/community relationships, owner/entity evidence, source conflicts, observed vs modeled operations, financing and incentive matches.
- Underwrite: versioned scenarios, capital stack, dated cash flows, cash needs and lender constraints.
- Compare: explainable comp selection, matched cohort distributions, sample size and reference case studies.
- Deals: stage, decisions, next steps and document requests.
- Sources: ingestion health, coverage by county/source, licenses and stale data.
- Settings: workspace access and provider settings.

## Map and visual direction

The product name is **BlackFin**: finance first, with a secondary Florida/coastal association. The current light identity uses ink/slate/porcelain, the original dot-matrix fin, compact spacing and tabular financial typography. [DESIGN.md](DESIGN.md) controls current colors, contextual help and the grey disclaimer footer. Opportunity, evidence quality and risk indicators must be distinct. Unknown data must not look like favorable or low-risk data.

Statewide views cluster points or summarize meaningful metrics with denominators. Zoomed views show communities, pipeline and comps; parcel views add verified boundaries and date-versioned overlays. Support county selection, user-drawn areas and distance searches; drive times require a separate routing source. Show jurisdiction, layer vintage, coverage and attribution. An incentive polygon intersection is a potential match, not approval. A tract or county statistic is not automatically a property's actual condition.

Evaluate purpose-built tools before adding custom implementations, using the [source and reuse record](SOURCES-AND-REUSE.md). A candidate in research is not an integration; package.json and the release contract identify installed tooling and implemented behavior.

Grading remains an intended capability: strategy-specific assessments must expose evidence quality and hard blockers. Policy scores, empirical comparisons and calibrated probabilities are separate outputs. Evaluation requires ordinary performers and failures as well as successful projects; the original illustrative weights are not validated thresholds. Missing investment limits block personalized suitability, not neutral source research or transparent comparisons.

## What constitutes success

A small shortlist worth investigating, clear potential payers and execution roles, reproducible financial conclusions when inputs support them, and less analyst effort per qualified opportunity. Success is not property count, an attractive heatmap, or a high model-generated score.
