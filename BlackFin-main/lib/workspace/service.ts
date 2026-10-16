import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { requireWorkspaceSession } from "../auth/session.ts";
import { withDatabase } from "./db.ts";
import { WorkspaceValidationError } from "./errors.ts";
import { runIdempotent } from "./idempotency.ts";
import { parseDealForm, parseEvidenceForm, parseScreeningForm, parseScreeningPreviewForm, parseResearchDecisionForm, parseMandateForm, validUuid } from "./validation.ts";
import { prepareSnapshot, prepareResearchDecision } from "./snapshot.ts";
import { calculateOperatingMetrics } from "../finance/screening.ts";
import type { ActionResult, CountyCoverage, Deal, Evidence, ScreeningSnapshot, WorkspaceOverview, WorkspaceSettings, WorkspaceUser } from "./types.ts";

const WORKSPACE = "primary";
const DEAL_SELECT = `SELECT d.*, c.name AS county_name FROM workspace_deals d JOIN workspace_counties c ON c.fips=d.county_fips`;
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
const date = (value: Date | string | null) => value === null ? null : iso(value).slice(0,10);
const integer = (value: string | number | null) => value === null ? null : Number(value);

function mapDeal(row: QueryResultRow): Deal {
  return {id:row.id,name:row.name,address:row.address,countyFips:row.county_fips,countyName:row.county_name,
    strategy:row.strategy,stage:row.stage,unitCount:row.unit_count,latitude:row.latitude,longitude:row.longitude,
    askingPriceCents:integer(row.asking_price_cents),notes:row.notes,nextAction:row.next_action,nextActionDue:date(row.next_action_due),
    createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),createdBy:row.created_by};
}
function mapEvidence(row: QueryResultRow): Evidence {
  return {id:row.id,dealId:row.deal_id,title:row.title,sourceUrl:row.source_url,sourceType:row.source_type,
    effectiveDate:date(row.effective_date)!,retrievedAt:iso(row.retrieved_at),notes:row.notes,reviewStatus:row.review_status};
}
function mapSnapshot(row: QueryResultRow): ScreeningSnapshot {
  return {id:row.id,dealId:row.deal_id,label:row.label,createdAt:iso(row.created_at),createdBy:row.created_by,
    modelVersion:row.model_version,inputs:row.inputs,result:row.result,evidenceIds:row.evidence_ids,
    evidenceSnapshots:row.evidence_snapshots,dealSnapshot:row.deal_snapshot,mandateSnapshot:row.mandate_snapshot,decision:row.decision,reason:row.reason};
}
async function findDeal(client: PoolClient, id: string, lock = false): Promise<Deal | null> {
  if (!validUuid(id)) return null;
  const result = await client.query(`${DEAL_SELECT} WHERE d.workspace_id=$1 AND d.id=$2${lock ? " FOR UPDATE OF d" : ""}`, [WORKSPACE,id]);
  return result.rows[0] ? mapDeal(result.rows[0]) : null;
}
async function requiredDeal(client: PoolClient, id: string) {
  const deal = await findDeal(client,id,true);
  if (!deal) throw new WorkspaceValidationError("This deal is unavailable in the current workspace.");
  return deal;
}
async function mandateFor(client: PoolClient, lock = false): Promise<WorkspaceSettings["mandate"]> {
  const result = await client.query(`SELECT status, notes, updated_at FROM workspace_mandate WHERE workspace_id=$1${lock ? " FOR UPDATE" : ""}`,[WORKSPACE]);
  const row = result.rows[0];
  return row ? {status:row.status,notes:row.notes,updatedAt:row.updated_at ? iso(row.updated_at) : null} : {status:"unconfigured",notes:"",updatedAt:null};
}

