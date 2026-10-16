import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { DealForm } from "../../../../components/workspace/forms";
import { PageHeading, Panel, UnavailableState } from "../../../../components/workspace/ui";
import { FLORIDA_COUNTIES } from "../../../../lib/workspace/counties";
import { WorkspaceUnavailableError } from "../../../../lib/workspace/errors";
import { getWorkspaceSettings } from "../../../../lib/workspace/service";

export default async function NewDealPage() {
  try { await getWorkspaceSettings(); } catch (error) { if (error instanceof WorkspaceUnavailableError) return <UnavailableState />; throw error; }
  return <><Link className="back-link" href="/deals"><ArrowLeft size={15} />All opportunities</Link><PageHeading eyebrow="START AN INVESTIGATION" title="Add an opportunity" description="Record what you know. Keep the open questions visible." /><div className="form-layout"><Panel><DealForm counties={[...FLORIDA_COUNTIES]} /></Panel><aside className="form-aside"><Info size={21} /><h3>Start with the facts</h3><p>One working record can represent an acquisition, recapitalization, completion, incentive-supported project, or land opportunity.</p><p>You can add dated evidence and run an annual operating screen after creating the record.</p><div className="aside-divider" /><strong>No assumed answers</strong><p>Leave missing price, unit count, and coordinates blank. Nothing is backfilled with an estimate.</p></aside></div></>;
}
