# Archived deployment and verification notes

> Historical evidence only. Follow [current handoff](../HANDOFF.md), [project instructions](../../AGENTS.md) and the current runbook. Old state and commands below are not active instructions.

> Current source-to-analysis deployment uses explicit migrations before release; web startup no longer applies schema changes. See [RESEARCH-RELEASE.md](../RESEARCH-RELEASE.md). The older execution records below are retained as history.

# Railway deployment

## Intended topology

Private personal GitHub repository owned by `npstewart87`, branch `main`, Railway `web` service built from the root Dockerfile and `postgres` service using PostGIS 18/3.6. The repository owner is the personal account `npstewart87`; it must remain private. Private research data is imported through an explicit operator CLI. No private-document storage account or OCR worker is provisioned; the app does not run recurring commercial collection.

Infrastructure configuration is `.railway/railway.ts`, evaluated by a current Railway CLI. Railway's published documentation deprecates `railway.json` / `railway.toml` for new services; use the IaC flow instead.

## Build and health

- Node.js 24, npm lockfile, multi-stage Docker build, non-root runtime.
- Start uses `scripts/start.mjs` to load Next.js standalone `server.js`; listen on Railway's `PORT` and `0.0.0.0`. Apply required checksum-locked migrations explicitly before releasing compatible application code; startup performs no schema changes.
- Production explicitly pins `PORT=8080` and routes the existing public service domain to 8080. Docker's fallback `EXPOSE 3000` is not the production routing contract.
- Healthcheck: `/api/health`, timeout 120 seconds.
- `/` redirects to sign-in or the allowed user's overview. Private pages/actions verify server identity.
- `/api/health` verifies runtime liveness only. `/api/readiness` returns 200 only with complete identity configuration and reachable application/auth tables; its public response contains no account, schema or credential details.

## Connect or change configuration

1. Confirm GitHub remote, intended branch and clean working tree.
2. Confirm the exact linked Railway project and environment. Do not apply against a neighboring project.
3. Run the repository's current CLI `config plan`; inspect changes before applying.
4. GitHub integration must have access to this private repository. Verify the service source and branch from Railway itself.
5. Keep wait-for-CI enabled (`source.checkSuites: true` in IaC); verify the service setting rather than assuming a passing local build gates deployment.
6. Keep secrets in provider secret stores. Do not copy values from unrelated projects or commit provider exports.
7. Verify actual deployment success, deployed commit and runtime health. A direct local upload does not prove GitHub autodeploy is connected.
8. Read `railway domain status` and verify its target port matches the running process. The current IaC planner did not list a domain-port difference in its change set even though the current/desired graphs differed; use `railway domain update <existing-domain> --port 8080 --service web` when needed, then test the public URL.

Public HTTPS app domain: `https://web-production-7339b.up.railway.app`. Its public sign-in page exposes no deal data. The database uses `postgres.railway.internal` without a public proxy. Missing configuration for both supported sign-in methods keeps private pages inaccessible.

## Sign-in configuration

Two sign-in methods exist. Each is enabled only by its own complete set of variables, and at least one must be present for the workspace to open. Both require `BETTER_AUTH_URL` (the exact origin above), a generated `BETTER_AUTH_SECRET` of at least 32 characters, and `DATABASE_URL`. For production, secrets belong only in Railway variables; local development uses an ignored `.env.local`. `.railway/railway.ts` preserves every runtime credential so a later `config apply` cannot remove them.

**Email and password (current method).** `ALLOWED_EMAILS` holds one or two addresses, compared case-insensitively. An allowlisted address without a password creates one at `/sign-in/create-password` (12 to 128 characters) only while `ACCOUNT_SETUP_OPEN=true`. The server action behind that page is the only creation path; the HTTP `/sign-up/email`, `/set-password`, `/change-password`, `/forget-password` and `/update-user` routes are refused. Set the flag to `false` once both users have passwords: sign-in keeps working, new passwords cannot be created, and nobody can claim an address first. To reset a forgotten password, delete that user's `credential` row in `auth_account`, reopen the flag, let the user create a new password, then close the flag again. Email users carry no GitHub identity (`db/004-email-identities.sql`); their address is their audit login.

