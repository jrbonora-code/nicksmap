> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. Dates, revisions, findings and verification claims below apply only to the recorded work; they do not establish current status or resolved findings.

# Independent Claude review — BlackFin

**Application revision reviewed: `88c047bc3cd78a4a47fc81ea9f383ce0e2ae5f3e`**

---

## 1. Review identity and scope

| Item | Value |
| --- | --- |
| Reviewer | Claude, model **Opus 5** (`claude-opus-5`), acting as an independent reviewer with no participation in implementation |
| Review date | 2026-09-12 |
| Pinned revision | `88c047bc3cd78a4a47fc81ea9f383ce0e2ae5f3e` (tracked tree only) |
| Supplemental material | `.review-context/HANDOFF.md`, `.review-context/source-manifest.json` (108 files, archive SHA-256 `5270d7e4…f459`) — read as context, not as code at the revision |
| Tools available | `Read`, `Glob`, `Grep` only |
| Changes made | **None.** No file was edited, no command executed, no network request issued, no infrastructure touched |

### What I actually did

Static reading and cross-referencing of source, SQL, tests, scripts, configuration and planning documents; hand-verification of every committed financial reference case; manual trace of authorization call paths, transaction boundaries and CSS layer/focus resolution.

### Verification limits — stated plainly

- **I executed nothing.** No test run, no build, no browser, no database, no HTTP request, no `npm audit`. Every claim below is either *static reasoning*, an explicitly labelled *hypothesis requiring execution*, or *supplied evidence* attributed to its original source.
- Prior CI runs, Railway deployments, the local `npm run check` record, the 1,605-schedule NPV oracle comparison, the local synthetic recovery exercise, the browser QA and the 18 sampled contrast pairs are **supplied evidence produced by earlier sessions**, not my executions. I preserve their stated scope and limits and do not extend them.
- I did **not** compute any file's SHA-256 (no execution). I cross-checked one hash between two in-snapshot documents: `public/fonts/README.md:8` records `d0639be4…8a40` for the Manrope binary, matching the manifest entry — consistent, but self-attested within the snapshot.
- Files I deliberately did **not** read in full are listed in §8.

### Domains inspected

All seven review domains. Representative file lists and per-domain conclusions are in §8.

---

## 2. Overall readiness

**BlackFin at this revision is a credible, unusually disciplined foundation for the stated purpose, and it is honest about what it is not.** It is the rare internal tool whose documentation *understates* rather than overstates its own assurance. I found **no P0 and no P1** — no established path to unauthorized access, data corruption, or a materially wrong financial conclusion on an implemented path.

### Supported today, for real private Florida deal data

- **Manual deal + dated evidence capture** with strict, non-coercing input validation. Unknown stays unknown: `dollarsToCents` (`lib/workspace/money.ts:5`) rejects `1e6`, `1,000.00`, `$10.00`, `1.001`, `-1`, `.5` and anything above `MAX_SAFE_INTEGER` cents; `form.money(name, true)` refuses to treat an empty field as zero (`lib/workspace/validation.ts:61`).
- **The annual operating screen.** This is the only finance function the running application calls. Its ten metrics, their labels and their formulas agree; I verified each by hand against the committed reference case and the end-to-end integration case.
- **Immutable decision history that actually holds.** Database triggers (`db/001-private-workspace.sql:105-107`) reject `UPDATE`/`DELETE` on snapshots, evidence and audit. `tests/workspace/database.test.ts:156-164` renames the deal and redrafts the mandate after a snapshot, then asserts the snapshot still shows the original name and `unconfigured` mandate. That is the property the product needs, and it is demonstrated against real PostgreSQL.
- **Concurrency that has been reasoned about, not assumed.** Row locks before stale-token comparison (`lib/workspace/service.ts:35,153-154`), a monotonic `updated_at` advance that guarantees a distinguishable version (`:157`), idempotency bound to actor + operation + payload hash (`:113-127`), and rollback of the idempotency reservation on conflict — verified by a `Promise.allSettled` concurrent-first-mandate test (`tests/workspace/database.test.ts:116-132`).
- **Authorization on every implemented path.** Every service entrypoint and every server action calls `requireWorkspaceSession()`; `tests/workspace/database.test.ts:32-36` enumerates all fourteen and asserts each rejects. Better Auth rejects an unsigned session token even when the token row is valid (`tests/integration/auth.test.ts:47`). The `/api/auth/*` route allowlist (`app/api/auth/[...all]/route.ts:3`) returns 404 for signup, linking and anything else.
- **Honest UI.** "Not applicable" for a null DSCR, "Unknown" for absent price, "Source coverage unverified" for counties with no research, a permanent `recovery: not_verified` badge, and an explicit footnote on every result grid stating the reserve/DSCR convention.

### Not suitable or unproven

| Area | Status |
| --- | --- |
| **Production sign-in** | Closed. OAuth credentials unconfigured; no authenticated production callback, unlisted-account denial, or owner recovery has been demonstrated. Known gate. |
| **Production recoverability** | Unproven. The local synthetic exercise validates the *procedure*; `scripts/db-restore-check.mjs:12` structurally forbids a non-loopback target, so **no tool in the repository can perform the production restore the roadmap requires** (see §5). |
| **Anything beyond an annual operating screen** | `analyzeCashFlows`, `sizeDebt`, `monthlyPayment`, `reconcileSourcesAndUses` exist and are well tested but are **wired to nothing** — confirmed by exhaustive grep. No IRR, waterfall, construction draw, lease-up or refinance model exists. |
| **Independent financial signoff** | Absent, and correctly declared: `tests/finance/reference-cases.json:4-5` records `"reviewStatus": "engineering_reference_only"` and `"independentFinancialReviewer": null`. |
| **Data sources, incentives, imports, AI** | None implemented. Candidate register only; no license reviewed for the intended use. |
| **Calibrated grading** | Not implemented, and the plan correctly refuses to invent it. |

**Bottom line:** you could put real deal records into this today and trust the arithmetic it shows you, the audit trail it keeps, and its refusal to guess. You cannot yet trust that you could get those records back after a production failure, and you cannot yet sign in from the internet. Those two gates, in that order, are what stand between this and daily use.

---

## 3. Prioritized findings

Severity is calibrated to *this* private two-user system and implemented paths. Missing production OAuth and missing production recovery are pre-existing release gates, not findings.

### BF-01 — P2 — IaC omits `preserve()` for the OAuth secrets; a future apply can delete them and lock the workspace

