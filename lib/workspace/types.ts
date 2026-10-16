export const STRATEGIES = ["acquisition", "recapitalization", "completion", "incentives", "land"] as const;
export type Strategy = typeof STRATEGIES[number];
export const DEAL_STAGES = ["research", "screening", "diligence", "passed", "closed"] as const;
export type DealStage = typeof DEAL_STAGES[number];
export type WorkspaceUser = { id: string; name: string; login: string; avatarUrl: string | null };
export type CountyCoverage = { fips: string; name: string; dealCount: number; status: "unverified" | "manual" | "verified"; checkedAt: string | null; sourceUrl: string | null };
export type Deal = {
  id: string; name: string; address: string; countyFips: string; countyName: string;
  strategy: Strategy; stage: DealStage; unitCount: number | null;
  latitude: number | null; longitude: number | null; askingPriceCents: number | null;
  notes: string; nextAction: string; nextActionDue: string | null;
  createdAt: string; updatedAt: string; createdBy: string;
};
export type Evidence = {
  id: string; dealId: string; title: string; sourceUrl: string | null;
  sourceType: "public_record" | "broker" | "owner" | "estimate" | "other";
  effectiveDate: string; retrievedAt: string; notes: string;
  reviewStatus: "unreviewed" | "reviewed" | "conflict";
};
export type ScreeningSnapshot = {
  id: string; dealId: string; label: string; createdAt: string; createdBy: string;
  modelVersion: string; inputs: Record<string, unknown>; result: Record<string, unknown>;
  evidenceIds: string[]; decision: "research" | "advance" | "pass"; reason: string;
  evidenceSnapshots?: Evidence[];
  dealSnapshot?: Record<string, unknown>;
  mandateSnapshot?: Record<string, unknown>;
};
export type WorkspaceSettings = {
  mandate: { status: "unconfigured" | "draft" | "reviewed"; notes: string; updatedAt: string | null };
  recovery: { status: "not_verified" | "verified"; verifiedAt: string | null };
  storageConfigured: boolean;
};
export type WorkspaceOverview = { totalDeals: number; inDiligence: number; countiesWithDeals: number; unreviewedEvidence: number; snapshotCount: number; recentDeals: Deal[] };
export type ActionResult = { ok: true; id?: string; message: string } | { ok: false; message: string; fields?: Record<string, string> };