export async function getWorkspaceOverview(): Promise<WorkspaceOverview> {
  await requireWorkspaceSession();
  return withDatabase(async client => {
    const totals = await client.query(`SELECT count(*)::int AS total_deals, count(*) FILTER (WHERE stage='diligence')::int AS in_diligence,
      count(DISTINCT county_fips)::int AS counties_with_deals FROM workspace_deals WHERE workspace_id=$1`,[WORKSPACE]);
    const evidence = await client.query("SELECT count(*)::int AS total FROM workspace_evidence WHERE workspace_id=$1 AND review_status<>'reviewed'",[WORKSPACE]);
    const snapshots = await client.query("SELECT count(*)::int AS total FROM workspace_screening_snapshots WHERE workspace_id=$1",[WORKSPACE]);
    const recent = await client.query(`${DEAL_SELECT} WHERE d.workspace_id=$1 ORDER BY d.updated_at DESC,d.id LIMIT 6`,[WORKSPACE]);
    return {totalDeals:totals.rows[0].total_deals,inDiligence:totals.rows[0].in_diligence,countiesWithDeals:totals.rows[0].counties_with_deals,
      unreviewedEvidence:evidence.rows[0].total,snapshotCount:snapshots.rows[0].total,recentDeals:recent.rows.map(mapDeal)};
  });
}
export async function listDeals(): Promise<Deal[]> {
  await requireWorkspaceSession();
  return withDatabase(async client => (await client.query(`${DEAL_SELECT} WHERE d.workspace_id=$1 ORDER BY d.updated_at DESC,d.id`,[WORKSPACE])).rows.map(mapDeal));
}
export async function listCountyCoverage(): Promise<CountyCoverage[]> {
  await requireWorkspaceSession();
  return withDatabase(async client => {
    const result = await client.query(`SELECT c.fips,c.name,count(d.id)::int AS deal_count FROM workspace_counties c
      LEFT JOIN workspace_deals d ON d.county_fips=c.fips AND d.workspace_id=$1 GROUP BY c.fips,c.name ORDER BY c.name`,[WORKSPACE]);
    return result.rows.map(row => ({fips:row.fips,name:row.name,dealCount:row.deal_count,status:row.deal_count ? "manual" : "unverified",checkedAt:null,sourceUrl:null}));
  });
}
export async function getDeal(id: string): Promise<Deal | null> {
  await requireWorkspaceSession();
  return withDatabase(client => findDeal(client,id));
}
export async function listEvidence(dealId: string): Promise<Evidence[]> {
  await requireWorkspaceSession();
  return withDatabase(async client => {
    if (!await findDeal(client,dealId)) return [];
    const result = await client.query("SELECT * FROM workspace_evidence WHERE workspace_id=$1 AND deal_id=$2 ORDER BY created_at DESC,id",[WORKSPACE,dealId]);
    return result.rows.map(mapEvidence);
  });
}
export async function listSnapshots(dealId: string): Promise<ScreeningSnapshot[]> {
  await requireWorkspaceSession();
  return withDatabase(async client => {
    if (!await findDeal(client,dealId)) return [];
    const result = await client.query("SELECT * FROM workspace_screening_snapshots WHERE workspace_id=$1 AND deal_id=$2 ORDER BY created_at DESC,id",[WORKSPACE,dealId]);
    return result.rows.map(mapSnapshot);
  });
}
export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  await requireWorkspaceSession();
  return withDatabase(async client => ({mandate:await mandateFor(client),recovery:{status:"not_verified",verifiedAt:null},storageConfigured:false}));
}

export async function previewScreening(data: FormData) {
  await requireWorkspaceSession();
  const input = parseScreeningPreviewForm(data);
  await withDatabase(async client => {
    if (!await findDeal(client,input.dealId)) throw new WorkspaceValidationError("This deal is unavailable in the current workspace.");
  });
  const calculation = calculateOperatingMetrics(input.inputs);
  if (!calculation.ok) throw new WorkspaceValidationError("Correct the screening inputs before reviewing results.",Object.fromEntries(calculation.issues.filter(issue => issue.severity === "error").map(issue => [issue.path.replace(/Cents$/, ""),issue.message])));
  return calculation;
}

