import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState, Panel } from "../../../../components/workspace/ui";

export default function DealNotFound() {
  return <Panel><EmptyState title="This opportunity was not found" description="The link may be incomplete, or the record may no longer be available in this workspace." action={<Link className="button button-secondary" href="/deals"><ArrowLeft size={15} />Return to deals</Link>} /></Panel>;
}
