import "server-only";
import { createWorkspaceAuth } from "./factory";
import { readAuthConfig } from "./policy";
import { getPool } from "../workspace/db";

let auth: ReturnType<typeof createWorkspaceAuth> | undefined;

export function isAuthConfigured(): boolean {
  try { return readAuthConfig() !== null; } catch { return false; }
}

export function getAuth() {
  if (auth) return auth;
  const config = readAuthConfig();
  if (!config) throw new Error("Private sign-in is not configured.");
  auth = createWorkspaceAuth(getPool(), config);
  return auth;
}
