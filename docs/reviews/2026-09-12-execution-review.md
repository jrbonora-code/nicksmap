> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# Independent execution review — 2026-09-12

Initial reviewed scope: the evolving `feat/private-workspace` working-tree implementation relative to **`3004d554dcbbc977823809056c32ff8cef665b85`**, with finance version **`screening-0.2.0`**. HEAD still identified that foundation commit when this report was first drafted. The release supplement in R12 records subsequent parent-reported CI/deployment evidence at merged **`2063a82460fd03b91b31c847251b24ea456e4bf8`** and the bounded port-routing correction reviewed afterward. That correction was still awaiting its final commit/CI/deployed-SHA verification when this supplement was written. Owner OAuth onboarding remains incomplete.

The reviewer did not implement the application. Review findings were sent to the implementation agents, and the subsequent fixes were read back. The reviewer's only repository-document mutation is this report; isolated synthetic experiments were created earlier under ignored `.local/execution-review/`. The [original independent report](2026-09-12-independent-review.md), including its original findings and reviewed revision, is preserved. Its readback SHA-256 is `06b104c89ac7b5c7c267fbd238615ac6e945fd39f808ef929c448ff5a93f3a5a`.

## Assessment

The implementation now contains a coherent private manual-research slice: named-account authentication, server-side access checks, persisted deal/evidence records, exact USD input conversion, annual operating screens, qualitative research/pass decisions, and immutable decision context. It retains the all-67-Florida-county scope and distinguishes recorded deals from verified data-source coverage. It does not establish a complete underwriting platform, calibrated ranking, incentive eligibility or investment approval.

The earlier NPV defects are resolved within the new documented numerical envelope. Review also exposed stale-write, qualitative-decline and editable-cent issues; the implementation now addresses those findings. The additional mandate concurrency and recovery-portability concerns were corrected and have focused regression coverage. Final infrastructure planning also caught and corrected a potentially destructive resource-address mismatch before apply. No unresolved P0/P1 defect or authentication bypass was established in the final inspected implementation.

The parent has now verified the repaired map in a desktop browser: its state reached `ready`, the container had a nonzero height, Florida county polygons rendered, Lee selection was highlighted, and clicking another polygon changed the selected county to Hendry. The final sign-out button also redirected an isolated authenticated browser to sign-in and subsequent private navigation was denied. The final local `npm run check` passed after the shared auth-client adjustment, including exact map module HTTP/MIME/hash checks. The reviewer inspected the final code but did not perform those browser/build runs. Subsequent Linux CI and live HTTP evidence is recorded in R12; mobile viewport behavior and release parity for the final port configuration remain separate evidence boundaries.

## Scope and evidence boundaries

Reviewed application material includes `lib/finance`, finance reference/error/invariant tests and fault injection; `lib/auth` and auth routes; the workspace data layer, validation, snapshots and server actions; database migrations; forms, decision rendering, map integration and application layouts; nonce CSP; database recovery scripts; standalone startup, Docker packaging, CI and Railway declaration; and the updated architecture, decision, calculation, roadmap and deployment documents.

Installed Better Auth 1.7.4 source was inspected for GitHub profile retrieval, callback account identity, default OAuth scopes, PKCE/state, session expiry and refresh behavior. Installed Next.js 16.3.5 documentation and runtime source were inspected for nonce propagation, dynamic rendering and generated standalone ESM startup. These checks used the actual installed implementations rather than assumptions about older framework APIs.

Final readback also covered the shared Better Auth browser client, sign-in/sign-out callers and allowed auth routes. The reviewer confirmed the removed custom sign-out wrapper is absent, the Docker context explicitly retains public county data, generated MapLibre modules are excluded from application linting, and type checking first regenerates Next route types using the installed framework's documented `next typegen && tsc --noEmit` sequence.

The reviewer did **not** run Next builds or web/database services, operate the browser, apply migrations to production, provision infrastructure, read unrelated project secrets, change remote settings, commit, push or deploy. Database integration, restore and browser results below are explicitly attributed to the implementation agents or parent. They supplement, rather than masquerade as, the reviewer's independently executed checks.