async function audit(client: PoolClient, actor: WorkspaceUser, event: string, entityId: string, detail: unknown) {
  await client.query("INSERT INTO workspace_audit(id,workspace_id,actor_id,actor_login,event,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [randomUUID(),WORKSPACE,actor.id,actor.login,event,entityId,JSON.stringify(detail)]);
}
async function mutate<T extends {requestId:string}>(actor: WorkspaceUser, operation: string, input: T, run: (client:PoolClient) => Promise<ActionResult>): Promise<ActionResult> {
  return withDatabase(client => runIdempotent(client,actor,operation,input,() => run(client)),true);
}
async function checkStage(client: PoolClient, dealId: string | undefined, stage: Deal["stage"]) {
  if (["research","screening"].includes(stage)) return;
  const decision = stage === "passed" ? "pass" : "advance";
  const snapshot = dealId ? await client.query("SELECT decision FROM workspace_screening_snapshots WHERE workspace_id=$1 AND deal_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[WORKSPACE,dealId]) : null;
  if (snapshot?.rows[0]?.decision !== decision) throw new WorkspaceValidationError("Save a reasoned screening decision before moving to this stage.",{stage:`The latest saved decision must be ${decision}, with frozen evidence.`});
}

export async function createDeal(data: FormData): Promise<ActionResult> {
  const actor = await requireWorkspaceSession();
  const input = parseDealForm(data);
  return mutate(actor,"deal.created",input,async client => {
    await checkStage(client,undefined,input.stage);
    const id = randomUUID();
    await client.query(`INSERT INTO workspace_deals(id,workspace_id,name,address,county_fips,strategy,stage,unit_count,latitude,longitude,
      asking_price_cents,notes,next_action,next_action_due,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id,WORKSPACE,input.name,input.address,input.countyFips,input.strategy,input.stage,input.unitCount,input.latitude,input.longitude,
        input.askingPriceCents,input.notes,input.nextAction,input.nextActionDue,actor.id]);
    await audit(client,actor,"deal.created",id,{after:await findDeal(client,id)});
    return {ok:true,id,message:"Deal saved to the private workspace."};
  });
}
export async function updateDeal(data: FormData): Promise<ActionResult> {
  const actor = await requireWorkspaceSession();
  const input = parseDealForm(data,true);
  return mutate(actor,"deal.updated",input,async client => {
    const before = await requiredDeal(client,input.id!);
    if (before.updatedAt !== input.expectedUpdatedAt) throw new WorkspaceValidationError("This deal changed after you opened it. Reload and review the latest values before saving your changes.");
    await checkStage(client,before.id,input.stage);
    await client.query(`UPDATE workspace_deals SET name=$3,address=$4,county_fips=$5,strategy=$6,stage=$7,unit_count=$8,latitude=$9,longitude=$10,
      asking_price_cents=$11,notes=$12,next_action=$13,next_action_due=$14,updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',updated_at)+interval '1 millisecond') WHERE workspace_id=$1 AND id=$2`,
      [WORKSPACE,before.id,input.name,input.address,input.countyFips,input.strategy,input.stage,input.unitCount,input.latitude,input.longitude,
        input.askingPriceCents,input.notes,input.nextAction,input.nextActionDue]);
    await audit(client,actor,"deal.updated",before.id,{before,after:await findDeal(client,before.id)});
    return {ok:true,id:before.id,message:"Deal updated. Existing screening snapshots retain their original inputs and evidence."};
  });
}
export async function addEvidence(data: FormData): Promise<ActionResult> {
  const actor = await requireWorkspaceSession();
  const input = parseEvidenceForm(data);
  return mutate(actor,"evidence.added",input,async client => {
    await requiredDeal(client,input.dealId);
    const id = randomUUID();
    await client.query(`INSERT INTO workspace_evidence(id,workspace_id,deal_id,title,source_url,source_type,effective_date,retrieved_at,notes,review_status,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,WORKSPACE,input.dealId,input.title,input.sourceUrl,input.sourceType,input.effectiveDate,input.retrievedAt,input.notes,input.reviewStatus,actor.id]);
    await audit(client,actor,"evidence.added",id,{dealId:input.dealId,title:input.title,reviewStatus:input.reviewStatus});
    return {ok:true,id,message:"Dated evidence metadata saved. Documents and uploads remain unavailable."};
  });
}
export async function saveScreening(data: FormData): Promise<ActionResult> {
  const actor = await requireWorkspaceSession();
  const input = parseScreeningForm(data);
  return mutate(actor,"screening.saved",input,async client => {
    const deal = await requiredDeal(client,input.dealId);
    const evidence = (await client.query("SELECT * FROM workspace_evidence WHERE workspace_id=$1 AND deal_id=$2 AND id=ANY($3::uuid[]) ORDER BY id",[WORKSPACE,deal.id,input.evidenceIds])).rows.map(mapEvidence);
    const snapshot = prepareSnapshot(input,deal,evidence,await mandateFor(client));
    const id = randomUUID();
    await client.query(`INSERT INTO workspace_screening_snapshots(id,workspace_id,deal_id,label,model_version,inputs,result,evidence_ids,evidence_snapshots,deal_snapshot,mandate_snapshot,decision,reason,created_by,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp())`,[id,WORKSPACE,deal.id,snapshot.label,snapshot.modelVersion,JSON.stringify(snapshot.inputs),JSON.stringify(snapshot.result),snapshot.evidenceIds,
      JSON.stringify(snapshot.evidenceSnapshots),JSON.stringify(snapshot.dealSnapshot),JSON.stringify(snapshot.mandateSnapshot),snapshot.decision,snapshot.reason,actor.id]);
    await audit(client,actor,"screening.saved",id,{dealId:deal.id,modelVersion:snapshot.modelVersion,decision:snapshot.decision,reason:snapshot.reason});
    return {ok:true,id,message:"Screening and human decision saved with immutable inputs, results and source metadata."};
  });
}
export async function saveMandate(data: FormData): Promise<ActionResult> {
  const actor = await requireWorkspaceSession();
  const input = parseMandateForm(data);
  return mutate(actor,"mandate.drafted",input,async client => {
    const before = await mandateFor(client,true);
    if (before.updatedAt !== input.expectedUpdatedAt) throw new WorkspaceValidationError("The mandate changed after you opened it. Reload and review the latest draft before saving your changes.",{expectedUpdatedAt:"Reload and review the latest mandate before saving."});
    await client.query("UPDATE workspace_mandate SET notes=$2,status='draft',updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',updated_at)+interval '1 millisecond'),updated_by=$3 WHERE workspace_id=$1",[WORKSPACE,input.notes,actor.id]);
    await audit(client,actor,"mandate.drafted",WORKSPACE,{before,after:{status:"draft",notes:input.notes}});
    return {ok:true,message:"Mandate saved as a draft. Investment policy and financial reference review remain open."};
  });
}

export async function saveResearchDecision(data: FormData): Promise<ActionResult> {
  const actor = await requireWorkspaceSession();
  const input = parseResearchDecisionForm(data);
  return mutate(actor,"research.decision",input,async client => {
    const deal = await requiredDeal(client,input.dealId);
    const evidence = (await client.query("SELECT * FROM workspace_evidence WHERE workspace_id=$1 AND deal_id=$2 AND id=ANY($3::uuid[]) ORDER BY id",[WORKSPACE,deal.id,input.evidenceIds])).rows.map(mapEvidence);
    const snapshot = prepareResearchDecision(input,deal,evidence,await mandateFor(client));
    const id = randomUUID();
    await client.query(`INSERT INTO workspace_screening_snapshots(id,workspace_id,deal_id,label,model_version,inputs,result,evidence_ids,evidence_snapshots,deal_snapshot,mandate_snapshot,decision,reason,created_by,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp())`,[id,WORKSPACE,deal.id,snapshot.label,snapshot.modelVersion,JSON.stringify(snapshot.inputs),JSON.stringify(snapshot.result),snapshot.evidenceIds,
      JSON.stringify(snapshot.evidenceSnapshots),JSON.stringify(snapshot.dealSnapshot),JSON.stringify(snapshot.mandateSnapshot),snapshot.decision,snapshot.reason,actor.id]);
    await audit(client,actor,"screening.saved",id,{dealId:deal.id,modelVersion:snapshot.modelVersion,decision:snapshot.decision,reason:snapshot.reason,financialCalculation:"not_calculated"});
    return {ok:true,id,message:"Research decision saved with dated evidence. Unknown financial inputs remain unknown."};
  });
}
