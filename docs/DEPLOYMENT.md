# Railway deployment

## Intended topology

Private personal GitHub repository `npstewart87/BlackFin`, branch `main`, Railway `web` service built from the root Dockerfile and `postgres` service using PostGIS 18/3.6. The repository owner is the personal account `npstewart87`; it must remain private. Private research data is imported through an explicit operator CLI. No private-document storage account or OCR worker is provisioned; the app does not run recurring commercial collection.

Infrastructure configuration is `.railway/railway.ts`, evaluated by a current Railway CLI. Use the selected IaC flow and inspect its plan before applying changes.

## Build and health

- Node.js 24, npm lockfile, multi-stage Docker build, non-root runtime.
- Start uses `scripts/start.mjs` to load Next.js standalone `server.js`; listen on Railway's `PORT` and `0.0.0.0`. Apply required checksum-locked migrations explicitly before releasing compatible application code; startup performs no schema changes.
- Production explicitly pins `PORT=8080` and routes the existing public service domain to 8080. Docker's fallback `EXPOSE 3000` is not the production routing contract.
- Healthcheck: `/api/health`, timeout 120 seconds.
- `/` redirects to sign-in or the allowed user's research page. Private pages/actions verify server identity.
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

## Rollback and operations

The workspace now persists state. Do not roll back database volumes or edit applied migrations. Roll back application code only after checking schema compatibility; review every applied migration, including identity and research schema changes. A previous image may not understand later result or identity shapes. Prefer a forward corrective release. Use [database backup and isolated restore procedures](../db/README.md) before any destructive schema work, and preserve database/document-reference consistency when document storage exists.

Railway's deployment healthcheck runs during deployment, not as continuous monitoring. Define monitoring, budget ownership, recovery objectives and a restore exercise before storing production financial records.

## Historical verification and operator tools

Earlier callback fixes, infrastructure bring-up and dated deployment receipts are preserved in [the deployment history](archive/2026-09-14-deployment-history.md). They do not describe current service state or override this runbook. The project-local Railway CLI is retained under the original checkout at `.local/tools/railway.exe`; verify its version and target before use. Read [HANDOFF.md](HANDOFF.md) for the latest recorded release and active build.