## Findings and resolutions

### R1 — Prior F1/F2: inaccurate cancellation and zero-flow overflow — resolved within the declared envelope

**Files:** `lib/finance/cash-flows.ts`, `lib/finance/validation.ts`, `tests/finance/cash-flows.test.ts`, `tests/finance/reference-cases.json`, `scripts/test-financial-guards.mjs`, `docs/CALCULATION-VALIDATION.md`.

The prior F1 schedule had exact zero NPV but returned a large finite loss after distant negative-rate discounted terms lost precision before summation. The new implementation budgets rounding exposure using absolute discounted terms before cancellation and returns a blocking `NPV_PRECISION_UNSUPPORTED` result outside its supported envelope. It preserves exact integer arithmetic when the rate is zero or every nonzero date group is on the opening date.

The prior F2 schedule became an overflow error merely by adding a distant zero-valued flow. Zero net date groups are now skipped during discounting, after every original record and gross accounting total has been validated. The original valuation date and gross contributions/distributions remain intact.

The reviewer independently reran the 85 financial tests and 12 fault injections and compared 1,605 new schedules with high-precision arithmetic. No accepted NPV exceeded the declared 0.01-cent target in that sample. The support rule is deliberately conservative and is documented as an engineering envelope, not a formal portable bound on every ECMAScript transcendental implementation. It does not create a new sub-cent guarantee for payment or ratio outputs.

### R2 — P2: stale deal forms could silently overwrite newer facts — resolved

**Files:** `lib/workspace/service.ts` (`updateDeal`), `lib/workspace/validation.ts` (`parseDealForm`), `components/workspace/forms.tsx` (`DealForm`), `tests/workspace/database.test.ts`.

Originally, two tabs could load the same deal; one user could change price/notes, then the other user's next-action edit would overwrite those fields from its stale full form. Taking a row lock only at save time did not identify that stale input. The audit trail preserved recovery evidence but the second save still reported success.

The form now submits `expectedUpdatedAt`. The service compares that version with the locked current row, rejects a stale save and advances the timestamp by at least one millisecond on each accepted edit. The reviewer inspected both sides of the interface and the regression that keeps the first user's price after rejecting the second stale save. The data agent reports the real PostgreSQL regression passed.

### R3 — P2: declining a deal required inventing otherwise unknown financial inputs — resolved

**Files:** `lib/workspace/validation.ts` (`parseResearchDecisionForm`), `lib/workspace/snapshot.ts` (`prepareResearchDecision`), `lib/workspace/service.ts`, `db/003-qualitative-decisions.sql`, `app/(workspace)/actions.ts`, `components/workspace/research-decision-form.tsx`, `components/workspace/deal-detail.tsx`, `components/workspace/screening-results.tsx`.

The original stage gate required a successful full numerical screen before a reasoned pass could be recorded. A deal rejected on a site constraint or other qualitative evidence could not reach `passed` while its unit count and eleven monetary inputs remained unknown. The reviewer reproduced the parser rejecting all those missing financial fields on a fully reasoned pass submission.

There is now a separate qualitative `research`/`pass` path that freezes the deal, selected dated evidence, mandate, actor and reason with `inputs: {}` and an explicit `not_calculated` result. Its browser form does not require financial values; its result renderer says financial metrics were not calculated. It cannot create an `advance` decision. Numeric screening still requires explicit inputs and server-side recalculation.

The data agent reports a PostgreSQL regression proving unknown-finance pass and the corresponding stage transition. The parent separately reports exercising this path in the browser. The stage gate was also tightened to use the latest saved decision, so an older advance cannot override a later pass/research decision; save timestamps use `clock_timestamp()` after the deal lock to reflect save chronology.

### R4 — P3: displaying an editable amount could change a supported cent — resolved

