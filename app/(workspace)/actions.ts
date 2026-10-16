"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceSession } from "../../lib/auth/session.ts";
import { createDeal, updateDeal, addEvidence, saveScreening, saveMandate, previewScreening, saveResearchDecision } from "../../lib/workspace/service.ts";
import { WorkspaceUnavailableError, WorkspaceValidationError } from "../../lib/workspace/errors.ts";
import type { ActionResult } from "../../lib/workspace/types.ts";
import type { CalculationResult } from "../../lib/finance/validation.ts";
import type { OperatingMetrics } from "../../lib/finance/screening.ts";

async function perform(action: (data: FormData) => Promise<ActionResult>, data: FormData): Promise<ActionResult> {
  // Authenticate before parsing or error handling; preserve Next's sign-in redirect behavior.
  await requireWorkspaceSession();
  try {
    const result = await action(data);
    if (result.ok) {
      revalidatePath("/overview"); revalidatePath("/deals", "layout"); revalidatePath("/counties"); revalidatePath("/settings");
    }
    return result;
  } catch (error) {
    if (error instanceof WorkspaceValidationError) return {ok:false,message:error.message,fields:error.fields};
    if (error instanceof WorkspaceUnavailableError) return {ok:false,message:error.message};
    throw error;
  }
}

export async function createDealAction(data: FormData): Promise<ActionResult> { return perform(createDeal,data); }
export async function updateDealAction(data: FormData): Promise<ActionResult> { return perform(updateDeal,data); }
export async function addEvidenceAction(data: FormData): Promise<ActionResult> { return perform(addEvidence,data); }
export async function saveScreeningAction(data: FormData): Promise<ActionResult> { return perform(saveScreening,data); }
export async function saveMandateAction(data: FormData): Promise<ActionResult> { return perform(saveMandate,data); }
export async function saveResearchDecisionAction(data: FormData): Promise<ActionResult> { return perform(saveResearchDecision,data); }

export async function previewScreeningAction(data: FormData): Promise<ActionResult & {calculation?:CalculationResult<OperatingMetrics>}> {
  await requireWorkspaceSession();
  try {
    return {ok:true,message:"Numeric screening preview. Saving recalculates and preserves a separate decision snapshot.",calculation:await previewScreening(data)};
  } catch (error) {
    if (error instanceof WorkspaceValidationError) return {ok:false,message:error.message,fields:error.fields};
    if (error instanceof WorkspaceUnavailableError) return {ok:false,message:error.message};
    throw error;
  }
}
