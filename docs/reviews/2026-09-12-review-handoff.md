> Historical evidence, not active instructions. Follow [the current handoff](../HANDOFF.md) and [AGENTS.md](../../AGENTS.md) for current work. The review assignment, launch/continuation steps and tool restrictions below belong to the September 12 review, not a new session. Do not restart that review from this record; findings and completion evidence remain revision-specific.

# BlackFin session handoff

> Dated record. The review this handoff requested was completed the same day; see [the consolidated review and drift report](2026-09-12-fable-review-and-drift.md) for findings and dispositions. Later that day the sign-in method changed to email and password for two allowlisted addresses, with GitHub optional; see [deployment](../DEPLOYMENT.md). Statements below about GitHub-only sign-in and the pinned revision `88c047b` describe the state at preparation time.

Prepared 2026-09-12 to support a fresh session and an independent Claude review. This is a restart brief, not a new product specification or a claim that the Claude review has finished.

## Immediate task

Continue in a fresh session with this context. First obtain the actual Claude review, independently reproduce material findings, and produce a prioritized disposition. Do not restart scaffolding or silently convert review recommendations into implementation. Earlier work authorized a serious internal platform; this handoff specifically requests an independent review before deciding what to change next.

Read this file, `AGENTS.md`, `README.md`, `ROADMAP.md` and `CLAUDE-REVIEW-BRIEF.md`. The [Claude launch record](2026-09-12-claude-review-launch.md) confirms an actual `claude-opus-5` session at max effort and explains continuation. A task-specific launch receipt at `.local/claude-review-20260912-88c047b/launch.json` identifies the Claude session, source snapshot and output paths. Check the receipt and runner status before launching another reviewer. If a process exits without a valid successful result, report the review as incomplete.

## Location and revision contract

| Item | Value at handoff preparation |
| --- | --- |
| Actual repository | The local workspace checkout |
| Ownership | Private repository personally owned by `npstewart87`; never make public or transfer |
| Application revision under review | `88c047bc3cd78a4a47fc81ea9f383ce0e2ae5f3e` |
| Application branch | `main` |
| Handoff documentation branch | `chore/session-handoff-20260912` |
| Previous implementation baseline | `3d027bc4ef919706086b714de88d955bb5db4942` |
| Latest recorded main CI | Run `34695163007`, success at the application revision |
| Public application | https://web-production-7339b.up.railway.app |
| Latest verified web deployment | `172d85e0-b63c-48b3-96e7-93d82bcd145a`, SUCCESS at the application revision |

At preparation, main was clean and matched origin and the deployed application revision. The handoff branch contains documentation only; do not equate its later commit with deployed application code. Verify current Git, CI and Railway state again before making a current deployment claim. Preserve any subsequent user edits.

## Agreed product and design

- **BlackFin**, capital F. “Fin” refers to finance; the name also has an institutional investment feel.
- Find and evaluate multifamily opportunities across **all 67 Florida counties**. One shared internal workspace for a small allowlisted group, with a private repository and Railway deployment.
- The platform should support rigorous analysis and traceable judgments rather than replace professional judgment with invented weights.
- Evaluate existing underwriting models, licensed data and useful open-source components before expanding custom methodology. Source candidates are research, not connected integrations or reviewed licenses for every intended use.
- Include future opportunity-zone and other federal, state, county and municipal incentive research, with dated rules, restrictions, benefit scenarios and an explicit distinction between a potential match, verified eligibility and an actual award.
- **Light mode only for now**: porcelain white, lightish blue, soft futuristic/iRobot inspiration, restrained dot matrix details. White navigation, original dot-fin mark, self-hosted Manrope, clear readable finance tables. Preserve this approved direction.
- No public signup, customer billing, multitenant organizations or investor-facing product expansion.

## What exists

The application implements manual Florida deal entry, dated evidence metadata, annual operating screens and qualitative research/pass decisions. It has overview/deal/evidence/history views, a county map and a draft investment mandate. It does not ingest market feeds or private documents and has no complete development cash-flow engine or validated aggregate score.

The fixed-workspace database uses parameterized SQL, identity checks at each data access/action, transactional idempotency tied to actor and payload, stale-edit checks and actor audit. Decision snapshots preserve inputs, outputs, model version, source content, deal/mandate context, actor and reason. Unknown financials remain unknown; dollar strings convert to safe integer cents without binary floating-point parsing of money.