**Files:** `components/workspace/forms.tsx`, `components/workspace/ui.tsx`, `components/workspace/screening-results.tsx`.

The reviewer directly reproduced `(9007199254740990 / 100).toFixed(2)` producing `"90071992547409.91"`. An untouched edit/save would therefore turn 9,007,199,254,740,990 cents into 9,007,199,254,740,991 cents. This is an extreme supported-input boundary, not an ordinary property-price discrepancy.

Editable amounts now use integer/BigInt whole-and-remainder formatting. Stored integer-cent values use the same exact representation for detailed display; fractional calculated outputs retain their declared display rounding. The reviewer checked the helper and its form/result call sites. The ordinary summary cards may still intentionally display rounded whole dollars.

### R5 — P3: mandate drafts had the same stale full-text overwrite risk — resolved

**Files:** `lib/workspace/service.ts` (`mandateFor`, `saveMandate`), `lib/workspace/validation.ts` (`parseMandateForm`), `components/workspace/forms.tsx` (`MandateForm`), `tests/workspace/database.test.ts`, `tests/workspace/validation.test.ts`.

The follow-up now requires an explicit version field, including a deliberately empty initial version mapped to null. The service locks the mandate row before comparing versions and advances accepted revision timestamps monotonically. Missing/malformed version values fail validation; a stale save rolls back its idempotency reservation and returns a clear conflict response. The form preserves unsaved text and explains how to copy/reconcile it before reloading. The draft cannot be promoted to reviewed by a browser-supplied status.

The reviewer read the final form/parser/transaction path and independently reran the relevant pure validation tests. The data agent reports real PostgreSQL tests for simultaneous initial saves, simultaneous edits, idempotent replay of the winner, rejection and rollback of the loser, and successful reconciliation against the latest version. The parent subsequently verified in two browser tabs that draft A saved, stale draft B was rejected while its unsaved text remained, and reloading still showed A. This closes the earlier nonblocking mandate follow-up.

### R6 — P3: recovery fingerprints depended on timezone and collation — resolved with stated portability limits

**Files:** `scripts/db-recovery-support.mjs`, `tests/workspace/database.test.ts`.

The reviewer identified that `to_jsonb` serializes `timestamptz` using the session timezone and that the row aggregation order inherited the database collation. Identical restored data could therefore produce a different logical fingerprint on another cluster configuration.

Fingerprinting now checks out one connection, sets its timezone to UTC and uses explicit `COLLATE "C"` for table and row ordering. The data agent reports that a Honolulu/Tokyo session regression failed before this change and passes after it; a separate dump/restore between databases with those different default timezones also matched all table counts/content. The reviewer inspected the fixed SQL and regression. Different cluster collations were not independently exercised; explicit C ordering supplies the implementation contract for that part. This is local recovery evidence, not a production restore certification.

### R7 — Deployment-path validation gap: container smoke skipped startup migrations — addressed in CI configuration

**Files:** `Dockerfile`, `scripts/start.mjs`, `.github/workflows/ci.yml`.

The first container smoke omitted `DATABASE_URL`, so it skipped the new migration-before-listen branch even though host-side PostgreSQL tests passed. The reviewer raised that gap. CI now launches the actual Linux image with a dedicated CI PostgreSQL URL, checks HTTP behavior and loads the shipped 67-county asset. Docker explicitly copies the database/migration resources needed by the launcher.

This configuration addresses the missing test path. The reviewer did not execute that container. The parent subsequently reports main CI run **34676351685** passed at merged `2063a82460fd03b91b31c847251b24ea456e4bf8`, including this configured Linux runtime path; the later port-configuration follow-up still requires its own final release verification.

### R8 — Parent-discovered map defect: zero-height canvas; independent lifecycle follow-up — resolved, with desktop browser evidence

**Files:** `app/globals.css`, `components/workspace/county-map.tsx`.