**GitHub (optional).** GitHub is enabled by `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` together with `ALLOWED_GITHUB_IDS` (one or two immutable numeric account IDs; initial owner ID `110749578`). A credential without its partner or without the ID list is a configuration error that keeps the workspace closed; the ID list alone, which the IaC still declares, leaves GitHub disabled. Register a dedicated GitHub OAuth app with homepage `https://web-production-7339b.up.railway.app` and callback `https://web-production-7339b.up.railway.app/api/auth/callback/github`. Better Auth requests read:user and user:email with PKCE/state and no repository permissions; GitHub's documented private user response for `GET /user` includes `two_factor_authentication` with either scope. GitHub MFA is checked at each sign-in, not continuously during the eight-hour session. A GitHub identity is admitted only by numeric ID; an address match never admits a foreign GitHub identity, and a password can never be attached to a GitHub identity. Adding an ID requires updating both the Railway variable and `.railway/railway.ts` before any later IaC apply; removing an ID and restarting invalidates its sessions.

Order of operations for first sign-in: (1) explicitly apply required migrations against the verified target, then release the compatible code through GitHub/Railway; (2) set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `ALLOWED_EMAILS` and `ACCOUNT_SETUP_OPEN=true` on the `web` service; (3) confirm `/api/readiness` returns 200 and `/sign-in` shows the email form; (4) each user opens `/sign-in/create-password`, creates a password and signs in; (5) set `ACCOUNT_SETUP_OPEN=false`.

Callback fix, 2026-09-12: at revision `88c047b` the first real GitHub sign-in could not create a user. Better Auth 1.7.4 discards additional user fields declared `input: false` when it maps a provider profile, then rejects the create because the same fields are required (`MISSING_FIELD: githubId is required`). The three identity fields in `lib/auth/factory.ts` no longer declare `input: false`; they remain server-populated because `/sign-up/*` and `/update-user` are refused by the route allowlist, password sign-in is disabled, and social sign-in's client `additionalData` only travels inside OAuth state. `tests/integration/auth.test.ts` now drives the installed handler through `/sign-in/social` and `/callback/github` with GitHub's two endpoints intercepted, asserting the created user, account, session, refreshed login on a second sign-in, and denial for an unlisted ID, disabled MFA and a missing MFA field. A missing `two_factor_authentication` field now produces a distinct scope-configuration message instead of the allowlist denial.

## Rollback and operations

The workspace now persists state. Do not roll back database volumes or edit applied migrations. Roll back application code only after checking schema compatibility; migrations 001–003 are additive except 003 expands a result constraint to support qualitative decisions. A previous image may not understand that new result shape. Prefer a forward corrective release. Use [database backup and isolated restore procedures](../../db/README.md) before any destructive schema work, and preserve database/document-reference consistency when document storage exists.

Railway's deployment healthcheck runs during deployment, not as continuous monitoring. Define monitoring, budget ownership, recovery objectives and a restore exercise before storing production financial records.

## Workspace execution record — 2026-09-12

