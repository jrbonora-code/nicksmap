import { notFound } from "next/navigation";
import { DealDetail } from "../../../../components/workspace/deal-detail";
import { UnavailableState } from "../../../../components/workspace/ui";
import { FLORIDA_COUNTIES } from "../../../../lib/workspace/counties";
import { WorkspaceUnavailableError } from "../../../../lib/workspace/errors";
import { getDeal, listEvidence, listSnapshots } from "../../../../lib/workspace/service";

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  let deal, evidence, snapshots;
  try {
    deal = await getDeal(id);
    if (!deal) notFound();
    [evidence, snapshots] = await Promise.all([listEvidence(id), listSnapshots(id)]);
  } catch (error) { if (error instanceof WorkspaceUnavailableError) return <UnavailableState />; throw error; }
  return <DealDetail deal={deal} evidence={evidence} snapshots={snapshots} counties={[...FLORIDA_COUNTIES]} initialTab={query.tab} />;
}
