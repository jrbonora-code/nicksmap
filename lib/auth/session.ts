import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, isAuthConfigured } from "./server";
import { isAllowedUser, readAuthConfig } from "./policy";
import type { WorkspaceUser } from "../workspace/types";

// React cache deduplicates this check within a server render, never across users.
export const getWorkspaceSession = cache(async (): Promise<WorkspaceUser | null> => {
  if (!isAuthConfigured()) return null;
  const session = await getAuth().api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  if (!session || !isAllowedUser(session.user, readAuthConfig()!)) return null;
  // Email identities have no GitHub login; their address is the stable audit login.
  return { id: session.user.id, name: session.user.name, login: session.user.githubLogin ?? session.user.email, avatarUrl: session.user.image ?? null };
});

export async function requireWorkspaceSession(): Promise<WorkspaceUser> {
  const user = await getWorkspaceSession();
  if (!user) redirect("/sign-in");
  return user;
}