- Database service `postgres`: deployment `8d720add-2533-462c-9320-495429876988` reports SUCCESS with actual image `postgis/postgis:18-3.6`.
- Initial IaC create used Railway's default PostgreSQL 18 image. Follow-up changed the source to PostGIS 18/3.6, preserving initialized major version, PGDATA and volume; no downgrade/reset occurred. See ADR 0001.
- Final infrastructure round-trip preview reports **No changes**. Railway imports the custom PostGIS image as `service.postgres`; the declaration now matches that address, preserves all database variables and attaches the existing `postgres-volume` at its current region, capacity and mount. A prior preview proposed replacing the database because of an address mismatch; it was never applied.
- Local PostgreSQL service/auth tests and a synthetic backup/restore matched all 13 public tables. This does not verify production recovery. No real deal feed or sensitive document import was performed.
- Financial fixes passed 85 cases and 12 fault injections. A fresh ultra reviewer independently checked 1,605 additional NPV schedules against a 110-digit Decimal reference, including admitted cases and explicitly blocked numerical limits; no admitted error exceeded the declared 0.01-cent target in that sample.
- Final local `npm run check` passed lint, generated route types/TypeScript, 85 finance tests, 12 fault injections, 5 identity-policy tests, 14 workspace unit tests, production build and unauthenticated HTTP smoke checks. Actual PostgreSQL suites separately passed 5 auth and 14 workspace integration tests.
- Desktop browser verification used only an isolated synthetic database/session: invalid USD rejection, unknown values, dated evidence, qualitative pass, ten annual metrics, immutable history after editing, county search/map selection, stale mandate rejection with unsaved text preserved, and browser sign-out followed by protected-page denial.
- MapLibre 6 requires both its worker and shared ESM module to be copied from the pinned installed package for Next.js. The build prepares both plus the license; local/CI HTTP checks compare both files' hashes and JavaScript MIME types. The map's fixed container and actual county geometry were verified in the browser. [Official bundler setup](https://maplibre.org/maplibre-gl-js/docs/#esm).
- The browser viewport override did not change the observed 1280×720 viewport; it was reset. Responsive CSS and mobile navigation were inspected, but no completed mobile visual test is claimed.
- Application OAuth consent/callback, owner account recovery, private storage and production restore remain explicit operational gates. Runtime credentials have not been placed in source.
- Workspace implementation commit `2063a82460fd03b91b31c847251b24ea456e4bf8` was merged through PR #1. Main CI run 34676351685 passed, including real PostgreSQL integration and Linux container startup with migrations and exact map-asset checks.
- Railway deployment `6fdf965a-f2f2-407c-8bc5-0e972abdcd32` reported SUCCESS for that same implementation commit. Actual startup logs show migrations 001, 002 and 003 applied before Next listened on `0.0.0.0:8080`.
- The first public probe returned 502 because the existing domain targeted 3000. Updating that same domain to 8080 fixed the controlled live retest. The port is now explicit in IaC and the runtime variables; subsequent preview reports No changes. This was a routing correction, with no database or application-data reset.
- Live HTTP verification on 2026-09-12 at 05:50 UTC passed public health, unauthenticated private-route denial, closed OAuth entry state, expected readiness 503, closed signup/linking, all 67 county geometries and both exact pinned map modules. No authenticated production OAuth or production restore is claimed. Later configuration/documentation commits have their own CI/deployment revisions; read the current remote and Railway revision before asserting latest parity.

## Historical foundation verification record

- Private personal GitHub repository owned by `npstewart87`.
- Railway project `multifamily-opportunity-radar`, its production environment and `web` service (IDs omitted from this record).
- Local `npm run check`: passed lint, TypeScript, production build and HTTP smoke check.
- Foundation commit: `46ba3dbb45c554fd43a3c39e8cb03764d109a85a`, pushed to private GitHub `main`.
- GitHub CI run 34671525814: SUCCESS, including clean Linux install, lint, types, production HTTP smoke and Docker image build.
- Railway deployment `dd65b2dd-09fc-4a26-a0c3-06d445d4f0de`: SUCCESS, with the same foundation commit reported in Railway's deployment metadata. The service manifest contains the Dockerfile and `/api/health` check.
- GitHub source and `main` branch were read back from Railway. Wait-for-CI was subsequently enabled through a reviewed IaC change.
- No public service domain or persistent-data service was created. The root route remains intentionally unavailable; authentication, maps and financial features remain unimplemented.
- Local Docker Desktop was not running; the Docker image was built successfully by GitHub CI and Railway instead. Direct in-container SSH verification was not performed because the account had no registered SSH key; no key was added. Railway's configured deployment healthcheck and local/CI HTTP checks are the runtime evidence.
- This record identifies the initial verified runtime commit. Later documentation or configuration commits have their own CI/deployment records; read the current remote and Railway revision before asserting parity.

The existing machine-wide Railway CLI was 4.31.0. A checksum-verified official Windows CLI 5.54.0 was downloaded to ignored `.local/tools/railway.exe` for this project without changing the global installation. Put that directory first in the current process PATH when operating IaC so the SDK invokes the same current binary.

## References

- https://docs.railway.com/infrastructure-as-code
- https://docs.railway.com/infrastructure-as-code/reference
- https://docs.railway.com/deployments/healthchecks
- https://docs.railway.com/deployments/github-autodeploys
