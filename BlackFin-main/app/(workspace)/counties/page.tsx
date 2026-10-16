import { CountiesExplorer } from "../../../components/workspace/counties-explorer";
import { NewDealLink, PageHeading, UnavailableState } from "../../../components/workspace/ui";
import { WorkspaceUnavailableError } from "../../../lib/workspace/errors";
import { listCountyCoverage, listDeals } from "../../../lib/workspace/service";

export default async function CountiesPage() {
  let counties, deals;
  try { [counties, deals] = await Promise.all([listCountyCoverage(), listDeals()]); } catch (error) { if (error instanceof WorkspaceUnavailableError) return <UnavailableState />; throw error; }
  return <><PageHeading eyebrow="ALL 67 FLORIDA COUNTIES" title="Florida coverage" description="See where you’re working, and where the evidence still needs to catch up."><NewDealLink /></PageHeading><CountiesExplorer counties={counties} deals={deals} /></>;
}
