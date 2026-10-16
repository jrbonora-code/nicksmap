import { getAuth, isAuthConfigured } from "../../../../lib/auth/server";

// Password creation is a server action, not an HTTP auth route, so /sign-up/email,
// /set-password, /change-password, /forget-password and /update-user stay refused here.
const allowedPaths = new Set(["/sign-in/email", "/sign-in/social", "/callback/github", "/get-session", "/sign-out", "/revoke-sessions", "/revoke-other-sessions", "/error"]);

async function handle(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/auth")) return Response.json({ error: "Not found" }, { status: 404 });
  const path = pathname.slice("/api/auth".length);
  if (!allowedPaths.has(path)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!isAuthConfigured()) return Response.json({ error: "Private sign-in is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const response = await getAuth().handler(request);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return Response.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
