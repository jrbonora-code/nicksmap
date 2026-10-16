import type { Metadata } from "next";
import { requireWorkspaceSession } from "../../../lib/auth/session";
import { IDEAS, MARKET_NOTES, PRACTICAL_NOTES } from "../../../lib/ideas/catalog";
import { IdeasView } from "../../../components/workspace/ideas-view";

export const metadata: Metadata = { title: "Ideas" };

export default async function IdeasPage() {
  await requireWorkspaceSession();
  return <IdeasView ideas={IDEAS} marketNotes={MARKET_NOTES} practicalNotes={PRACTICAL_NOTES} />;
}
