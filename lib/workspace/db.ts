import "server-only";
import type { Pool, PoolClient } from "pg";
import { createDatabasePool } from "../../db/connection.mjs";
import { WorkspaceUnavailableError, WorkspaceValidationError } from "./errors.ts";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;
  try {
    pool = createDatabasePool();
    // An idle connection error must not terminate the server or log private connection details.
    pool.on("error", () => { console.error("Workspace database idle connection unavailable."); });
    return pool;
  } catch {
    throw new WorkspaceUnavailableError();
  }
}

export async function withDatabase<T>(run: (client: PoolClient) => Promise<T>, transaction = false): Promise<T> {
  let client: PoolClient | undefined;
  try {
    client = await getPool().connect();
    if (transaction) await client.query("BEGIN");
    const result = await run(client);
    if (transaction) await client.query("COMMIT");
    return result;
  } catch (error) {
    if (transaction && client) await client.query("ROLLBACK").catch(() => {});
    if (error instanceof WorkspaceValidationError || error instanceof WorkspaceUnavailableError) throw error;
    // Do not serialize driver errors, SQL, submitted facts, URLs or credentials to the client.
    throw new WorkspaceUnavailableError();
  } finally {
    client?.release();
  }
}