The parent observed a blank map in a real browser and traced it to unlayered MapLibre CSS overriding the application's layered absolute positioning, leaving the map container at zero height. The patch adds a scoped unlayered positioning rule and explicit dimensions, observes container resizing, retains an unavailable fallback, and waits for a rendered idle state before declaring the map ready. Geometry correction first exposed the separate worker issue in R9; the final parent browser retest after both fixes measured approximately **471.4 px** of container height and showed a working county map.

The reviewer separately noted that recreating the map after a `coverage`/`deals` prop change must reset loading/apply the current county selection; otherwise a previous `ready` state and unchanged selection can leave the new selection layer empty. Readback confirms readiness is now associated with the exact data-resource references and the latest selected-county ref is applied when creating the new layer. Old disposed initializations cannot publish a new status. The parent verified initial rendering, the Lee highlight and map-to-heading selection of Hendry; a dedicated browser test of every resource-refresh race was not performed by this reviewer.

### R9 — Parent-discovered map defect: ESM worker/shared-module packaging — resolved with local browser and subsequent release evidence

**Files:** `components/workspace/county-map.tsx`, `scripts/copy-maplibre-worker.mjs`, `scripts/check-map-assets.mjs`, `package.json`, `proxy.ts`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`.

After correcting canvas geometry, the parent traced the remaining loading state to the MapLibre 6 worker's ESM/shared-module packaging under Next/Turbopack. This is a separate runtime-resource failure; serving a map component and valid county GeoJSON did not prove its worker could execute.

The repair copies the worker, shared module and license from the installed lockfile-pinned package during `predev`/`prebuild`, sets the same-origin worker URL before constructing the map, and excludes those static worker modules from the per-document nonce policy. The page retains its nonce CSP. Both module responses are checked for HTTP status, JavaScript MIME type and exact SHA-256 agreement with the installed package in smoke/CI. Map initialization also has a bounded failure deadline with an explicit unavailable state and cleanup guards.

The reviewer inspected the patch and the installed package's documented module-worker URL behavior. The parent subsequently reports the final local `npm run check` passed with exact worker/shared-module HTTP hashes, correct JavaScript MIME types and no inappropriate document-nonce CSP on worker responses. The parent's actual browser map reached `ready`, rendered counties and responded to selection, establishing the local functional correction. The reviewer did not rebuild assets or operate that browser. The later parent-reported passing Linux CI and public module HTTP/hash checks are recorded in R12.

### R10 — Parent-observed sign-out interaction lacked visible completion — resolved in the local browser

**Files:** `lib/auth/client.ts`, `components/workspace/sign-out-button.tsx`, `app/sign-in/sign-in-button.tsx`, `app/(workspace)/settings/page.tsx`; removed `app/auth/signout/route.ts`.

The parent repeatedly observed the original native-form sign-out interaction leaving the browser page unchanged. A direct synthetic HTTP POST returned 303 and revoked the session, and reloading then redirected to sign-in. That separated working server revocation from the unsuccessful visible browser interaction; the underlying cause of the form interaction was not established.

The settings page now uses the maintained Better Auth client's credentialed POST to the existing allowed `/api/auth/sign-out` endpoint. The button displays a pending state, disables repeated interaction, exposes retry feedback on error and performs a full `window.location.replace("/sign-in")` after a successful response. Sign-in reuses the same client. The reviewer inspected the installed client's route/method behavior and the application call sites; the exact-origin POST hook, server identity policy and authenticated data-layer boundary remain in place.

After rebuilding, the parent created a fresh legitimate synthetic Better Auth session in the isolated database, clicked the actual button and observed `/sign-in` with “Welcome back.” A subsequent navigation to `/deals` redirected back to sign-in. The parent also reports the final `npm run check` passed after this change. This establishes the normal local browser flow, not completed owner OAuth or a database-failure injection test of revocation. The reviewer did not run that browser or build.

### R11 — Parent-discovered infrastructure resource mismatch proposed replacement — resolved before apply

**Files:** `.railway/railway.ts`, `.railway/README.md`; saved read-only preview `.local/final-infra-plan.json`.

The parent's final Railway preview found that the custom PostGIS image is imported as `service.postgres`, while the previous authoring declaration used `database.postgres`. The mismatch proposed creating a database resource and deleting the existing service. That was a potentially destructive delivery defect, even though the running database was healthy. The parent reports that the destructive plan was never applied and all production service/volume IDs remained unchanged.

The declaration now uses `service("postgres")` with `image("postgis/postgis:18-3.6")`, preserves the existing database variables and explicitly attaches `volume.postgres-volume` at `/var/lib/postgresql/data`. The volume declaration retains region `us-east4-eqdc4a` and size `50000` MB. Preserving `PGDATA` and the existing mount avoids coupling this address correction to a cluster layout change.

The reviewer independently read the final saved CLI preview: it identifies the linked Railway project and its production environment, reports `ok: true`, `changeSet.changes: []`, `diagnostics: []` and `diff: "No changes."`, and has `applyResult: null`. Both current and desired graphs contain `service.postgres` and `volume.postgres-volume`. The parent reports TypeScript and diff checks passed after the correction. This closes the declaration mismatch against that preview; it does not replace a fresh target/plan review before any later infrastructure apply or establish final application deployment.

### R12 — Release supplement: public domain targeted the wrong listening port — resolved in a controlled live retest

**File:** `.railway/railway.ts`. **Saved evidence:** `.local/domain-routing-plan.json`, `.local/domain-routing-plan-after-update.json`, `.local/web-port-apply.json`, `.local/verify-release.mjs`, `.local/release-http-verification.json`.

The parent reports merged `2063a82460fd03b91b31c847251b24ea456e4bf8` passed main CI run **34676351685** and reached Railway deployment `SUCCESS`. Startup logs showed all three migrations applied and Next listening on `0.0.0.0:8080`, while the public health URL still returned 502. The domain targeted port 3000. Successful deployment and internal health were therefore insufficient evidence of public reachability.

The reviewer read the bounded declaration change: it pins web `PORT` to `8080` and the existing service domain to target port `8080`. The installed standalone server reads `process.env.PORT`; Docker's default/exposed port 3000 does not override that runtime variable. The initial saved plan targets the intended project/production environment and lists only one safe `variable.set` for `web.PORT`, with no diagnostics. Its current graph nevertheless shows domain port 3000 and its desired graph shows 8080. The planner did not surface this material domain-routing difference, so the plan's change list alone was not sufficient to implement or validate the correction.

The parent first changed **only the existing domain target from 3000 to 8080** using the dedicated domain command, with the same domain ID retained and an active 8080 readback. The controlled live retest then passed at **2026-09-12T05:50:22.621Z**, before the separate PORT-variable apply. That sequence establishes the routing mismatch as the cause of the observed public failure. The reviewer inspected the verification script and saved receipt: liveness returned 200; tested private workspace routes denied/redirected unauthenticated requests; the public sign-in page stayed closed pending OAuth setup; readiness remained an expected 503; signup/linking endpoints returned 404; and all 67 unique county geometries plus both pinned map modules were served, with module MIME/hash checks.

The parent then re-previewed and applied the separate safe `web.PORT` change to make the runtime setting explicit. The reviewer read the saved apply result: `ok: true`, status `applied`, no diagnostics, and updates confined to the existing web service and its PORT variable. The post-domain-update plan's current graph independently records the existing domain at 8080. The parent also reports TypeScript checking passed. This reviewer performed source/artifact readback only and made no remote changes. The final small configuration/report commit, its CI and exact deployed-SHA match remain the next release gate; the controlled live receipt does not establish completed owner OAuth, authenticated production workflows or production recovery.

## Checks independently executed by this reviewer

Environment: Windows, Node.js **24.13.0**, Python **3.11.15**. No credentials or private deal records were needed.

| Check | Result and boundary |
| --- | --- |
| Financial suite | `node --test --test-reporter=spec tests/finance/*.test.ts`: **85/85 passed**. |
| Controlled financial faults | `node scripts/test-financial-guards.mjs`: **12/12 detected by assertions**, including removing the precision gate and reintroducing zero-group discounting. |
| Independent NPV oracle | **1,605** newly generated schedules; **946 accepted**, **659 blocked**; zero admitted errors over **0.01 cent**. Largest admitted error: **0.0000282557103700 cents**. |
| Oracle coverage | Negative rates close to -100%, rates near zero, rates through +100%; one-day through approximately 7,940-year horizons; broad safe-cent magnitudes; five 10,000-flow schedules. Reference arithmetic used Python Decimal at **110-digit precision**, Python calendar-day differences and supplied decimal rates, independent of production calculation outputs. Blocked results were checked for null values and error issues. |
| Auth policy suite | `node --test --test-reporter=spec tests/auth/policy.test.ts`: **5/5 passed**. |
| Actual GitHub provider mapping | **6** synthetic probes through the installed provider's `getUserInfo`/mapping path: two allowlisted IDs with true MFA accepted; outsider, false MFA, missing MFA and string `"true"` MFA rejected. Fetch was intercepted; no real network or database was used. |
| Workspace validation/snapshot suite | Final `node --test --test-reporter=spec tests/workspace/validation.test.ts tests/workspace/snapshot.test.ts`: **14/14 passed**, including explicit/null mandate versions, qualitative decline, exact USD conversion, evidence ownership, recalculation and snapshot copies. |
| Direct counterexamples | Reproduced the untouched-edit cent change and the original missing-financial-input rejection before their respective corrections. |
| Final saved Railway plan | Read `.local/final-infra-plan.json`, confirmed the intended project/production target, matching service/volume addresses, no changes or diagnostics, and no apply result. This was artifact inspection, not an independent live Railway query. |
| Port-routing release evidence | Read the initial and post-domain-update plans, the PORT apply receipt, and the live verification script/receipt. Confirmed the omitted 3000-to-8080 graph delta, subsequent current graph at 8080 and successful saved HTTP checks. The parent executed the remote commands and HTTP script. |

Independent NPV evidence is in `.local/execution-review/verify_finance.py`, `independent-cases.json`, `independent-results.json` and `independent-report.json`. Provider probes are in `auth-provider-probes.mjs`. These are ignored synthetic review artifacts, not production data or an independently reviewed underwriting workbook pack. Sampling supports the recorded cases, not universal numerical proof.

## Parent and implementation-agent evidence, with attribution

- **Parent, actual Better Auth/PostgreSQL integration:** reports signed-cookie validation, tamper rejection, expiration/revocation, outsider/MFA rejection, PKCE/state and callback/origin tests passing. The parent also discovered that the library accepts cookie-less cross-origin OAuth starts by default and added an exact-origin before-hook for every HTTP POST. The reviewer inspected that hook and its route integration; no authentication bypass was found in the inspected paths.
- **Data agent, actual PostgreSQL services:** reports persisted records, direct unauthenticated service denial, foreign-evidence rejection, server-side recomputation, transactional/idempotent retries, immutable history, stale deal/mandate edits, latest-decision gating, qualitative pass and recovery regressions passing. The reviewer read those test implementations; the reviewer did not independently run the database process or substitute policy mocks for a claim of completed real OAuth.
- **Parent, real desktop browser flow:** reports creating a deal with unknown optional values left blank; rejecting `12.345` as an invalid USD amount; adding dated evidence; recording a qualitative pass without financial inputs; checking a reference annual case with **$210,000 NOI and 1.70 DSCR**, with all ten displayed metrics matching its expected values; and confirming saved snapshot deal context remains unchanged after a later deal edit. The parent also verified working county rendering/selection, two-tab mandate conflict behavior and the final sign-out button/private-route denial described above. These are parent observations, not this reviewer's own browser session or proof of completed production OAuth.
- **Parent, final local integrated check:** reports `npm run check` passed after the final shared-client sign-out adjustment and generated-artifact exclusions, including the financial/auth/workspace checks, build, production smoke and pinned module response checks. Subsequent main CI/Linux and initial release evidence is attributed separately in R12.
- **Data agent, local backup/restore:** reports complete table-content/count agreement, including the cross-timezone exercise described above. No production recovery certification follows from that result.
- **Parent, external infrastructure:** reports the intended private Railway PostgreSQL service running actual `postgis/postgis:18-3.6` after catching the initial default PostgreSQL 18 image. Major version, PGDATA and volume were preserved. The final resource-address mismatch in R11 was caught before apply; the parent reports production service/volume IDs remained unchanged and follow-up TypeScript/diff checks passed. This reviewer inspected the resulting declaration, documentation and no-change plan artifact but did not independently query or mutate Railway.

## Authorization, calculation and delivery conclusions

Every current workspace data entrypoint authenticates before accessing records, and server actions retain that boundary. The implementation uses one explicit shared workspace rather than relying on client filtering. Authentication grants access by immutable numeric GitHub ID and a true MFA profile flag, not by a mutable login or email match. Public signup and linking paths are excluded. Sessions are database-backed, expire without sliding refresh, and the current allowlist is checked for workspace access. The actual owner consent/callback and recovery flows remain separate operational gates.

Browser-supplied calculated output does not replace deterministic server computation. Saved records retain inputs, result/issues, model version, selected evidence content, deal/mandate context and actor/reason. A qualitative decision explicitly has no financial result. Unknowns and negative economics are not silently replaced with favorable defaults. Selecting reviewed evidence does not itself establish lender eligibility, factual completeness or investment suitability.

Nonce CSP follows the installed Next.js guidance: each response receives a fresh nonce, the request CSP supplies it to server rendering, and dynamic rendering prevents build-time freezing. The policy allows MapLibre's local data, blob worker and inline positioning needs. Authentication remains in the data layer rather than being inferred from a proxy cookie. No private fields are placed in the public county GeoJSON.

The startup launcher applies versioned migrations under a checksum/advisory-lock procedure before loading standalone Next. Forward schema changes and application rollback must be considered together: older application images may not understand qualitative result records. Liveness is distinct from readiness, and neither substitutes for financial validation or verified production recovery.

## Remaining gates and limits

1. **Complete the final configuration release and remaining UI verification.** The parent has completed desktop map rendering/selection, local browser sign-out, the local `npm run check`, main CI at merged `2063a82460fd03b91b31c847251b24ea456e4bf8` and the controlled live HTTP verification in R12. Commit the bounded port-configuration/report follow-up, verify its final CI and match the deployed SHA to that exact release. Mobile behavior is not yet verified: the attempted viewport change still reported a 1280×720 DOM, so a requested mobile size alone is not evidence; the override was reset.
2. **Complete actual owner onboarding.** Configure the dedicated OAuth credentials and callback, exercise owner consent, denied-account behavior, production sign-out/revocation and recovery. The synthetic local sign-out evidence in R10 does not substitute for this production exercise. MFA is checked at sign-in, not continuously during an eight-hour session.
3. **Exercise production recovery before sensitive data.** Establish owner, retention, RPO/RTO and a measured production database restore; include document references when private storage is later added. Local synthetic dumps and a reachable database do not close this gate.
4. **Resolve D01–D05 and financial reference acceptance.** The investment mandate, capital/risk limits, licensed workflow comparison and independently reviewed acquisition/development workbooks remain open. No return hurdle, calibrated grade or incentive award is implied by this implementation.
5. **Keep later features explicitly gated.** Real provider coverage/rights, imports, document access, extraction, spatial SQL, incentive rules, full debt/IRR/waterfall/construction analysis and outcome calibration require their own implementation and verification. County presence and manual deal counts are not proof of verified statewide source coverage.

The findings above describe the inspected implementation and the specific, attributed release evidence obtained. They do not certify future edits, final remote synchronization before the recorded release gate, untested production workflows or investment readiness.
