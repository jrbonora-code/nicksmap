import Link from "next/link";
import { ArrowRight, Building2, Database, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { DealStage, Strategy } from "../../lib/workspace/types";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  acquisition: "Acquisition", recapitalization: "Recapitalization", completion: "Completion / stabilization",
  incentives: "Incentive-supported", land: "Land / development",
};
export const STAGE_LABELS: Record<DealStage, string> = { research: "Research", screening: "Screening", diligence: "Diligence", passed: "Passed", closed: "Closed" };
export function centsInput(cents: number) {
  const exact = BigInt(cents);
  const magnitude = exact < 0n ? -exact : exact;
  return `${exact < 0n ? "-" : ""}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}
export function exactDollars(cents: number) {
  const exact = BigInt(cents);
  const magnitude = exact < 0n ? -exact : exact;
  return `${exact < 0n ? "-" : ""}$${new Intl.NumberFormat("en-US").format(magnitude / 100n)}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}
export function money(cents: number | null | undefined, compact = false) {
  if (cents == null || !Number.isFinite(cents)) return "Unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: compact ? 1 : 0, notation: compact ? "compact" : "standard" }).format(cents / 100);
}
export function dateLabel(date: string | null | undefined) {
  if (!date) return "Not recorded";
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00Z` : date);
  return Number.isNaN(parsed.valueOf()) ? "Not recorded" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}
export function StageBadge({ stage }: { stage: DealStage }) {
  return <span className={`badge stage-${stage}`}><span className="badge-dot" />{STAGE_LABELS[stage]}</span>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="page-description">{description}</p></div>{children && <div className="heading-actions">{children}</div>}</header>;
}
export function NewDealLink({ compact = false }: { compact?: boolean }) {
  return <Link href="/deals/new" className="button button-primary"><Plus size={17} /><span>{compact ? "Add deal" : "Add a deal"}</span></Link>;
}
export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon ?? <Building2 size={25} strokeWidth={1.5} />}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Panel({ title, description, action, children, className = "" }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>}{children}</section>;
}
export function UnavailableState() {
  return <><PageHeading eyebrow="Private workspace" title="Your workspace is waiting" description="Sign-in is working. The research database needs to be connected before deal records can be read or saved." /><Panel><EmptyState icon={<Database size={27} />} title="Research storage is not ready" description="The owner needs to configure the workspace database, apply its migrations, and verify recovery. Existing records have not been replaced with sample data." action={<Link className="button button-secondary" href="/settings">View workspace setup <ArrowRight size={16} /></Link>} /></Panel></>;
}
