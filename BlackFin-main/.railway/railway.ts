import { defineRailway, github, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const postgresVolume = volume("postgres-volume", { region: "us-east4-eqdc4a", sizeMB: 50000 });
  // Railway imports the custom PostGIS image as service.postgres, not
  // database.postgres. Match that address to preserve the existing service.
  const postgres = service("postgres", {
    source: image("postgis/postgis:18-3.6"),
    deploy: { requiredMountPath: "/var/lib/postgresql/data" },
    volumeMounts: { "/var/lib/postgresql/data": postgresVolume },
    env: {
      DATABASE_URL: preserve(),
      PGDATA: preserve(),
      PGDATABASE: preserve(),
      PGHOST: preserve(),
      PGPASSWORD: preserve(),
      PGPORT: preserve(),
      PGUSER: preserve(),
      POSTGRES_DB: preserve(),
      POSTGRES_PASSWORD: preserve(),
      POSTGRES_USER: preserve(),
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: preserve(),
      SSL_CERT_DAYS: preserve()
    }
  });
  const web = service("web", {
    source: github("npstewart87/BlackFin", { branch: "main", checkSuites: true }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: { restartPolicyMaxRetries: 3 },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: 1,
    networking: {
      serviceDomains: { "web-production-7339b.up.railway.app": { port: 8080 } }
    },
    env: {
      PORT: "8080",
      DATABASE_URL: postgres.env.DATABASE_URL,
      DATABASE_SSL_MODE: "disable",
      ALLOWED_GITHUB_IDS: "110749578",
      BETTER_AUTH_URL: "https://web-production-7339b.up.railway.app",
      BETTER_AUTH_SECRET: preserve(),
      // Email sign-in: one or two allowlisted addresses, and the flag that lets an address
      // without a password create one. Both are runtime variables; close the flag once
      // both users are in.
      ALLOWED_EMAILS: preserve(),
      ACCOUNT_SETUP_OPEN: preserve(),
      // Optional GitHub OAuth app credentials are runtime variables and must be preserved
      // here, or a later `config apply` can remove them and close the workspace.
      GITHUB_CLIENT_ID: preserve(),
      GITHUB_CLIENT_SECRET: preserve(),
      // Server-side Sentry error reporting; unset means reporting is off.
      SENTRY_DSN: preserve()
    }
  });

  // Database access stays on Railway's private network. No paid data subscription
  // or public database proxy is requested. OAuth secrets are runtime variables.
  return project("multifamily-opportunity-radar", { resources: [postgresVolume, postgres, web] });
});
