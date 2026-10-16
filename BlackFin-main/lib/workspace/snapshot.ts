import { calculateOperatingMetrics } from "../finance/screening.ts";
import { WorkspaceValidationError } from "./errors.ts";
import type { Deal, Evidence, WorkspaceSettings } from "./types.ts";
import type { parseScreeningForm, parseResearchDecisionForm } from "./validation.ts";

function checkEvidence(input: {dealId:string;evidenceIds:string[]},deal:Deal,evidence:Evidence[]) {
  if (deal.id !== input.dealId || evidence.length < 1 || evidence.length !== input.evidenceIds.length || evidence.some(item => item.dealId !== deal.id || !input.evidenceIds.includes(item.id)) || new Set(evidence.map(item => item.id)).size !== evidence.length) {
    throw new WorkspaceValidationError("Every selected evidence record must belong to this deal.", {evidenceIds:"Select evidence from this deal only."});
  }
}

/** Recalculate trusted outputs and copy dated source content, not only mutable source IDs. */
export function prepareSnapshot(input: ReturnType<typeof parseScreeningForm>, deal: Deal, evidence: Evidence[], mandate: WorkspaceSettings["mandate"]) {
  checkEvidence(input,deal,evidence);
  if (input.decision === "advance" && evidence.some(item => item.reviewStatus !== "reviewed")) {
    throw new WorkspaceValidationError("Advancing an investigation requires reviewed evidence with no selected unresolved conflicts.", {evidenceIds:"Use reviewed evidence, or keep the decision in research."});
  }
  const result = calculateOperatingMetrics(input.inputs);
  if (!result.ok) {
    const fields = Object.fromEntries(result.issues.filter(issue => issue.severity === "error").map(issue => [issue.path.replace(/Cents$/, ""),issue.message]));
    throw new WorkspaceValidationError("Screening could not be calculated. Correct the inputs before saving.",fields);
  }
  // Clone at this boundary so later corrections cannot alter the snapshot in memory either.
  return structuredClone({
    label:input.label, inputs:input.inputs, result, modelVersion:result.modelVersion,
    evidenceIds:input.evidenceIds, evidenceSnapshots:evidence, dealSnapshot:deal, mandateSnapshot:mandate,
    decision:input.decision, reason:input.reason,
  });
}

export function prepareResearchDecision(input:ReturnType<typeof parseResearchDecisionForm>,deal:Deal,evidence:Evidence[],mandate:WorkspaceSettings["mandate"]) {
  checkEvidence(input,deal,evidence);
  return structuredClone({label:input.label,inputs:{},result:{availability:"not_calculated",reason:"Qualitative research decision; financial inputs not supplied."},
    modelVersion:"research-decision-1.0.0",evidenceIds:input.evidenceIds,evidenceSnapshots:evidence,dealSnapshot:deal,mandateSnapshot:mandate,decision:input.decision,reason:input.reason});
}