Better Auth uses GitHub numeric IDs, an allowlist of at most two people and a GitHub MFA check at sign-in. The initial owner ID is `110749578`. Database-backed eight-hour sessions, PKCE/state, same-origin mutation checks, no-store private pages and a nonce CSP are implemented. Production GitHub OAuth credentials are still missing, so the live sign-in flow remains closed. Liveness 200 and readiness 503 are expected in that state. No authenticated production callback, recovery or continuous MFA verification is claimed.

Financial primitives include annual screening, payment/debt sizing, dated NPV and sources/uses reconciliation, with model version `screening-0.2.0`. They do not constitute acquisition/development financial signoff. No full IRR, waterfall, construction draw or calibrated ranking implementation is claimed.

## Verification already recorded

Consult the underlying reports and distinguish checks run by earlier agents from tests you personally rerun:

| Evidence | Established scope and limit |
| --- | --- |
| Local `npm run check` | Lint, route/type generation, 85 finance cases, 12 controlled fault injections, 5 auth-policy cases, 14 workspace unit cases, production build and unauthenticated smoke; recorded for the application release |
| Real PostgreSQL suites | 5 auth and 14 workspace integration cases; ordinary unit command intentionally skips database-dependent cases |
| Main CI | Clean Linux install, checks, PostgreSQL integration and container boot/migrations; see the exact CI run above |
| NPV second implementation | Earlier independent reviewer evaluated 1,605 schedules against 110-digit Decimal: 946 accepted, 659 conservatively blocked; no admitted sample exceeded 0.01-cent error. This is sampled evidence, not universal correctness proof |
| Local recovery | Isolated synthetic backup/restore compared content and counts for all 13 tables, including timezone behavior. Production restore is unverified |
| Browser flows | Synthetic local deal, evidence, qualitative decision, annual metrics, immutable history, map selection, stale-mandate rejection and sign-out/private-route denial |
| Design | Actual desktop and 390px phone viewports, correct responsive controls and 18 sampled text-contrast pairs. This is not full accessibility certification |
| Public production checks | Closed sign-in state, protected-page denial, expected readiness response, 67 county geometries and exact pinned MapLibre modules/font assets |

The synthetic annual reference shown in browser QA used 20 units, GPR $360,000, vacancy $18,000, concessions $3,000, credit loss $1,000, other income $12,000, expenses $140,000, reserves $6,000, price $2,500,000, cost $2,600,000, loan $1,500,000 and annual debt service $120,000. Expected EGI $350,000, NOI $210,000, cash after reserves $204,000, cash after debt $84,000, DSCR 1.70, debt yield 14%, cap rate 8.4%, yield on cost about 8.08%, LTC about 57.69%, and price per unit $125,000. It is synthetic, not a real opportunity or an approved mandate.

## Review history and known limits

- [Initial independent review](2026-09-12-independent-review.md) applies to historical baseline `3004d554dcbbc977823809056c32ff8cef665b85`; its NPV cancellation and zero-flow findings were reproduced and fixed later. Read it as a historical report.
- [Execution review](2026-09-12-execution-review.md) records R1–R12, corrective work and attributed verification. The latest source still deserves independent challenge.
- [BlackFin design review](2026-09-12-blackfin-design-review.md) is a **self-review**, not Claude's independent review. It supersedes the earlier deployment log's inability to verify a true mobile viewport.
- Automatic initial focus inside the mobile drawer was **not confirmed**. Escape from inside the drawer, focus return to its opener, inert page behavior and navigation were checked. A temporary animation-frame change did not establish a fix and was reverted. Reproduce before modifying focus behavior.
- No completed Claude review should be claimed merely because a process started, a brief exists or another model previously reviewed the code.

## Next gates after review

1. Triage Claude findings with exact source lines, reproduction, impact, disposition and a focused validation plan. Keep confirmed defects, missing evidence and planned capabilities separate.
2. Resolve D01–D05 in `DECISIONS.md`: buy box, capital/authority limits, return/downside policy, permissioned reference projects/workbooks, and a same-document buy/integrate/build comparison. Do not invent the user's investment mandate.
3. Complete the actual GitHub OAuth consent/callback, unlisted-account denial, sign-out/revocation and recovery. Add a second numeric account ID only if explicitly requested. GitHub setup previously stopped at a signed-out browser; no credentials were fabricated.
4. Before sensitive data or imports, measure a production backup/restore with owner, retention, RPO and RTO. Local synthetic recovery does not close this gate.
5. Complete independent acquisition/development reference-workbook acceptance before expanding financial decision claims.
6. Pilot authorized samples across varied Florida sources. Map geometry for all counties does not establish parcel/vendor freshness, completeness or rights to ingest/store data.

