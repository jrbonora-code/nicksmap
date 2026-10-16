export const dynamic = "force-dynamic";

// Deployment liveness only. This does not assert database, auth or data readiness.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