- **Evidence class:** static reasoning, corroborated by the repository's own documented IaC semantics.
- **File/lines:** `.railway/railway.ts:36-43` (the `web` service `env` map). Contrast `BETTER_AUTH_SECRET: preserve()` at `:42` and the eleven `preserve()` entries on the `postgres` service at `:12-23`.
- **Trigger:** The owner closes release gate 3 by setting `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as Railway runtime variables. Later, anyone runs `railway config apply` with this file.
- **Path to consequence:** `.railway/README.md:7` states "Omitted managed resources can be deleted." With those two keys absent from the declared env map, an apply can remove them → `readAuthConfig()` returns `null` at `lib/auth/policy.ts:19` → `isAuthConfigured()` false → `getWorkspaceSession()` returns `null` at `lib/auth/session.ts:11` → every private route redirects to `/sign-in` (`:19`), `/api/auth/*` returns 503 (`app/api/auth/[...all]/route.ts:8`), `/api/readiness` returns 503 (`app/api/readiness/route.ts:6`).
- **Practical impact:** Total workspace lockout at exactly the moment the workspace is first being opened. Fails closed — no data loss, no exposure — but recovery requires retrieving or re-issuing the GitHub client secret. `ALLOWED_GITHUB_IDS: "110749578"` is hard-coded at `:40`, so an apply would also revert a manually added second account.
- **Current mitigations:** Documented procedure at `docs/DEPLOYMENT.md:33` and in the handoff; `AGENTS.md` requires plan review before apply. **These are weaker than they look:** `.railway/README.md:19` records that the planner *already* omitted a real domain-port difference from its change set, so "the plan showed no deletion" is not evidence that no deletion will occur.
- **Minimum remedy:** Add `GITHUB_CLIENT_ID: preserve(), GITHUB_CLIENT_SECRET: preserve()` (and `DATABASE_SSL_CA: preserve()` if a custom CA is ever used) to the `web` env map **before** the first apply after OAuth configuration.
- **How to validate:** With the variables set in Railway, run `railway config plan` against the linked project/environment and confirm the change list contains no variable removals; after apply, confirm `/api/readiness` returns 200 and `/sign-in` renders the "Continue with GitHub" button rather than the "being configured" notice (`app/sign-in/page.tsx:19`).

### BF-02 — P2 — Migration, backup and restore tooling fails opaquely, which makes the production recovery gate hard to close

- **Evidence class:** static.
- **Files/lines:**
  - `scripts/db-migrate.mjs:34-36` — a bare `catch {}` prints one generic sentence. The failing migration's **file name**, the SQLSTATE, and the constraint are all discarded.
  - `scripts/db-recovery-support.mjs:14` — `child.stderr.resume()` silently drains all `pg_dump` / `pg_restore` stderr; `:17-18` reject with fixed strings.
  - `scripts/db-restore-check.mjs:30` and `scripts/db-backup.mjs:22` — same pattern.
- **Trigger:** Any migration failure during a Railway deploy, or any failure during the measured production backup/restore exercise required by `docs/ROADMAP.md:31`.
- **Path to consequence:** `scripts/start.mjs:6-7` exits non-zero on migration failure (correct — Railway keeps the previous release), but the operator's only signal is *"Database migration failed. Check database connectivity, permissions and migration consistency."* There is no way to distinguish a permissions problem from a checksum mismatch from a constraint violation in migration 004.
- **Practical impact:** Recovery tooling that cannot explain its own failures is a poor instrument for measuring RPO/RTO. This is the gate standing between the tool and real deal data.
- **Current mitigations:** The privacy intent is correct and stated in-line; `stdio: "inherit"` in `start.mjs` at least surfaces the generic line in Railway logs; `db-restore-check.mjs:11-21` validates the target thoroughly *before* acting (loopback only, `radar_test_*`/`radar_restore_*` name, must differ from `DATABASE_URL`, must have zero public tables), so an opaque failure is at least a safe failure.
- **Minimum remedy:** Print non-sensitive identifiers only — the migration file name, `error.code` (SQLSTATE), `error.constraint`, `error.table`; for child processes, the exit code and a stderr tail with any line containing the connection string or password redacted. Keep suppressing `error.message`, `detail` and `where`.
- **How to validate:** Apply a deliberately broken `004-*.sql` to a scratch `radar_test_*` database and confirm the output names the file and the SQLSTATE; run `db-restore-check.mjs` three times — against a nonempty target, against a corrupted archive, and with a missing `pg_restore` binary — and confirm three distinguishable, credential-free messages.

### BF-03 — P3 — Mobile drawer: initial focus lands, but almost certainly leaves no visible indicator

- **Evidence class:** **hypothesis requiring execution.** The handoff and `docs/reviews/2026-09-12-blackfin-design-review.md:27` record that automatic initial focus was *not confirmed* and that an animation-frame experiment did not change the observation. I did not reproduce it. The brief asks me not to assume a prior root cause, so here is an independent one.
- **Files/lines:** `components/workspace/sidebar.tsx:24-28` (the focus effect), `:52` (the close button), `app/globals.css:24` (`:focus-visible` outline), `:25` (plain `:focus` outline — **form controls only**), `:41` (`.skip-link:focus`), `:370` (the `max-width: 780px` drawer rules).
- **What I can rule out statically:**
  - The close button **is** displayed at ≤780px. `@layer responsive` (declared last at `globals.css:1`) beats `@layer components`, so `.mobile-close { display: inline-flex }` at `:370` overrides `.mobile-close.icon-button { display: none }` at `:80` regardless of specificity — this is exactly what the in-file comment at `:78-79` describes, and it is the fix recorded in the design review.
  - The ancestor is visible when open: `.sidebar-open { visibility: visible }` at `:370` follows `.sidebar { visibility: hidden }` in the same layer with equal specificity.
  - `inert={menuOpen}` at `sidebar.tsx:58` applies to `.workspace-body`, not the sidebar.
  - The transition is on `transform` only; `visibility` flips instantly, so the element is focusable on the same commit.
- **My hypothesis:** focus *is* moving correctly, and what was unobservable was the **focus ring**. `app/globals.css` styles `:focus-visible` for buttons and links but has **no plain `:focus` rule for them** (only inputs at `:25` and the skip link at `:41`). Per the `:focus-visible` heuristic, a programmatic focus move inherits focus-visibility from the previously focused element: opening the drawer by **keyboard** (Enter on the menu button) produces a ring; opening it by **click or tap** — the normal path for a browser-automation session — produces focus with **no ring at all**.
- **Practical impact:** If the hypothesis holds, this is a WCAG 2.4.7 (Focus Visible) gap on a modal dialog, not a focus-management bug. For a small private sighted tool it is minor, but it is a real defect and it explains an observation that has now consumed two sessions.
- **Exact reproduction that distinguishes the two branches** (run in a 390×844 viewport on `/overview`):
  1. `document.querySelector('.mobile-menu').click()`; then after two `requestAnimationFrame` ticks evaluate:
     `document.activeElement === document.querySelector('.mobile-close')` and `document.activeElement.matches(':focus-visible')`.
  2. Repeat, but open the drawer with `Tab` to the menu button + `Enter` instead of `.click()`.
  - **`true` / `false` in (1) and `true` / `true` in (2)** ⇒ focus management is correct; the defect is the missing indicator. Remedy: add `button:focus, a:focus { outline: 3px solid #4185c7; outline-offset: 3px; }` scoped to the drawer, or give `.sidebar[role="dialog"]` a `tabIndex={-1}` and focus the container with an always-visible focus style.
  - **`false` in (1)** ⇒ genuine focus failure. Then also log `getComputedStyle(closeBtn).display`, `getComputedStyle(sidebar).visibility` and `closeBtn.closest('[inert]')` at the moment of the effect, and remedy by mounting the drawer contents conditionally rather than toggling ancestor `visibility`.

### BF-04 — P3 — A reachable screening error has no field to attach to

- **Evidence class:** static.
- **Files/lines:** `lib/finance/screening.ts:31` issues `RENT_LOSS_EXCEEDS_POTENTIAL` at path `rentLossesCents`; `lib/workspace/service.ts:105` and `lib/workspace/snapshot.ts:20` map it with `.replace(/Cents$/, "")` → `rentLosses`; no form input has that name (`components/workspace/screening-form.tsx:37`).
- **Trigger:** Enter vacancy + concessions + credit loss greater than gross potential rent — an ordinary data-entry mistake — and press *Calculate preview*.
- **Path to consequence:** `ActionStatus` (`components/workspace/forms.tsx:48`) *does* render the message text, so the user is told what is wrong. But the anchor `<a href="#rentLosses">` resolves to nothing, none of the three contributing inputs receives `aria-invalid`, and no inline error appears beside them.
- **Impact:** Minor for a sighted user, meaningfully worse for keyboard/screen-reader use. Note this is the **only** realistically reachable error of this kind — I traced every other error path in `calculateOperatingMetrics` and each either maps to a real field (`purchasePrice`, `totalCost`, `annualDebtService`, `unitCount`) or is unreachable because `parseScreeningPreviewForm` hard-codes `currency`/`period` and builds `inputs` from a fixed key list.
- **Minimum remedy:** Map `rentLossesCents` to the three contributing field names (or introduce a `rentLosses` group container with that `id` and `role="group"`), so the anchor resolves and the inputs are marked invalid.
- **How to validate:** Submit the preview with GPR 100000, vacancy 60000, concessions 30000, credit loss 20000 and assert that the anchor target exists and that the three inputs carry `aria-invalid="true"`.

### BF-05 — P3 — `Inspection.sum` throws instead of returning a structured issue, contradicting the declared contract

- **Evidence class:** static; **currently unreachable**.
- **File/lines:** `lib/finance/validation.ts:94` — `values.reduce((sum, value) => sum + BigInt(value), 0n)`. `BigInt(1.5)` throws `RangeError`.
- **Why it is safe today:** I traced every call site. `lib/finance/screening.ts:28` and `:34` guard with `if (check.failed) return check.blocked()` before the first `sum` at `:30`; `lib/finance/cash-flows.ts:34` guards before `:38`; `lib/finance/reconciliation.ts:21` guards before `:22`. Every chained sum consumes a prior `sum` result, which is always an integer.
- **Why it matters:** `docs/CALCULATION-VALIDATION.md:55` promises "Ordinary malformed JSON-compatible inputs return structured issues rather than throwing." That promise depends entirely on call-site discipline that nothing enforces and no fault probe tests. A future primitive that forgets one guard turns a validation error into an unhandled exception inside a server action.
- **Minimum remedy:** Make `sum` defensive — `if (!Number.isSafeInteger(value)) { this.issue("INVALID_NUMBER", path, …); return 0; }` — and add a fault probe that removes one `check.failed` guard and asserts the suite still fails with an assertion rather than a crash.

### BF-06 — P3 — The smoke test's forged-cookie assertion cannot establish what it appears to

- **Evidence class:** static.
- **File/lines:** `scripts/smoke.mjs:16` starts the server with `DATABASE_URL: ""`, `BETTER_AUTH_SECRET: ""` etc.; `:47-49` then sends `Cookie: radar.session_token=forged` and asserts a redirect.
- **Why it is vacuous:** with empty auth env, `isAuthConfigured()` is false and `lib/auth/session.ts:11` returns `null` **before the cookie is ever examined**. The assertion proves the closed-configuration path redirects; it proves nothing about signature verification.
- **Real coverage exists elsewhere:** `tests/integration/auth.test.ts:46-47` sends both a tampered signed cookie and a *valid database token without its signature* against a real Better Auth instance and asserts `null` for both. That is the genuine test.
- **Impact:** No security gap — only a risk that the smoke assertion is cited as forged-session evidence when it is not.
- **Minimum remedy:** Rename the assertion to reflect what it tests (closed-configuration denial) and reference the integration test for forgery coverage.

### BF-07 — P3 — Consolidated polish, discrepancy and coverage items

All static; all low impact. Grouped to avoid padding the list above.

| ID | File:line | Observation | Minimum remedy |
| --- | --- | --- | --- |
| BF-07a | `docs/METHODOLOGY.md:20` | Says the implementation is `screening-0.1.0`; `lib/finance/validation.ts:1` is `screening-0.2.0` (CALCULATION-VALIDATION is correct). | Update the reference. |
| BF-07b | `lib/workspace/types.ts:29`, `app/(workspace)/settings/page.tsx:16`, `overview/page.tsx:23` | UI renders a "Reviewed" mandate badge, but `db/001-private-workspace.sql:52` allows only `'unconfigured'\|'draft'` and `saveMandate` always writes `'draft'`. An unreachable state implies a review workflow that does not exist. | Remove the state or add the migration + workflow. |
| BF-07c | `lib/workspace/service.ts:214` | A qualitative research decision writes audit event `screening.saved` — forced by the CHECK at `db/001-private-workspace.sql:84`. Partly mitigated by `financialCalculation:"not_calculated"` in the detail payload. | Add `research.decision` to the CHECK in a forward migration. |
| BF-07d | `components/workspace/ui.tsx:25-29` | `dateLabel` formats all timestamps in UTC with no timezone shown. A decision recorded at 9 pm EDT displays the following calendar day. | Label as UTC, or format in the viewer's timezone. |
| BF-07e | `components/workspace/county-map.tsx:62-64` | Any MapLibre `error` event permanently sets `unavailable`; there is no retry and no distinction between fatal and transient. Low risk — the style has only a background layer, no tiles or sprites. | Distinguish fatal initialization errors from post-`idle` errors; offer a retry. |
| BF-07f | `tests/integration/auth.test.ts:6` | Imports `better-call` directly; it is a transitive dependency of `better-auth` (lockfile 1.4.0), not declared in `package.json`. Breaks silently if better-auth's tree changes. | Declare it as a devDependency. |
| BF-07g | `scripts/db-backup.mjs:13-16` | `fingerprint()` runs *after* `pg_dump`, not from the same snapshot. Correctness depends on a manual write pause that nothing enforces. Errs toward false failure, not false pass. | Export a `REPEATABLE READ` snapshot and pass it to `pg_dump --snapshot=`. |
| BF-07h | `.github/workflows/ci.yml:17` vs `.railway/railway.ts:8` vs `db/README.md:3` | CI uses PostgreSQL 17, production PostGIS 18, local tests 16. No environment exercises the production major version. Low risk — the schema uses only portable SQL. | Pin the CI service to 18. |
| BF-07i | `Dockerfile:1,6,13` | `node:24-bookworm-slim` is a floating tag; rebuilds are not byte-reproducible. | Pin by digest. |
| BF-07j | `app/api/readiness/route.ts:8-9` | Probes `workspace_mandate` and `auth_user` but not `workspace_migrations`; can report ready with a partially applied schema. | Assert the expected migration set. |
| BF-07k | `lib/finance/validation.ts:71-82` vs `lib/workspace/validation.ts:41` | The finance date validator accepts `0000-01-01`; the workspace validator explicitly rejects `0000-`. Each is internally defensible; the inconsistency is a trap for a future shared validator. | Align, or document the deliberate difference. |
| BF-07l | `lib/auth/factory.ts:79` | `logger: { disabled: true }` suppresses all Better Auth logging, including failed sign-ins. `workspace_audit` covers mutations only, so there is no record of authentication failures. | Log failure *events* (timestamp, route, outcome) without provider payloads. |
| BF-07m | `db/001-private-workspace.sql:90-98`; `db/002-auth.sql` | No retention or cleanup for `workspace_requests`, `auth_session`, `auth_verification`, `auth_rate_limit`. Negligible at this scale; unbounded in principle. | Add a periodic delete for expired rows. |
| BF-07n | `scripts/db-recovery-support.mjs:8-9` | `PGUSER`/`PGPASSWORD` are set to empty strings when the URL omits them; libpq treats set-but-empty as a value rather than falling back to the OS user. | Omit the keys when empty. |
| BF-07o | `scripts/db-test.mjs:20` | Every run retains a `radar_test_workspace_*` database. Deliberate for inspection; accumulates locally. | Add an opt-in cleanup flag. |
| BF-07p | `components/workspace/forms.tsx:44,56,83` | `Field` renders a hint with `id={name}-hint` that no `aria-describedby` ever references. | Include the hint id in `aria-describedby`. |
| BF-07q | `components/workspace/deal-detail.tsx:25,35` | Tabs use `aria-current="page"` on buttons instead of tab/tabpanel roles (operable, off-spec); `LockNote()` at `:35` is a misleadingly named helper returning a `FileText` icon. | Cosmetic. |
| BF-07r | `public/data/florida-counties.source.json:13` | Says the output is "sorted by FIPS"; `lib/workspace/counties.ts` is sorted by **name** (St. Johns/St. Lucie follow Seminole). The committed test sorts both sides, so ordering is unasserted. I did not verify the GeoJSON's own order. | Correct the provenance note. |

### Operational pre-flight, not a defect — MFA field dependency

`lib/auth/factory.ts:26-30` requires `profile.two_factor_authentication === true` and throws `FORBIDDEN` if the field is absent or falsy. This is correct fail-closed design, but it is a single point of failure with **no break-glass path**: if GitHub omits the field for the configured scopes, the owner cannot sign in and has no alternative route. `docs/adr/0001-private-workspace.md:10-11` records that the owner's 2FA setting was read from GitHub's authenticated user API on 2026-09-12, which is good corroborating evidence that the field is returned. **Add one explicit pre-flight step to gate 3:** before wiring credentials, confirm the callback's received profile contains `two_factor_authentication: true` (a single log line at the hook, removed afterward), so a failed first sign-in is diagnosable rather than mysterious.

---

## 4. Financial assurance assessment

### Formula ↔ UI consistency: verified, no discrepancy found

I hand-computed every metric and compared each against its rendered label.

| Metric | Implementation | Label shown | Agrees |
| --- | --- | --- | --- |
| EGI | `GPR − (vac+conc+credit) + other` (`screening.ts:30,36`) | "Effective gross income" | ✓ |
| NOI | `EGI − opex` (`:37`) | "Net operating income" | ✓ |
| CF after reserves | `NOI − reserves` (`:38`) | "Cash flow after reserves" | ✓ |
| CF after debt | `− annual debt service` (`:39`) | "After reserves and debt service" | ✓ |
| DSCR | `CFaR / ADS` (`:46`) | **"DSCR · after reserves"** | ✓ |
| Debt yield | `NOI / loan balance` (`:47`) | **"Debt yield · NOI"** | ✓ |
| Entry cap | `NOI / purchase price` (`:48`) | "Entry cap rate" | ✓ |
| Yield on cost | `NOI / total cost` (`:49`) | "Yield on total cost" | ✓ |
| LTC | `loan / total cost` (`:50`) | "Loan to cost" | ✓ |
| Price per unit | `price / unitCount` (`:51`) | "Purchase price per unit" | ✓ |

`components/workspace/screening-results.tsx:26` closes the grid with *"Reserves are below NOI; DSCR uses cash flow after reserves. These calculations do not establish lender eligibility or investment suitability."* For a lending-literate reader, that single sentence is worth more than the metrics themselves — it makes the convention falsifiable rather than assumed.

Null handling is correct and non-fabricating: `dscrAfterReserves` and `debtYieldOnNoi` are `null` (not `Infinity`, not `0`) when their denominators are zero, and `ratio()` renders "Not applicable."

### Independence of reference expectations — I verified each one by hand

`tests/finance/reference-cases.json` claims its expectations are fixed independently of the implementation. I checked that claim rather than accepting it:

- **Operating case** — `360,000 − 27,000 + 12,000 = 345,000` EGI; `−145,000 = 200,000` NOI; DSCR `190,000/125,000 = 1.52`; debt yield `0.10`; cap `0.05`; YoC `0.04`; LTC `0.40`; price/unit `200,000`. All confirmed. **Critically, price (4 M) ≠ cost (5 M) ≠ value**, and the four ratios have well-separated magnitudes — so a cap-rate/YoC denominator swap, an LTC-base swap, a price-per-unit base swap or a debt-yield numerator swap would each be caught by the existing `deepEqual` at `screening.test.ts:11`. That is careful fixture design, not luck.
- **PMT** — `10,000 @ 8%/12 × 10` → `$1,037.0327`. Matches Microsoft's published `−$1,037.03` and the fixture's `103,703 ± 0.5` cents. The tolerance is tight, not slack.
- **XNPV** — I recomputed all five discounted terms (including the 2008 leap-year 60-day first interval) and reached ≈ `$2,086.66`, matching the published `$2,086.65` within my manual precision.
- **All three 100-digit Decimal cases** — recomputed independently:
  - `large-irregular-dates` → ≈ 2.4082 e10 vs stated 24,081,802,110.92 ✓
  - `large-negative-rate-thirty-years` → exactly 30.0 Actual/365 years; `3e9 × (1/0.9)^30 − 5e10` ≈ 2.0770 e10 vs stated 20,769,474,627.78 ✓
  - `large-leap-day` → 366/365 years at 21%; ≈ −5.22 e7 vs stated −52,211,121.31 ✓
- **Debt sizing** — LTV 7.5 M, LTC 8.4 M, DSCR `800,000/(1.25×0.08)` = 8 M, debt yield `900,000/0.10` = 9 M, min = LTV. Confirmed.

**Limit:** the Python Decimal oracle script that generated the three decimal cases is **not in the repository**. My hand-verification corroborates the values but cannot certify the generator's independence or reproduce it. The `decimalProvenance` field describes it; a future session should commit the generator (it contains no secrets) so the claim is checkable rather than asserted.

### The NPV precision envelope — I reproduced the boundary arithmetic

`NPV_ROUNDOFF_RESERVE = 64 × Number.EPSILON = 1.4210854715202004e−14`, accumulated as `Σ |PV| × (2 + |x| + t·|r|/(1+r))` and compared against 0.01 cents (`cash-flows.ts:65-74`).

- **Supported boundary** (`−$1.35 B` / `+$2.70 B` at 100%, one year): opening term `1.421e−14 × 1.35e11 × 2 = 3.837e−3`; receipt term `× (2 + ln2 + 0.5) = 6.126e−3`; **total ≈ 9.963e−3 ≤ 0.01** ✓ accepted.
- **Unsupported boundary** (`−$1.36 B`): **total ≈ 1.0037e−2 > 0.01** ✓ blocked.

The declared boundary is real and reproducible, and the accept/reject margin is **0.4 %** — it sits precisely where the fixture says it does.

**What this means in practice, which no document currently states:** to trip the envelope at a typical factor of ≈ 3, the sum of absolute discounted flows must exceed roughly **2.3 e11 cents ≈ $2.3 billion**. A realistic Florida multifamily schedule — say a 10-year monthly pro forma at ~$50 k/month with a $30 M reversion — accumulates a reserve of order **1e−4 cents**, roughly four orders of magnitude inside the envelope. **The envelope is not a practical constraint at your deal scale.** The supplied evidence that 659 of 1,605 sampled schedules were conservatively blocked reflects an adversarial sample, not ordinary use — but that sample's composition is not recorded, so I cannot confirm it. That is worth documenting before anyone reads "41 % blocked" as a usability finding.

### Meaningful test coverage

**Genuinely discriminating, not restatements of the implementation:**

- `screening.test.ts:92-103` — an **independent period-by-period amortization reconstruction** (150 seeded cases, 12–360 months, 0–20 %) that must reconcile to 0.01 cents. This is a real second derivation, not the closed form re-run.
- `screening.test.ts:81-83` — payment at `annualRate = 1e−15`. A naïve `1 − Math.pow(1+r, −n)` formulation would produce `1 − 1 = 0` and divide by zero; the committed `−expm1(−n·log1p(r))` formulation returns 100,000 ± 1e−7. This test genuinely distinguishes the two.
- `screening.test.ts:120` — `value 100, maxLtv 0.29`. In binary64, `100 × 0.29 = 28.999999999999996`; `Math.floor` gives 28, the exact-fraction `floorRatio` gives 29. The test pins the correct answer and fault #6 pins the wrong one.
- `cash-flows.test.ts:168-182` — offsetting `±20,000` at `9999-12-31`: net zero is skipped for discounting while **gross** contributions (30,000) and distributions (20,010) are preserved and the sign pattern stays conventional. This is exactly the gross-vs-net distinction the equity multiple depends on.
- `cash-flows.test.ts:184-199` — a zero opening flow still fixes the valuation date.
- `database.test.ts:91-104` — the submitted form includes a **forged** `result:'{"noiCents":999999999}'` field; the stored snapshot contains `7,400,000`. The server recomputes and ignores client-supplied results. I verified 7,400,000 by hand.

**The fault-injection harness is well constructed:** it requires an unmodified baseline pass first (`test-financial-guards.mjs:36`), asserts each anchor occurs exactly once (`:40`), demands an actual `ERR_ASSERTION` rather than any failure (`:44`), restores the file in a `finally`, and refuses to clean outside its scratch directory (`:53-55`). The twelve faults are realistic industry mistakes — reserves omitted from cash flow, DSCR on NOI instead of after-reserve cash flow, annual rate treated as monthly, largest cap chosen instead of smallest, 360-day convention substituted, envelope bypassed, zero flows discounted.

### Gaps and a reproducible counterexample proposal

1. **No long-schedule NPV case exists.** Every committed cash-flow case has 2–5 flows. The compensated (Kahan) summation at `cash-flows.ts:67-70` is therefore **never meaningfully exercised**, and removing it is not among the twelve probes. The realistically relevant shape — a monthly pro forma — is untested. Proposed case:

   ```js
   const flows = [{ id: "equity", date: "2026-01-01", amountCents: -1_200_000_000 }];
   for (let m = 1; m <= 120; m++) {
     const d = new Date(Date.UTC(2026, m, 1)).toISOString().slice(0, 10);
     flows.push({ id: `cf-${m}`, date: d, amountCents: 1_800_000 });
   }
   flows.push({ id: "sale", date: "2036-01-01", amountCents: 4_500_000_000 });
   analyzeCashFlows({ currency: "USD", annualDiscountRate: 0.085, cashFlows: flows });
   ```
   Compare against a 100-digit Decimal evaluation of `Σ amount/(1+r)^(days/365)`. **Expected:** `ok: true`, no `NPV_PRECISION_UNSUPPORTED`, agreement within 0.01 cents. Then add the fault `const adjusted = term - compensation;` → `const adjusted = term;` and confirm it is detected.

2. **Cheap, high-value probes that the fixture would already catch** — add them to the guard list so the protection is asserted rather than incidental: `entryCapRate` denominator → `totalCostCents`; `debtYieldOnNoi` numerator → `cashFlowAfterReservesCents`; `loanToCost` denominator → `purchasePriceCents`; `sizeDebt` dscr divisor `[dscr, constant]` → `[dscr]`.

3. **`cash-flows.test.ts:238-243`** — the scaling invariant runs on `simple`, whose NPV is mathematically **zero**. Scaling zero by 1–100 asserts almost nothing. Re-anchor it on the XNPV reference case.

4. **No UI-layer numeric coverage.** `components/workspace/screening-results.tsx:12-13` (`dollar`, `ratio`) and `components/workspace/ui.tsx:11-24` (`centsInput`, `exactDollars`, `money`) are untested. `exactDollars` calls `BigInt(cents)`, which **throws on a non-integer** — it is guarded by `Number.isSafeInteger` at the one call site (`screening-results.tsx:12`), but nothing pins that guard.

### What this assurance does and does not establish

**Establishes:** the annual operating screen is arithmetically correct under a clearly declared convention, its inputs cannot be silently coerced or defaulted, its outputs are recomputed server-side and frozen immutably, and its labels match its formulas.

**Does not establish:** that the convention is the right one for any particular lender or transaction; that the unreachable primitives are fit for underwriting; that any number here has been checked against a real workbook, rent roll, T12 or loan term sheet. `docs/CALCULATION-VALIDATION.md:85` says this itself: *"Neither passing tests nor a deployment healthcheck constitutes external underwriting signoff."* I agree, and I would add: the declared precision envelope covers NPV only. Payment, per-unit and ratio outputs carry **no** cent-accuracy guarantee — `CALCULATION-VALIDATION.md:43` records ≈ 1.2634 cents of payment error near the maximum permitted principal. Before any payment figure is used for a schedule or a settlement, its principal/rate/term envelope and rounding policy need their own definition.

---

## 5. Plan gaps and decision dependencies

Distinct from defects. Milestone placement per `docs/ROADMAP.md`.

### Gaps requiring resolution

| ID | Gap | Milestone where it must be resolved |
| --- | --- | --- |
| **G-01** | **No tool exists to perform the production restore the plan requires.** `scripts/db-restore-check.mjs:12` hard-refuses any non-loopback target and any database not named `radar_test_*`/`radar_restore_*`. This is correct safety design, but it means `ROADMAP.md:31` ("Measured production backup and restore… Record owner, retention, RPO and RTO") has **no implementation path**. The gate cannot be closed with current tooling. | Phase 1, before sensitive data. Needs a separate, explicitly authorized procedure — restore a production dump into an isolated non-production target and fingerprint-compare — plus a decision on where encrypted archives live. |
| **G-02** | **Backups are unencrypted and unrotated.** `scripts/db-backup.mjs` writes plaintext `.dump` files to `.local/backups` with no retention policy and no offsite copy. `db/README.md:19` discloses this honestly ("private and unencrypted by this script; protect its storage separately") but the protection is entirely manual. | Phase 1, same gate as G-01. Encryption at rest and a retention rule are owner decisions, not defaults an agent should pick. |
| **G-03** | **Rollback is one-way.** `docs/DEPLOYMENT.md:39` correctly warns that migration 003 expands a result constraint and "a previous image may not understand that new result shape." Confirmed: a pre-003 build reading a research decision would fall through `screening-results.tsx:18` to "No usable calculation result." Confusing, not corrupting. | Before the next schema-affecting migration: write down which app revisions are compatible with which migration numbers. |
| **G-04** | **Rate limiting is configured but never exercised.** `lib/auth/factory.ts:59` sets database-backed limits; `db/002-auth.sql:11` creates the table; no test covers it. Better Auth's IP detection also depends on `x-forwarded-for`, which a client can influence — irrelevant for escalation given the allowlist, relevant for limit evasion. | Phase 1, alongside OAuth completion. |
| **G-05** | **`auth_account` has no unique constraint on `(providerId, accountId)`** (`db/002-auth.sql:7`), matching Better Auth's default schema. Duplicate account rows are possible at the database level. Low risk with linking disabled and a two-ID allowlist. | Opportunistic, with the next auth migration. |
| **G-06** | **The Decimal oracle generator is not committed** (see §4). The strongest NPV evidence is not reproducible from the repository. | Before any expansion of financial decision claims (`ROADMAP.md:18`). |
| **G-07** | **`docs/DECISIONS.md` D01–D05 remain open** — buy box, capital/authority limits, return and downside policy, permissioned reference workbooks, and the buy/integrate/build comparison. Every one is an **investment decision only the workspace's decision-makers can make** (see §7). | Phase 1 exit. |

### Where the plan already handles a risk correctly — worth saying explicitly

The planning documents anticipate most of what I would otherwise have raised as domain-7 findings:

- **Survivorship and selection bias.** `docs/METHODOLOGY.md:42` requires "successes, ordinary outcomes and failures" with sample size, observation dates, dispersion and missing outcomes; `docs/EVALUATION.md:29` requires frozen policy at the historical decision date, vintage and sponsor/property splits to limit leakage, and explicitly forbids fitting and evaluating on the same examples. `EVALUATION.md:33` refuses to show calibrated probabilities until prediction intervals have measured empirical coverage. This is a better-specified evaluation design than most production ranking systems have.
- **Weights are not invented.** `AGENTS.md:17` and `METHODOLOGY.md:9` both state the ideation percentage weights are illustrative and not implemented. They are not implemented. I checked.
- **Incentives are correctly decomposed.** `SOURCES-AND-REUSE.md:48` keeps designations, eligible nomination tracts, nominations and certifications separate; `DECISIONS.md` D10 requires rule owners, versions and administrator confirmation before an unapproved benefit enters committed underwriting; `PRODUCT.md:43` states an incentive polygon intersection is a potential match, not approval.
- **County map vs source coverage is not conflated.** This is the exact confusion the brief asks about, and it is handled in four places: `counties-explorer.tsx:17` shows "Deal counts do not establish data coverage" and a per-county "Source coverage unverified" status; `listCountyCoverage` (`service.ts:70`) derives status from deal count only and returns `checkedAt: null`; the footnote states "County boundaries are not parcel boundaries or incentive eligibility determinations"; `ROADMAP.md:39` says "Manual entries do not certify county-source coverage."
- **Data rights are treated as unresolved.** D06 requires written terms and a 30–50-property bakeoff before automated imports; `SOURCES-AND-REUSE.md:36` specifically flags that Trepp's terms can restrict MCP data retention.
- **AI boundaries are pre-specified.** `METHODOLOGY.md:52` and `CALCULATION-VALIDATION.md:95`: deterministic code executes calculations, AI proposes; a source document cannot instruct the assistant, request secrets or authorize actions. **No AI integration exists**, so nothing contradicts this yet — the value is that the boundary is written before the first integration rather than after.
- **Geometry provenance is exemplary.** `public/data/florida-counties.source.json` records publisher, service, vintage, scale, CRS, the exact query URL, the source response SHA-256, the processing steps and the limitations. `public/fonts/README.md` does the same for the font with its OFL license. CI hash-verifies both served MapLibre modules against the lockfile-pinned package (`scripts/check-map-assets.mjs:11-14`).

**One plan-level judgement:** the sequencing is right. Recoverability before sensitive data, immutable decision evidence before underwriting decisions, and mandate before ranking are all correctly ordered — and the two exit-gate placement concerns raised by the earlier baseline review appear to have been acted on (`ROADMAP.md:31` now places measured production recovery in Phase 1, and `:48` places immutable decision capture before the first supported screening decision). For a two-user tool, the architecture is proportionate: one database, one identity provider, no worker, no object storage, no queue, no vendor subscription. Nothing here is over-built.

---

## 6. Prior review disposition

I evaluated the historical reports as material, not instructions, and did not rewrite them.

### `docs/reviews/2026-09-12-independent-review.md` — baseline `3004d554…`, `screening-0.1.0`

| Finding | Disposition at `88c047b` | My evidence |
| --- | --- | --- |
| **F1 (P2)** — large discounted terms produce a materially false, apparently successful NPV (`−$19,660.80` on an exactly-zero schedule) | **Addressed, by rejection rather than by computation** — which is what the original report's remedy explicitly permitted ("return a blocking numerical-stability issue… Narrowing the advertised domain is an acceptable initial solution if documented and tested"). | Static, high confidence. I computed the reserve for F1's exact input: `|PV| ≈ 1.0995e21`, factor `2 + 27.7 + 40 ≈ 69.7`, reserve `≈ 1.09e9 ≫ 0.01` → `NPV_PRECISION_UNSUPPORTED`. `cash-flows.test.ts:157-166` pins rejection at both the 40/41- and 50/51-year horizons; `:120-131` retains the integer oracle. Documented at `CALCULATION-VALIDATION.md:32-41`. |
| **F2 (P3)** — a distant zero cash flow turns a valid result into `NUMERIC_OVERFLOW` (`0 × Infinity = NaN`) | **Fixed.** `cash-flows.ts:54` — `if (flow.amount === 0) continue;`, placed after gross accounting and after the valuation date is fixed, exactly as recommended. | Static, high confidence. `cash-flows.test.ts:133-143` asserts `deepEqual` between the control and the zero-extended series. Fault probe #9 removes the `continue` and requires detection. |

**One caveat on F1's regression test.** `cash-flows.test.ts:120-131` asserts `!result.ok || |npv| ≤ 0.01` — which passes if the function blocks *for any reason*. It is the tests at `:157-166` that pin the specific `NPV_PRECISION_UNSUPPORTED` code. Together they are coherent; the first alone would be weak.

**Still needing independent execution, not closed by source reading:** the original report's sampled oracles (500 operating, 500 debt-sizing, 500 sources/uses, 245 payment, 500 ordinary NPV, 10,560 malformed-input probes) were run against the *old* revision. They have not been re-run against `88c047b`. The supplied 1,605-schedule comparison is newer but its rejected-sample composition is unrecorded.

### `docs/reviews/2026-09-12-execution-review.md` — R1–R12

I read this report's structure and resolutions rather than its full 33 KB. I independently confirmed the code state for the items I could check statically:

| Item | Code state at `88c047b` |
| --- | --- |
| R2 — stale deal overwrite | Present and correct: `service.ts:153-157`, lock + token compare + monotonic advance. Tested at `database.test.ts:63-72`. |
| R3 — declining required inventing financials | Present: `saveResearchDecision` (`service.ts:203`), `prepareResearchDecision` (`snapshot.ts:31`), migration `003` widens the result constraint properly using `@> '{"ok":true}'` containment rather than a text comparison. Tested at `database.test.ts:76-90`. |
| R4 — displaying an editable amount could change a cent | `centsInput` (`ui.tsx:11-15`) uses BigInt, never float division. |
| R5 — mandate stale overwrite | `parseMandateForm` (`validation.ts:159-170`) + `FOR UPDATE` (`service.ts:195`). Concurrency tested at `database.test.ts:116-155`. |
| R6 — timezone/collation-dependent fingerprints | `db-recovery-support.mjs:30-34`: `SET TIME ZONE 'UTC'` on the same checked-out connection, `COLLATE "C"` for both table and row ordering. Tested with an explicit control assertion at `database.test.ts:176-193`. |
| R7 — container smoke skipped migrations | `ci.yml:50-65` now boots the built image against real PostgreSQL with `DATABASE_URL` set. |
| R8/R9 — map canvas height and ESM worker packaging | `globals.css:4` keeps the unlayered sizing rule ahead of MapLibre's vendor rule; `copy-maplibre-worker.mjs` + `check-map-assets.mjs` + `ci.yml:65`. |
| R12 — domain targeted the wrong port | `.railway/railway.ts:34,37` now pins 8080 in both the domain and `PORT`. |

### `docs/reviews/2026-09-12-blackfin-design-review.md` — self-review by the implementing agent

Correctly labelled as a self-review at line 3. The layer-precedence regression it describes is visibly fixed in `globals.css:78-80` with an explanatory comment. **The one item it leaves open — automatic initial focus in the mobile drawer — remains open.** I have not reproduced it either; BF-03 above supplies an independent hypothesis and a reproduction that distinguishes the two possible causes, rather than repeating the animation-frame attempt.

I make no claim about which model or agent produced any prior report.

---

## 7. Practical next sequence

### Before any real sensitive deal data

1. **Add `preserve()` for the OAuth keys** (BF-01) — a two-line edit that must land *before* the first apply after credentials exist. Cheapest item on this list; largest avoidable loss.
2. **Complete GitHub OAuth end to end** — owner consent and callback, denial of an unlisted account, sign-out and revocation, and the MFA-field pre-flight noted in §3. Add a second numeric ID only if explicitly requested, and remember it must go into `railway.ts:40` as well.
3. **Make recovery tooling diagnosable** (BF-02), then **design and run the production restore exercise** (G-01) with owner, retention, RPO and RTO recorded, and decide on archive encryption and storage (G-02). This is the real gate. Everything after it depends on it.
4. **Reproduce BF-03** at a true 390 px viewport before touching the focus code again. Two sessions have now attempted a fix without a reproduction; do the measurement first.

### Before expanded underwriting

5. **Commit the Decimal oracle generator** (G-06) and add the long-schedule NPV case plus the Kahan-removal probe (§4, items 1–2). Do this *before* wiring `analyzeCashFlows` to any UI — retrofitting coverage after exposure is how the earlier NPV findings happened.
6. **Complete independent acquisition/development reference-workbook acceptance** — recorded reviewer, review date, model version and reconciliation notes — and change `reviewStatus` in `reference-cases.json` only when that is genuinely true.
7. **Write down the app-revision ↔ migration compatibility matrix** (G-03) before the next schema change.

### Before sources and incentives

8. **Pilot 30–50 authorized properties across varied Florida county formats**, then populate the coverage matrix with explicit *unavailable* and *untested* cells. Map geometry for all 67 counties establishes nothing about parcel freshness, completeness or ingestion rights.
9. **Obtain written terms** for any provider before ingestion — retention, derived data, AI use, two-user pricing, termination and export.
10. **Exercise one small, date-correct incentive case** during the data pilot, keeping potential match / verified eligibility / actual award strictly separate — without waiting for the full Phase 4 build.

### Decisions no agent can make for you

These are **investment decisions**, and nothing in this codebase should be allowed to fill them in with a plausible default:

- **D01 buy box** — deal and unit range, strategy priority, hold period, condition, construction type.
- **D02 capital and authority** — equity available, partners, guarantees, leverage and concentration limits. A good property can still be an impossible transaction.
- **D03 return and downside policy** — hurdles, cash-loss tolerance, capital-call policy, by strategy.
- **D04 reference projects** — which of your completed, ordinary and failed projects can be used, with what permission and what actual financials. Without failures, any future calibration is survivorship.
- **D05 buy vs integrate vs build** — the same-document comparison against A.CRE / Radix / Rockport / TestFit.
- **D13 spend limits** and **D15 Florida downside assumptions** — tax reassessment, insurance, storm and flood exposure.

The single most valuable thing you could add to this tool is not code. It is D01–D03 written down in the mandate field that is already waiting for them — because every gate after that, including what "advance" ought to mean, depends on them.

---

## 8. Coverage ledger

| # | Domain | Representative files actually read | Conclusion | Unverified boundary |
| --- | --- | --- | --- | --- |
| **1** | **Product, architecture, sequencing** | `AGENTS.md`, `README.md`, `docs/PRODUCT.md`, `ROADMAP.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `adr/0001-private-workspace.md`, `DESIGN.md`, `.review-context/HANDOFF.md` | Scope preserved: all-67-county, small allowlisted workspace, private, no billing/signup/multitenancy — verified in code, not just prose (`db/001:3-6,10`, `lib/auth/policy.ts:11`, `PRODUCT.md:7-8`). Architecture is proportionate; no unnecessary complexity for a small workspace. Gates are sequenced before sensitive data. No UI or plan statement overstates readiness — I looked for one specifically and found the opposite pattern. | `docs/reference/initial-concept.txt` (28 KB) **not read** — superseded historical context per `README.md:36`. Vendor capability and licensing claims in `SOURCES-AND-REUSE.md` are **not verified**; they need live primary-source checking before any purchase. |
| **2** | **Finance, calculations, validators** | `lib/finance/{screening,cash-flows,reconciliation,validation}.ts`, `lib/workspace/{money,validation,snapshot}.ts`, `components/workspace/{screening-form,screening-results,ui}.tsx`, `tests/finance/*` (all 4 + fixtures), `scripts/test-financial-guards.mjs`, `docs/CALCULATION-VALIDATION.md` | Units, periods, signs, denominators, zero/missing handling, safe-integer limits, exact-fraction loan-cap flooring, NPV dates/rates/precision, reconciliation and model versioning independently checked. **Every reference expectation hand-verified.** No formula/label mismatch. No counterexample found on the one reachable path. Gaps: long-schedule NPV untested, Kahan unprobed, UI formatters untested, scaling invariant anchored on a zero base. | I did not execute a single test. No workbook, rent roll, T12 or loan document was available to reconcile against. The Decimal oracle generator is absent from the repository. The precision envelope is a documented heuristic, not a proven bound — `CALCULATION-VALIDATION.md:39` says so itself. |
| **3** | **Auth, authorization, privacy** | `lib/auth/{factory,policy,server,session,client}.ts`, `proxy.ts`, `app/api/auth/[...all]/route.ts`, `app/(workspace)/{layout,actions}.ts(x)`, `app/sign-in/*`, `next.config.ts`, `tests/auth/policy.test.ts`, `tests/integration/auth.test.ts` | Traced allowlist parsing, immutable numeric identity, three-layer identity gating (`mapProfileToUser` → `user.create.before` → `session.create.before`), origin handling, signup/linking closure, 8-hour DB sessions with no cookie cache, revocation, token encryption, rate-limit config, cookie flags, `no-store`, nonce CSP. Considered forged cookies and direct requests, not UI visibility. **No unauthorized path found.** The `/api/auth` allowlist is strong hardening; `new URL()` normalization defeats traversal-style path tricks. | **No production OAuth callback, unlisted-account denial or owner recovery is certified** — correctly out of scope. Rate limiting untested. Real `/callback/github` with a GitHub profile never exercised. I could not test a live CSP response, only read the policy string. |
| **4** | **Persistence, audit, concurrency** | `db/001`, `db/002`, `db/003`, `db/connection.mjs`, `db/README.md`, `lib/workspace/{service,db,types,errors}.ts`, `tests/workspace/database.test.ts`, `scripts/db-migrate.mjs` | All SQL parameterized. App and DB constraints **agree** (Florida lat/lon bounds, unit count > 0, `asking_price_cents ≤ MAX_SAFE_INTEGER`, evidence cardinality 1–100, stage and decision enums). `pg.types.setTypeParser(1082)` preserves calendar dates as strings; int8 arrives as a string and is converted safely. Idempotency binds actor + operation + payload hash and rolls back on conflict. Immutability triggers are real DB triggers, verified against live SQL. **Migration 003's `@> '{"ok":true}'` containment check is correct** — it does not have the NULL-passthrough weakness a text comparison would have. | Schema behavior verified by reading plus the supplied CI/local PostgreSQL runs — **I ran nothing**. Concurrent `updateDeal` (as opposed to concurrent mandate saves) is untested, though structurally equivalent via `FOR UPDATE OF d`. No row-level security; anyone with `DATABASE_URL` has full access — correctly stated at `db/README.md:7`. |
| **5** | **UI, accessibility, map, design** | All of `app/**` and `components/**`; `app/globals.css` (tokens, layers, responsive, focus, motion — targeted reads + greps, **not all 43 KB**); `app/sign-in/sign-in.module.css`; `public/data/florida-counties.source.json`; `public/fonts/README.md`; `docs/DESIGN.md` | Navigation, responsive breakpoints (1600/1250/1000/780/600), invalid-data messaging, pending/retry states, **preserved input on failure** (uncontrolled `defaultValue` throughout, plus an explicit unsaved-text notice at `forms.tsx:97`), table readability, financial precision. Map: 67-feature integrity check, pinned worker/shared modules, CSP compatibility, `ResizeObserver` + rAF, full lifecycle cleanup, selected-state sync, unavailable/error states, source-freshness labels. Reduced motion handled correctly at `globals.css:372` and — importantly — does **not** touch `visibility`/`display`, so it cannot affect focusability. | **No rendering, no browser, no measurement.** The 18 sampled contrast pairs are supplied evidence and are not a full accessibility audit. I read a fraction of `globals.css`, so contrast for every state is unverified by me. `public/data/florida-counties.geojson` — **coordinates not read** (1.1 MB); I relied on the manifest hash, the provenance file and `tests/workspace/validation.test.ts:71-87`, which asserts 67 features, FIPS/name parity with the register, geometry types and a Florida bounding box — it cannot detect a wrong or shifted polygon. `public/fonts/manrope-variable.ttf` — binary not parsed; hash cross-checked between two in-snapshot documents only. |
| **6** | **Deployment, dependencies, recovery** | `Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json` (targeted entries), `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.railway/railway.ts`, `.railway/README.md`, `scripts/{start,db-migrate,db-backup,db-restore-check,db-recovery-support,db-test,smoke,check-map-assets,copy-maplibre-worker}.mjs`, `docs/DEPLOYMENT.md` | All dependencies exactly pinned (no `^`); lockfile tracked and consistent with the manifest. Non-root multi-stage runtime copying only runtime artifacts. Checksum-locked forward migrations under an advisory lock, run before listen, with correct non-zero exit. Health (liveness) and readiness (identity + tables) are properly distinct. Secret boundaries respected — `.dockerignore` and `.gitignore` exclude `.env*`, `.local`, `data`, `uploads`, `*.pem`, `*.key`. Restore-check target validation is genuinely strong. The PostGIS `service.postgres` address, PG major 18, PGDATA, volume, region and the 8080 domain target are all correctly encoded per the documented constraints. | Lockfile: I inspected entries for `better-auth`, `better-call`, `next`, `react`, `pg`, `maplibre-gl`, `jose`. **I did not audit transitive package implementations and did not run `npm audit`.** CI runs, Docker builds and Railway deployments are supplied evidence. Railway's private-network isolation guarantee (relevant to `DATABASE_SSL_MODE: "disable"` at `railway.ts:39`) needs live confirmation before real deal data. **I did not apply, plan, or evaluate any infrastructure change** — BF-01 is a source-level observation. |
| **7** | **Sources, incentives, comparisons, AI** | `docs/SOURCES-AND-REUSE.md`, `METHODOLOGY.md`, `EVALUATION.md`, `DECISIONS.md`, `PRODUCT.md`, `public/data/florida-counties.source.json`, `lib/workspace/counties.ts`, `db/001:110-127` | Plans for entity resolution, freshness, conflicting values, retention/derived-data/AI rights, coverage gaps and source health are specified and appropriately gated. Incentives correctly decompose location match / current eligibility / award / restrictions / expiration / net benefit. Comparison and grading plans address survivor and selection bias, ordinary and failed projects, comparability normalization, sparse rural data and held-out validation — better specified than most shipped systems. AI boundaries are written before the first integration. **I independently verified the 67-county register**: all FIPS and names correct, `12025` (obsolete Dade) properly absent, Miami-Dade correctly `12086`. | **Nothing here is implemented** — all of it is plan, and I reviewed it as plan. No source connector, license, vendor term, price, program rule or API capability is verified. Every current legal, lending-program, vendor-pricing and API-licensing claim in these documents requires live primary-source verification before it is relied on for a transaction. A planning citation is not a verified term for today. |

### Explicit omissions

Stated rather than glossed: I did not read `docs/reference/initial-concept.txt`, the full text of `docs/reviews/2026-09-12-execution-review.md` (structure and resolutions only), the GeoJSON coordinate data, the font binary, the full `app/globals.css`, the full lockfile, or `app/icon.svg`, `.gitattributes`, `.nvmrc`, `next-env.d.ts` and the three one-line `package.json` files. I ran no code, opened no browser, touched no database and made no network request. Where I say "verified," I mean verified by reading and hand-computation; where a claim needs execution, I have said so and supplied the case to run.

**A launch, a clean CI run, a green build, or the absence of findings in this report does not constitute financial certification of BlackFin.**
