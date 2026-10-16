> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# BlackFin full code review and drift check — 2026-09-12

**Application revision reviewed: `88c047bc3cd78a4a47fc81ea9f383ce0e2ae5f3e` (main).** Read from the checked-out branch `chore/session-handoff-20260912` at `f6f72af`, whose application code is byte-identical to main (verified by `git diff --stat 88c047b..HEAD`: five documentation files only).

## 1. Identity, method and scope

| Item | Value |
| --- | --- |
| Orchestrator | Claude Fable 5.1 (`claude-fable-5-1`), interactive session in the actual repository |
| Reviewers | Four subagents launched with model `opus` (Claude Opus 5), two at a time, one per domain group: finance and inputs; auth and persistence; UI, map and design; deployment, dependencies and documentation drift |
| Raw reviewer output | Preserved verbatim under `.local/fable-review-20260912/` (`finance-report.md`, `auth-report.md`, `ui-report.md`, `ops-report.md`, plus each reviewer's probe scripts). Git-ignored. This document is the consolidation; the raw files carry every line reference and executed output |
| Prior review | `docs/reviews/2026-09-12-claude-review.md` (Claude Opus 5, static, `Read`/`Grep` only, 112 tool calls). Verified complete via the runner's `status.json` (exit 0, subtype success) and the disposition session's `integrity.json` (120 source files, zero hash mismatches). The committed copy's SHA-256 matches the runner's `report.md` |
| Changes to tracked files | None. No commit, no push, no deployment, no Railway mutation, no database started |

### What was executed this session (by the orchestrator)

| Command | Result |
| --- | --- |
| `npm run check` on HEAD (log: `.local/fable-check-20260912.log`) | exit 0: lint; typegen + tsc; finance 85/85; fault injection 12/12 detected; auth-policy 5/5; workspace 15 tests, 14 pass, 1 skipped (PostgreSQL suite, by design); production build; smoke passed |
| `npm audit --json` | 0 vulnerabilities across 507 packages |
| `npm outdated --json` | eslint 10.10.0 and typescript 7.0.2 available (majors); pins are deliberate |
| `gh run list` | CI run 34695163007 success at 88c047b; all earlier main runs success |
| `.local/tools/railway.exe status` and `deployment list --service web` (read-only) | web Online; postgres Online; latest web deployment `172d85e0-b63c-48b3-96e7-93d82bcd145a` SUCCESS at commit 88c047b, Dockerfile builder, healthcheck `/api/health`, region `us-east4-eqdc4a` |
| `gh repo view` | private, default branch main |
| Re-run of reviewer probes | `finance/p4-fields.mjs`, `finance/p8-confirm.mjs`, `auth/probe-additional-fields.mjs`, and an Intl rounding one-liner: all reproduced the reviewers' outputs exactly (details below) |

Database-dependent suites were not run this session. The prior disposition session's receipts (`.local/claude-disposition-20260912-88c047b/auth-integration.tap` 5/5, `workspace-database.tap` 14/14) are supplied evidence, not this session's execution. No browser was driven. No GitHub OAuth callback was exercised.

## 2. Headline

**One P1, confirmed by execution against the installed library.** The pinned Better Auth 1.7.4 discards profile fields declared `input: false` when it maps a GitHub OAuth profile, then rejects the user creation because those same fields are `required: true`. The first real GitHub sign-in therefore cannot create the owner's user row. It fails closed, with no exposure and no row written, but it would have blocked release gate 3 and presented as an allowlist or MFA problem with nothing logged.

Everything else is P2 or below. The wired financial path (the annual operating screen) survived every falsification attempt across two independent reviewers, including an 80-digit oracle written from scratch. Authorization is enforced at every implemented entry point. Immutable history holds for `UPDATE`/`DELETE`. The container, CI and Railway IaC encode every documented constraint. Documentation errs toward understatement, with eleven concrete drift items listed in section 5, two of which are errors in the prior review rather than in the docs.

## 3. Drift check

### Branches, worktrees, remote

- One worktree. Branch graph is linear.
- `main` = `88c047b` = `origin/main` = the live Railway deployment = the CI-passing revision. No drift.
- `chore/session-handoff-20260912` = main + one docs-only commit (`f6f72af`), pushed. `CLAUDE.md` and `README.md` modified; brief, handoff and launch record added.
- `feat/blackfin-light-design` (local) points at `88c047b`, identical to main: stale, safe to delete.
- `fix/railway-routing` (local) at `3d027bc`, an ancestor of main: stale, safe to delete.
- `feat/private-workspace` (local and remote) at `7e4ad9e`, squash-merged as `2063a82` via PR #1; `git diff 2063a82 7e4ad9e` is empty: stale, safe to delete.
- No stashes. One untracked file: `docs/reviews/2026-09-12-claude-review.md`, hash-identical to the runner's output.
- Tracked files: 120 at `88c047b` (matches the source manifest and the launch record), 123 at HEAD.

### Process drift (work done but not recorded)

- A disposition session ran 14:26 to 14:58 UTC and left `.local/claude-disposition-20260912-88c047b/` with executed reproductions of BF-01, BF-02, BF-04, BF-05, BF-07r and the long-schedule NPV case, a synthetic PostgreSQL, a browser build, and the integrity check the handoff asks for. None of it is written up in any tracked document. This report incorporates its results as supplied evidence.
- The snapshot handoff given to the prior reviewer differs from the committed `docs/HANDOFF.md` by one sentence (a link to the launch record added later). Not material.

### Documentation drift (docs disagree with code or evidence)

| # | Where | Says | Reality |
| --- | --- | --- | --- |
| 1 | `docs/METHODOLOGY.md:20` | implementation is `screening-0.1.0` | `lib/finance/validation.ts:1` is `screening-0.2.0` |
| 2 | `docs/DEPLOYMENT.md:33` | "The IaC file preserves runtime secrets" | `.railway/railway.ts:36-43` preserves only `BETTER_AUTH_SECRET`; the two GitHub OAuth keys the same sentence tells you to set are not preserved |
| 3 | `.railway/README.md:3` | "OAuth secrets are preserved in Railway variables" | same as 2; ambiguous wording at best |
| 4 | `docs/DEPLOYMENT.md:55-57` | records CI 34676351685 and deployment `6fdf965a…` at `2063a82` | the deployed revision is `88c047b` (CI 34695163007, deployment `172d85e0…`); only the handoff carries it; line 58 hedges |
| 5 | `docs/ROADMAP.md:27` | gate: "Named invitations, sign-in, MFA, password recovery and session revocation" | the chosen design has no invitations and no passwords (`docs/ARCHITECTURE.md:40`); the gate cannot be satisfied as written |
| 6 | `docs/reviews/2026-09-12-claude-review.md:14` | manifest has "108 files" | 120 |
| 7 | `docs/reviews/2026-09-12-claude-review.md:160` (BF-07r) | GeoJSON provenance "sorted by FIPS" is wrong | the GeoJSON is FIPS-sorted (verified by two independent scripts); the provenance note is correct; acting on BF-07r would introduce an error |
| 8 | `docs/reviews/2026-09-12-claude-review.md:374` | `.dockerignore` excludes `*.pem`, `*.key` | only `.gitignore` does; runtime image is unaffected |
| 9 | `docs/CALCULATION-VALIDATION.md:39` | factor 64 "reserves margin for … compensated summation" | the flow-count-independent reserve is valid only because the summation is compensated (see FIN-02); the dependency is understated |
| 10 | `docs/CALCULATION-VALIDATION.md:43` | payment error "about 1.2634 cents" near maximum principal | the source case (`independent-review.md:104`, one-month term at rate 1e-15) was not reproduced by the finance reviewer, whose worst sampled error was 0.0998 cents; label the figure with its case or restate it |
| 11 | `README.md:17` | "immutable history" | row triggers do not cover `TRUNCATE` (DB-01); `db/README.md:9` has the accurate wording |

Counts verified correct: 85 finance cases, 12 faults, 5 auth-policy cases, 14 passing workspace unit cases, 13 tables, 67 counties, 120 files, Manrope SHA-256, MapLibre module hashes, Node 24 / Next 16.3.5 / React 19.3.0.

## 4. Prioritized findings

Severity is calibrated to a private two-user tool. IDs reference the raw reviewer reports. Prior-review IDs (BF-xx, G-xx) are cross-referenced where the finding confirms or modifies one.

### P1

**SEC-01 — First real GitHub sign-in cannot create the owner's user row.** `lib/auth/factory.ts:37-39` declares `githubId`, `githubLogin`, `githubMfa` as `required: true, input: false`. `node_modules/better-auth/dist/db/schema.mjs:120` drops every `input: false` key from the provider profile; `:103-106` then throws `MISSING_FIELD` because the field is required on create. The new-user branch at `dist/oauth2/link-account.mjs:203` calls exactly that parser before `createUser` at `:215`. Executed by the reviewer and re-executed by the orchestrator: `create -> APIError "githubId is required"`; the same call without `input: false` returns all three fields. The integration test never hits this because `tests/integration/auth.test.ts:29,56,57` create users via `internalAdapter.createUser`, which bypasses the parser. Fail-closed; no exposure. The user would land on the generic "Sign-in was not completed" page with the real cause only in the address bar and nothing logged (SEC-05). **Remedy:** drop `input: false` from the three fields (the route allowlist, `emailAndPassword: false` and the `user.create.before` hook keep them client-unsettable), then add an intercepted-fetch callback test that asserts a real `auth_user` row. Do this before spending a session on OAuth credentials. Also fixes SEC-02.

### P2

| ID | Finding | Anchor |
| --- | --- | --- |
| SEC-02 | `overrideUserInfoOnSignIn` never refreshes the three mapped fields (same root cause as SEC-01), so `githubLogin` freezes at first sign-in and a renamed account stamps a wrong login into immutable audit rows | `factory.ts:24`; `link-account.mjs:178-187` |
| SEC-03 | MFA gate depends on GitHub's `two_factor_authentication` field, which the requested scopes may not return; failure is a raw 403 with no log and no break-glass. Live-verification hypothesis; raised from the prior review's "pre-flight note" because the callback path has never been exercised | `factory.ts:26-28`; `@better-auth/core/src/social-providers/github.ts:75-79` |
| SEC-04 | Rate limiting behind Railway's proxy is either one shared global bucket (10 sign-in starts per minute for the whole internet) or client-controlled via `x-forwarded-for`; no `advanced.ipAddress` config; the library's own warning is suppressed. Sharpens G-04 | `factory.ts:59`; `@better-auth/core/src/utils/ip.ts:293-346`; `rate-limiter/index.mjs:239-245` |
| SEC-05 | `logger: { disabled: true }` removes every authentication failure record and every operational warning, including the ones that would have surfaced SEC-01 and SEC-04. Raised from BF-07l | `factory.ts:79` |
| DB-01 | Immutability triggers are `FOR EACH ROW` on `UPDATE OR DELETE`; `TRUNCATE` is not covered, and the single runtime role owns the tables. Not reachable through the app (all SQL is static with `$n` placeholders) | `db/001-private-workspace.sql:105-107` |
| DB-02 / OPS-01 | The request-path `statement_timeout: 15000` also governs the migration runner, its `pg_advisory_lock`, and the backup fingerprint. Overlapping deploys fail instead of waiting; any migration over 15 s (e.g. `CREATE EXTENSION postgis`) is cancelled; restore verification slows exactly as data grows | `db/connection.mjs:25`; `scripts/db-migrate.mjs:11,25`; `scripts/db-recovery-support.mjs:22,34` |
| DB-03 / OPS-09 | Readiness never consults `workspace_migrations`; with 003 unapplied it reports ready while every research decision fails. The database half of readiness has never executed in production (auth is unconfigured, so it short-circuits). Strengthens BF-07j | `app/api/readiness/route.ts:6-11` |
| OPS-02 | IaC has no `preserve()` for `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`; these are the only two variables the app reads that are neither declared nor preserved. An apply after credentials exist can lock the workspace. Deletion is inferred from documented IaC semantics, not observed. Confirms BF-01 | `.railway/railway.ts:36-43` |
| OPS-03 | Migration, backup and restore tooling collapses every failure into one generic sentence; the useful checksum message authored at `db-migrate.mjs:19` is discarded at `:34`. Reproduced by the disposition session: syntax and checksum failures are indistinguishable, as are missing `pg_restore`, corrupt archive and nonempty target. Confirms BF-02 | `scripts/db-migrate.mjs:34`; `db-recovery-support.mjs:16-18`; `db-restore-check.mjs:30`; `db-backup.mjs:22` |
| OPS-04 | No tool can perform the production restore the roadmap gate requires: the restore target must be loopback and named `radar_test_*`/`radar_restore_*`. Backup can target production; verification cannot. Confirms G-01 | `scripts/db-restore-check.mjs:12`; `docs/ROADMAP.md:31` |
| OPS-05 | Backups are plaintext, unrotated, local-only. Honestly disclosed; owner decision pending (D14). Confirms G-02 | `scripts/db-backup.mjs:9-19`; `db/README.md:19` |
| UI-01 | Every read view rounds the stored asking price to whole dollars with `maximumFractionDigits: 0`, and Intl rounds half up: 250,000,050 cents renders "$2,500,001" in the deals table, overview table and deal summary strip, while the edit field and screening grid show exact cents. Reproduced by the orchestrator | `components/workspace/ui.tsx:21-24`; call sites `overview/page.tsx:20`, `deals-table.tsx:20`, `deal-detail.tsx:24` |
| FIN-02 | P3 today, P2 once `analyzeCashFlows` is wired: the 0.01-cent NPV envelope depends on the Kahan compensation, and no test would catch its removal. Executed counterexample (10,000 flows, $3.32B, rate 0.8): compensated error 6.1e-5 cents, naive error 1.09e-2 cents against an 80-digit oracle; 19 such accepted schedules found in a sweep. At Florida deal scale the two sums are bit-identical. The prior review's proposed 122-flow probe cannot detect the mutation (naive error 1.15e-6 cents) and should not be used | `lib/finance/cash-flows.ts:65-74`; `docs/CALCULATION-VALIDATION.md:39` |

### P3 (grouped; full detail in the raw reports)

- **Finance:** FIN-01 four reachable screening errors map to form fields that do not exist (`rentLosses`, `effectiveGrossIncome`, `cashFlowAfterReserves`, `cashFlowAfterDebtService`); widens BF-04, which said only one. FIN-03 `Inspection.sum` throws `RangeError` on non-integers (unreachable publicly; confirms BF-05). FIN-04 finance date validator accepts year 0000, workspace validator rejects it (confirms BF-07k). FIN-05 METHODOLOGY version string (confirms BF-07a). FIN-06 UI money formatters throw on non-integer/null and nothing pins the guards; `money(-0)` renders `-$0`. FIN-07 six free fault-injection probes the fixture already catches (denominator/numerator swaps), plus the Kahan hole. FIN-08 the NPV scaling invariant is anchored on a base whose NPV is exactly zero.
- **Auth/persistence:** SEC-06 allowlist/MFA denial returns raw JSON, not the styled page. SEC-07 a 32-space secret passes validation; every misconfiguration looks like "not configured". SEC-08 `/api/readiness` is the only unauthenticated path touching the database (availability only). SEC-09 the `/api/auth` path slice is not anchored to its prefix (unreachable; hygiene). DB-04 research decisions audited as `screening.saved` while the idempotency row says `research.decision` (extends BF-07c). DB-05 unreachable "Reviewed" mandate badge (confirms BF-07b). DB-06 no retention anywhere (confirms BF-07m). DB-07 `auth_account` lacks a unique `(providerId, accountId)` but user-level uniques make it unreachable (downgrades G-05). DB-08 `auth_rate_limit.lastRequest` bigint arrives as a string, so `Retry-After` concatenates (hypothesis).
- **UI/map/design:** UI-02 mobile drawer: focus lands but no rule can paint a ring after a pointer open; the full `:focus` inventory is settled statically (three rules, none matching a button), and a browser script with a decision rule is in the raw report. Still unreproduced in a browser. UI-03 = FIN-01's UI half. UI-04 field hints never referenced by `aria-describedby`; errors replace rather than add; the mandate textarea links nothing (extends BF-07p). UI-05 every route is titled "BlackFin"; no root `not-found.tsx` or `global-error.tsx`. UI-06 any MapLibre `error`, including after `ready`, permanently hides a working map behind a 96%-opaque overlay with no retry (extends BF-07e). UI-07 timestamps formatted in UTC with no zone label; a 9:30 pm EDT decision is filed under the next day (confirms BF-07d, executed). UI-08 text contrast passes everywhere (49 of 49 pairs), but 11 of 23 non-text pairs are below 3:1: form-field borders at 1.26:1 and the map's deal/no-deal fills at 1.80:1. UI-09 CSS breakpoint `max-width: 780px` and JS `min-width: 781px` leave a band where the page stays `inert` with no close affordance. UI-10a–o: no scroll lock; scrim button outside the dialog; no `scope` on any `<th>`; `—` vs "Unknown"; heading skips; tabs not written to the URL; served GeoJSON has no in-repo hash; `crypto.randomUUID()` outside the try; unused `compact` parameter.
- **Ops/plan:** OPS-06 all base images float, including the PostGIS database image; Node pinned only to major (extends BF-07i). OPS-07 CI on PostgreSQL 17, production 18, local 16 (confirms BF-07h). OPS-08 CI only ever asserts the container's closed state; readiness 200 is asserted nowhere. OPS-10 `better-call` imported by a test but undeclared (confirms BF-07f). OPS-11 recovery scripts clobber inherited `PGUSER`/`PGPASSWORD` and force `verify-full` without requiring a root cert (narrows BF-07n). OPS-12 `db-test.mjs` retains a database per run. OPS-13 no audit or update mechanism in CI; TypeScript pin has no recorded rationale. OPS-14 no `.mjs` file is type-checked. PLAN-01 ROADMAP gate written against a replaced auth design. PLAN-02 community PostGIS image is an undocumented operating burden for a capability with no consumer.

### Orchestrator corrections to reviewer output

- **PLAN-03 / drift D11 in the ops report is wrong.** The reviewer reported `integrity.json` missing; it exists at `.local/claude-disposition-20260912-88c047b/integrity.json` (zero mismatches). The orchestrator's brief gave the wrong directory. Residual point only: no tracked document records that the check was done.
- The finance reviewer's XNPV hand-check corrects the prior review's "≈ $2,086.66" to $2,086.6476 (rounds to the published $2,086.65). Conclusion unchanged.

## 5. Prior review disposition (summary)

| Prior item | Disposition |
| --- | --- |
| BF-01, BF-02, BF-05, BF-06, BF-07a/b/c/d/e/f/g/h/i/j/k/m/o/p/q, G-01, G-02, G-03 | Confirmed, several with executed evidence and corrected or extended line references |
| BF-03 | Confirmed as hypothesis; CSS half now settled statically; browser reproduction still outstanding |
| BF-04 | Confirmed and widened (four orphaned anchors, not one) |
| BF-07l, MFA pre-flight note, G-04 | Confirmed and raised to P2 (SEC-05, SEC-03, SEC-04) |
| BF-07n | Narrowed: clobbering is certain; the libpq empty-string claim is version-dependent |
| G-05 | Confirmed, impact downgraded |
| G-06 (Decimal oracle absent) | Confirmed as a reproducibility gap; all three committed values independently reproduced at 80 digits |
| §4 item 1 (122-flow Kahan probe) | Gap confirmed; proposed probe refuted and replaced (FIN-02) |
| §4 items 2, 3, 4 | Confirmed by execution |
| BF-07r | **Refuted.** GeoJSON is FIPS-sorted; provenance note is correct |
| "108 files", `.dockerignore` `*.pem`/`*.key`, "≈ $2,086.66", "breakpoints 1600/1250/1000/780/600" (six, not five), "styles `:focus-visible` for buttons and links" (bare universal selector) | Minor errors in the prior review's own text |
| Domain 3 ledger "three-layer identity gating" | Not supportable end to end: layer 1 passes, Better Auth aborts before layer 2 (SEC-01) |
| Domain 4 ledger "app and DB constraints agree" | Agree on every field except the two known mismatches (mandate `reviewed`, audit `event` enum) |

## 6. Verified clean, with limits

- Annual operating screen: all ten metrics, labels and reference expectations reproduced by independent arithmetic and an 80-digit oracle; ~120 boundary cases found no incorrect result; money conversion rejects every malformed form tried. Limit: no workbook, rent roll, T12 or term sheet was reconciled; `reviewStatus` remains `engineering_reference_only`.
- Authorization: all 14 service entry points and 7 server actions gate on session; 32 path probes against the `/api/auth` allowlist all behave as intended; only 7 endpoints forward and none can create, link or update an account or email; forged payloads (duplicate fields, client `result`, forged `status`) are rejected or ignored; idempotency is actor- and payload-bound; row locks precede stale-token compares. Limit: no live callback, no database run this session.
- Persistence: all SQL parameterized; 27 app/DB constraint pairs enumerated, 25 agree and 2 are the known mismatches; migration 003's containment check is strictly stronger than what it replaced; snapshots preserve deal, evidence and mandate content after later edits.
- UI: every form control labelled; input preserved on failure; layered double-submit protection; idempotency key reused across retries; map lifecycle cleanup complete; keyboard alternative to the map is real; county/source-coverage confusion absent; light-only design genuine; Manrope self-hosted with `font-display: swap`.
- Ops: exact dependency pinning, lockfile consistent, 0 vulnerabilities; non-root three-stage image copying only runtime artifacts; CI references no secrets; IaC encodes every documented PostGIS, volume, region, port and healthcheck constraint; SIGTERM handled by Next after migrations complete.

## 7. Next sequence

1. Fix SEC-01 (drop `input: false` on the three fields) and add the intercepted-fetch callback test. Do this before configuring GitHub OAuth credentials.
2. Replace `logger: { disabled: true }` with a structured event logger that drops payloads (SEC-05), configure `advanced.ipAddress` for Railway's proxy (SEC-04), and add `preserve()` for the two OAuth keys (OPS-02).
3. Give the migration runner and fingerprint their own timeout (DB-02/OPS-01); print SQLSTATE, file name and redacted child stderr in the recovery scripts (OPS-03); add a `BEFORE TRUNCATE` statement trigger (DB-01); assert the migration set in readiness (DB-03).
4. Render asking price with `exactDollars()` (UI-01); label or localize timestamps (UI-07).
5. Decide backup encryption, retention and the isolated restore target (OPS-04, OPS-05), then run the measured production restore the roadmap requires.
6. Add the 10,000-flow NPV case and the Kahan-removal probe (FIN-02), the six free probes (FIN-07), re-anchor the scaling invariant (FIN-08), and a formatter test (FIN-06) before wiring any further finance primitive.
7. Fix the eleven documentation drift items in section 3, delete the three stale branches, and record the disposition session's work.
8. Run the UI-02 browser script at a real 390 px viewport before touching drawer focus code again.

## 7a. Disposition after review (same day)

The decision was to keep the GitHub allowlist gate rather than add email/password sign-in. Branch `fix/github-signin-callback` (off `main`) addresses SEC-01 and SEC-02 by removing `input: false` from the three identity fields in `lib/auth/factory.ts`, adds a distinct message when GitHub omits `two_factor_authentication` (SEC-03 diagnosability; GitHub's docs confirm `read:user` returns the field), adds `preserve()` for both OAuth keys in `.railway/railway.ts` (OPS-02 / BF-01), and adds three callback integration tests that drive the installed handler through `/sign-in/social` and `/callback/github` with GitHub's endpoints intercepted. Evidence: the two positive callback tests fail against the unfixed factory (6 pass, 2 fail) and pass with the fix (8 of 8); `scripts/db-test.mjs` 14 of 14 on PostgreSQL 16 loopback.

Later the same day email-and-password sign-in was chosen for the allowlisted users, keeping GitHub as an optional method. Branch `feat/email-password-signin` (on top of the fix) adds `ALLOWED_EMAILS` and `ACCOUNT_SETUP_OPEN`, a first-visit password page backed by a server action that calls Better Auth's own sign-up API, `db/004-email-identities.sql` (GitHub columns optional with an all-or-nothing shape constraint), `/sign-in/email` on the route allowlist with its own rate-limit rule, an anchored `/api/auth` prefix check (SEC-09), the hook lookups routed through the transaction-aware adapter, and per-page titles for the two sign-in pages (part of UI-05). Evidence: 8 policy unit cases, 12 integration cases (GitHub callback and email flows), 14 workspace database cases with migration 004 applied, lint and typecheck all pass locally. The remaining P2s (SEC-04, SEC-05, DB-01, DB-02/OPS-01, DB-03/OPS-09, OPS-03, OPS-04, OPS-05, UI-01, FIN-02) are unchanged.

## 8. Explicit omissions

No database suite was executed this session. No browser was driven, so BF-03/UI-02, the 390 px result grid, live CSP headers and the map worker's MIME type remain unobserved. No Railway plan or apply was run; deletion of undeclared variables is inferred, not observed. No live GitHub call was made; whether `read:user` returns `two_factor_authentication` is unverified. Vendor, licensing and legal claims in the planning documents were not verified against primary sources. The GeoJSON polygons were parsed for structure, ordering and bounds, not compared to an authoritative outline. A passing check suite, a green deployment and this report together do not constitute financial certification, production recoverability or completed OAuth.
