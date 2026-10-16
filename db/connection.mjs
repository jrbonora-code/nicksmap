import pg from "pg";

// A calendar date has no time zone. Preserve it exactly on every deployment host.
pg.types.setTypeParser(1082, value => value);

/** Shared by the server, explicit migrations and local integration tests. Never print credentials.
 * @param {Record<string, string | undefined>} env
 */
export function databaseOptions(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Expected a PostgreSQL database URL.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const privateRailway = url.hostname.endsWith(".railway.internal");
  const mode = env.DATABASE_SSL_MODE || url.searchParams.get("sslmode") || (local ? "disable" : "verify-full");
  if (!["disable", "require", "verify-full"].includes(mode)) throw new Error("Use DATABASE_SSL_MODE=verify-full or disable for a local/private Railway connection.");
  if (mode === "disable" && !local && !privateRailway) throw new Error("Unencrypted database connections are limited to localhost or Railway's private network.");
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("ssl")) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: mode === "disable" ? false : { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) },
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: "multifamily-opportunity-radar",
  };
}

/** @param {Record<string, string | undefined>} env */
export function createDatabasePool(env = process.env) {
  return new pg.Pool(databaseOptions(env));
}
