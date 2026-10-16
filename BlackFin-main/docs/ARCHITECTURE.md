# Architecture and deployment boundaries

## Implemented workspace

The source-to-analysis implementation is defined in [RESEARCH-RELEASE.md](RESEARCH-RELEASE.md). The linked property map, dense screener and evidence inspector are the primary workflow; manual deals and Ideas support it. The September 12 reset withdrew the earlier manual-first product direction, while selected identity, database and financial primitives were retained.

- Next.js 16 / React 19 / TypeScript, Node.js 24, locked dependencies.
- Private server-rendered workspace with account-gated routes and a generic deployment-liveness endpoint.
- Non-root standalone Docker runtime, Railway IaC declaration, GitHub CI and HTTP smoke verification.
- Better Auth identity with allowlisted email/password access and optional GitHub access through an immutable numeric-ID allowlist and GitHub MFA at sign-in. Server-side membership checks protect private data and actions; database sessions expire and support revocation.
- PostgreSQL deal/evidence/policy/audit schema; strict input conversion; atomic retry handling, stale-edit protection and immutable numeric/research decision snapshots.
- MapLibre property map synchronized with the screener and evidence inspector through a shared validated query. Acquired coverage is seven counties; all 67 Florida counties remain the intended scope. A separate license search retains source-native records without inventing property matches.
- Explicit private source import with content hashes, immutable snapshots, source observations, import history and idempotent replay. Native provider records, licenses, mortgage entries and candidate associations remain distinct. Census tract geometry supports nomination-eligibility intersections without implying property-level tax benefits.
- Versioned financing-threshold scenarios retain assumptions, source snapshot, model version and server-computed results. Missing current NOI, payoff and actual refinance gaps remain missing.
- Finance primitives under `lib/finance`, with strict runtime input validation, fixed reference tests, generated invariant cases and isolated fault-injection checks in CI. Annual operating screening is available to authenticated users; a research/pass decision can preserve unknown finances without calculating metrics.
- Private document storage, AI extraction, recurring source collection, full underwriting and calibrated grading remain future work. No assumed incentive value is exposed.

Tooling compatibility: ESLint 9.39.5 is pinned because the React plugin bundled with the selected Next.js lint configuration fails under ESLint 10.10.0. Track the compatible upgrade; the initial dependency audit found no known vulnerabilities after removal of the npm CLI installer dependency. Railway's CLI is an operator tool installed separately; only the IaC SDK is a project dependency.

## Selected architecture and later extensions

Railway runs the web service and PostgreSQL/PostGIS. [ADR 0001](adr/0001-private-workspace.md) is the historical selection record for the retained identity/database infrastructure, not the current product scope. No second hosted database or storage service is provisioned. The current tract analysis uses Turf against retained geometry; a PostGIS-capable database alone does not establish use of spatial SQL. Add a worker and private object storage only when their source, access, retention and recovery contracts are ready.

MapLibre combines authenticated property/tract data with attributed OSM street tiles and USGS/USDA NAIP imagery. The [release contract](RESEARCH-RELEASE.md#storage-identity-and-access) records basemap boundaries and caching behavior. Private research responses use private/no-store caching; no private financial attributes are placed in public assets or sent to tile providers. The supporting county map retains official county geometry.

Compare existing underwriting products/reference workbooks before writing a complete financial engine. AI extraction can use a validated hosted service or a separate Docling-based worker; do not perform long OCR/import work inside web requests. Start with PostgreSQL-backed jobs such as pg-boss only when actual background work exists.

## Conceptual entities

These remain the broader model requirements, not a claim that every relationship below is implemented. Current provider identities are not verified communities, parcels or financing facilities. Associations and future analyst corrections must retain source evidence and remain reversible.

- Property/community; parcel; address/location and geocoding method; dated jurisdiction/tract boundaries.
- Entity/person records; evidence-backed ownership relationships; reversible matching decisions.
- Loan/facility; collateral allocation; terms, recorded observations and uncertain maturity/balance fields.
- Source, source rights, raw document, observation, extraction, conflict and review decision.
- Financial statement/rent-roll versions, assumptions, scenario, dated cash flow, calculation result/version.
- Program/rule version, geographic applicability, potential match, eligibility evidence and award/approval state.
- Comparable cohort, benchmark project, outcome, policy version and grading explanation.
- Deal, stage, decision memo, next action, document request and outcome.
- Named user, workspace membership, audit event, ingestion run and job attempt.

Record observed/effective dates separately from publication, retrieval and processing dates. Keep unit and period definitions. Unknown is not zero. Loan and parcel relations are many-to-many where required.

## Identity and private files

One workspace for one or two people configured by the owner. Access is either an allowlisted email address with a password the user creates once while account setup is open, or, optionally, an allowlisted numeric GitHub ID with GitHub MFA checked at sign-in. Public registration, automatic account linking, email-based password reset and self-service account changes are disabled; the owner resets a password by clearing its credential row and reopening setup. Both enabled users share research records. Sessions last eight hours and are checked against the allowlist on each server request, without a cookie-data cache. First sign-in and owner recovery must be exercised before operational release. Extend the same access boundary to future storage objects, exports, AI retrieval and workers. Changes are attributed in an immutable audit log.

Use private object storage and short-lived access links. Keep uploads out of the web filesystem and Git. Enforce file-size/type limits, bounded processing and prompt-injection isolation. Model/provider logging and retention require explicit configuration before private documents are sent.

## Operations

One database of record; forward migrations with checksums and an advisory lock; private Railway database networking; certificate-verified connections outside the private network; runtime secrets; atomic retries and idempotent writes. `/api/readiness` checks identity configuration and database tables, separate from liveness. Migrations and source import are explicit operator actions against a verified target; web startup performs neither. See [DEPLOYMENT.md](DEPLOYMENT.md). Background source refresh and ongoing monitoring remain future work.

Railway's deployment healthcheck does not continuously monitor the service. Ongoing monitoring, retention objectives and incident ownership remain operational work. Recheck the documented import/recovery evidence before expanding production data or adding a new storage path. Restore database and document references together and exercise recovery.
