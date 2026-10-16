import { NextRequest, NextResponse } from "next/server";

// Identity is verified in the DAL/actions, not inferred from a proxy cookie.
// This proxy only supplies a per-response script nonce and browser policy.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // MapLibre positions its canvas, controls and popups with inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "font-src 'self'",
    `connect-src 'self' https://tile.openstreetmap.org https://imagery.nationalmap.gov${development ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.BETTER_AUTH_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Vendored module workers receive no per-document nonce policy. They load only
// same-origin pinned modules; their URLs contain no workspace data.
export const config = { matcher: ["/((?!api|_next/static|_next/image|data/|maplibre/|favicon.ico).*)"] };