Later work includes incentives, source-change monitoring, development/lease-up scenarios, comparison cohorts and calibrated ranking, subject to the roadmap's evidence and spending decisions. It is not silently part of this review.

## File map

| Area | Read |
| --- | --- |
| Product, mandate, scope | `README.md`, `docs/PRODUCT.md`, `DECISIONS.md`, `ROADMAP.md`, `docs/reference/initial-concept.txt` (historical) |
| Methodology and evaluation | `docs/METHODOLOGY.md`, `CALCULATION-VALIDATION.md`, `EVALUATION.md`, `SOURCES-AND-REUSE.md` |
| Architecture, privacy, operations | `docs/ARCHITECTURE.md`, `DEPLOYMENT.md`, `adr/0001-private-workspace.md`, `db/README.md` |
| Finance and validation | `lib/finance/*`, `lib/workspace/money.ts`, `validation.ts`, `snapshot.ts`, `tests/finance/*`, `scripts/test-financial-guards.mjs` |
| Identity and data access | `lib/auth/*`, `proxy.ts`, `app/api/auth/[...all]/route.ts`, `app/(workspace)/actions.ts`, `lib/workspace/service.ts`, `db.ts` |
| Schema and recovery | `db/*.sql`, `db/connection.mjs`, `scripts/db-*.mjs`, `scripts/start.mjs` |
| UI, maps and assets | `docs/DESIGN.md`, `app/*`, `components/*`, `public/data/*`, `public/fonts/*`, map-asset scripts |
| CI and deployment | `.github/workflows/ci.yml`, `Dockerfile`, `.railway/railway.ts`, package/lock files, `scripts/smoke.mjs` |

## Operations and pitfalls

Use Node 24 and the committed lockfile. `npm run check` is required for implementation changes under `AGENTS.md`; real database suites are separate and must use an isolated test database. No application code changes are part of handoff preparation.

The Railway project has a production environment with a `web` service and a PostGIS service; read their IDs from the linked Railway project rather than from this record. The public domain targets port 8080.

- The verified project CLI is `.local/tools/railway.exe` (5.54.0). Prepend `.local/tools` to the process PATH for IaC; the SDK otherwise invokes the older machine CLI.
- The existing custom PostGIS image is imported at **`service.postgres`**, not `database.postgres`. A wrong address proposed replacing the database and was never applied. Reject unexpected deletion/recreation.
- Preserve PostgreSQL major 18, the existing volume, `/var/lib/postgresql/data`, PGDATA `/var/lib/postgresql/data/pgdata`, region `us-east4-eqdc4a`, existing capacity and runtime secrets. Never reset the database for convenience.
- The IaC planner omitted a domain-port difference from its change list. Verify domain routing directly; production `PORT` and domain target are 8080. A previous 502 was fixed by correcting that domain target, with a controlled retest.
- Add `preserve()` entries for any newly configured OAuth secret keys before a future IaC apply. Do not export or print variable values.
- Full private storage and a public database proxy have not been provisioned. Do not create paid services during review.

Local synthetic browser/database processes were stopped at the previous release handoff; do not assume they remain running. The test PostgreSQL directory is `.local/workspace-test-pg`, with PostgreSQL 16 binaries and loopback port 55467; it is separate from unrelated machine services. Synthetic browser ports were 43177/43178. Verify listeners before reuse and never stop an unrelated service.

Ignored `.local` contains synthetic session cookies, authentication configuration and database artifacts. Do not read or copy that directory wholesale. In particular, do not expose `.local/review-config.json`. The Claude snapshot contains only tracked source plus explicitly selected non-secret evidence; production credentials are neither needed nor supplied.

## Completion of this handoff

The fresh session should begin by reading the launch receipt and obtaining Claude's actual report. Preserve the raw reviewer result and reviewer/model/session identity. Validate source hashes against the pinned snapshot manifest, then reproduce material findings in isolated conditions. Report coverage and untested boundaries candidly. Review completion alone is not permission to deploy or close the operational and financial gates above.
