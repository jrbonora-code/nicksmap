import { DealsTable } from "../../../components/workspace/deals-table";
import { NewDealLink, PageHeading, UnavailableState } from "../../../components/workspace/ui";
import { FLORIDA_COUNTIES } from "../../../lib/workspace/counties";
import { WorkspaceUnavailableError } from "../../../lib/workspace/errors";
import { listDeals } from "../../../lib/workspace/service";

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ county?: string }> }) {
  const params = await searchParams;
  let deals;
  try { deals = await listDeals(); } catch (error) { if (error instanceof WorkspaceUnavailableError) return <UnavailableState />; throw error; }
  return <><PageHeading eyebrow="OPPORTUNITY PIPELINE" title="Deals" description="A focused view of what you’re researching, evaluating, and moving forward."><NewDealLink /></PageHeading><DealsTable deals={deals} counties={[...FLORIDA_COUNTIES]} initialCounty={typeof params.county === "string" && FLORIDA_COUNTIES.some(county => county.fips === params.county) ? params.county : ""} /></>;
}
