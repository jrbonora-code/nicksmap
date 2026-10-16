import { isAuthConfigured } from "../../../lib/auth/server";
import { getPool } from "../../../lib/workspace/db";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!isAuthConfigured()) return Response.json({ status: "not_ready" }, { status: 503, headers });
  try {
    await getPool().query("SELECT 1 FROM workspace_mandate LIMIT 1");
    await getPool().query("SELECT 1 FROM auth_user LIMIT 1");
    return Response.json({ status: "ready" }, { headers });
  } catch { return Response.json({ status: "not_ready" }, { status: 503, headers }); }
}
