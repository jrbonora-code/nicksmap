import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { WorkspaceValidationError } from "./errors.ts";
import type { WorkspaceUser } from "./types.ts";

/**
 * Run one mutation at most once per actor and client-generated request ID, inside the caller's transaction.
 * A successful identical retry returns the saved result; a changed payload cannot reuse a successful key;
 * a failed transaction rolls the request row back with everything else.
 */
export async function runIdempotent<T, I extends {requestId:string}>(client: PoolClient, actor: WorkspaceUser, operation: string, input: I, run: () => Promise<T>): Promise<T> {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const inserted = await client.query(`INSERT INTO workspace_requests(actor_id,request_id,operation,payload_hash) VALUES($1,$2,$3,$4)
    ON CONFLICT(actor_id,request_id) DO NOTHING RETURNING request_id`,[actor.id,input.requestId,operation,hash]);
  if (!inserted.rowCount) {
    const prior = (await client.query("SELECT operation,payload_hash,result FROM workspace_requests WHERE actor_id=$1 AND request_id=$2 FOR UPDATE",[actor.id,input.requestId])).rows[0];
    if (prior.operation !== operation || prior.payload_hash !== hash || !prior.result) throw new WorkspaceValidationError("This submission was already saved with different content. Refresh before starting a new submission.");
    return prior.result as T;
  }
  const result = await run();
  await client.query("UPDATE workspace_requests SET result=$3 WHERE actor_id=$1 AND request_id=$2",[actor.id,input.requestId,JSON.stringify(result)]);
  return result;
}
