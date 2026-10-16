# Railway project configuration

The single authoring file is `railway.ts`. It describes this project's web service, private PostgreSQL/PostGIS service, GitHub source and environment references. OAuth secrets are preserved in Railway variables.

Use a current Railway CLI with Infrastructure as Code support. Link the exact project and environment, then run `railway config plan` and inspect the target and changes before `railway config apply`.

Do not apply this file against another project. Omitted managed resources can be deleted. Never add real secrets to source or use `config pull --include-variables` when preparing tracked files.

The Dockerfile supplies build/start. Apply checksum-locked migrations explicitly against the verified target before release; application startup does not apply migrations. `/api/health` is liveness; `/api/readiness` separately reports configured identity and database availability. The web domain is `web-production-7339b.up.railway.app`. No public database proxy, worker, private document bucket or provider subscription is requested.

The initial database creation used Railway's PostgreSQL 18 template; the follow-up source plan selected PostGIS 18/3.6 while preserving the initialized cluster's PGDATA and volume. Do not downgrade the cluster or change its mount path as a routine image update.

The chosen deployment contract is this IaC file plus the root Dockerfile. See [the current deployment runbook](../docs/DEPLOYMENT.md); earlier infrastructure records are historical.

## Infrastructure round-trip requirement

The custom PostGIS image is imported by Railway as `service.postgres`, so preserve that resource address and the existing `volume.postgres-volume`. The final 2026-09-12 preview returned **No changes**. Do not switch it back to a `database()` declaration without an explicit migration plan: that can propose deleting and recreating the service. Database variables use `preserve()`; credentials are never embedded here.

Production uses `PORT=8080` and the existing service domain must target 8080. The current CLI's IaC preview omitted a domain-port difference from its change set, so a clean plan is insufficient: check `railway domain status`, use the dedicated domain update command if necessary, and verify the public URL after a deployment.
