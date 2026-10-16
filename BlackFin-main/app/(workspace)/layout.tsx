import type { ReactNode } from "react";
import { requireWorkspaceSession } from "../../lib/auth/session";
import { WorkspaceShell } from "../../components/workspace/sidebar";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireWorkspaceSession();
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
