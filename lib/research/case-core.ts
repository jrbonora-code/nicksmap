import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { WorkspaceValidationError } from '../workspace/errors.ts';
import { runIdempotent } from '../workspace/idempotency.ts';
import { validUuid } from '../workspace/validation.ts';
import type { WorkspaceUser } from '../workspace/types.ts';
import { buildCaseOrigin, prepareCaseVersion, type CaseContent, type CaseOrigin, type CaseVersion, type CaseWriteResult, type StrategyCase, type StrategyCaseSummary } from './case-model.ts';
import { ResearchValidationError, validateScenario } from './finance.ts';
import { validateQuery } from './query.ts';
import type { ResearchProperty, ResearchQuery, Scenario } from './types.ts';

const WORKSPACE = 'primary';
const iso = (v:Date|string) => v instanceof Date ? v.toISOString() : v;
const isPlain = (v:unknown):v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export type { CaseVersion, CaseWriteResult, StrategyCase, StrategyCaseSummary } from './case-model.ts';

export type CreateCaseInput = { requestId:string; snapshotId:string; propertyId:string; debtId:string|null; principalCents:number|null; scenario:Scenario; query:ResearchQuery|null; state:string; content:unknown; reason:string };
export type VersionInput = { requestId:string; expectedVersion:number; state:string; content:unknown; reason:string };

function requireText(value:unknown, key:string, max:number, fields:Record<string,string>, required = true):string {
  if (typeof value !== 'string') { fields[key] = 'Enter text.'; return ''; }
  const text = value.trim(); if ((required && !text) || text.length > max) fields[key] = required ? `Enter a value up to ${max} characters.` : `Use at most ${max} characters.`; return text;
}
function finish(fields:Record<string,string>) { if (Object.keys(fields).length) throw new WorkspaceValidationError('Review the highlighted fields.', fields); }

export function parseCreateCase(value:unknown):CreateCaseInput {
  if (!isPlain(value)) throw new WorkspaceValidationError('Supply the case request as an object.');
  const fields:Record<string,string> = {};
  for (const key of Object.keys(value)) if (!['requestId','snapshotId','propertyId','debtId','principalCents','scenario','query','state','content','reason'].includes(key)) fields[key] = 'Unknown request field.';
  const requestId = requireText(value.requestId,'requestId',36,fields); if (!validUuid(requestId)) fields.requestId = 'A client-generated request UUID is required.';
  const snapshotId = requireText(value.snapshotId,'snapshotId',64,fields); if (!/^[a-f0-9]{64}$/.test(snapshotId)) fields.snapshotId = 'Choose a saved source snapshot.';
  const propertyId = requireText(value.propertyId,'propertyId',90,fields); if (!/^reapi:[\w-]{1,80}$/.test(propertyId)) fields.propertyId = 'Choose a research property record.';
  const debtId = value.debtId === null || value.debtId === undefined ? null : requireText(value.debtId,'debtId',160,fields);
  const principalCents = value.principalCents === null || value.principalCents === undefined ? null : value.principalCents;
  if (principalCents !== null && (typeof principalCents !== 'number' || !Number.isSafeInteger(principalCents) || principalCents <= 0 || principalCents > 1e12)) fields.principalCents = 'Scenario debt must be positive whole cents, at most USD 10 billion.';
  let scenario:Scenario|null = null;
  try { scenario = validateScenario(value.scenario); } catch (error) { fields.scenario = error instanceof ResearchValidationError ? error.message : 'Supply financing assumptions.'; }
  // The active research filters are part of the origin; they cannot be recovered later, so they are required.
  let query:ResearchQuery|null = null;
  try { query = validateQuery(value.query); } catch (error) { fields.query = error instanceof ResearchValidationError ? error.message : 'Supply the research filters the case was opened from.'; }
  const state = requireText(value.state,'state',40,fields);
  const reason = requireText(value.reason,'reason',10000,fields);
  finish(fields);
  return { requestId, snapshotId, propertyId, debtId, principalCents: principalCents as number|null, scenario: scenario!, query, state, content: value.content, reason };
}
export function parseVersionInput(value:unknown):VersionInput {
  if (!isPlain(value)) throw new WorkspaceValidationError('Supply the case version as an object.');
  const fields:Record<string,string> = {};
  for (const key of Object.keys(value)) if (!['requestId','expectedVersion','state','content','reason'].includes(key)) fields[key] = 'Unknown request field.';
  const requestId = requireText(value.requestId,'requestId',36,fields); if (!validUuid(requestId)) fields.requestId = 'A client-generated request UUID is required.';
  const expectedVersion = value.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) fields.expectedVersion = 'Reload the case before saving so its current version is known.';
  const state = requireText(value.state,'state',40,fields);
  const reason = requireText(value.reason,'reason',10000,fields);
  finish(fields);
  return { requestId, expectedVersion: expectedVersion as number, state, content: value.content, reason };
}

function mapVersion(row:QueryResultRow):CaseVersion {
  return { version:row.version, state:row.state, lane:row.lane, modelVersion:row.model_version, content:row.content, reason:row.reason, createdAt:iso(row.created_at), createdBy:row.created_by };
}
async function insertVersion(client:PoolClient, actor:WorkspaceUser, caseId:string, version:number, prepared:ReturnType<typeof prepareCaseVersion>, reason:string) {
  await client.query('INSERT INTO research_strategy_case_versions(case_id,version,state,lane,model_version,content,reason,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())',
    [caseId,version,prepared.state,prepared.lane,prepared.modelVersion,JSON.stringify(prepared.content),reason,actor.id]);
}
async function audit(client:PoolClient, actor:WorkspaceUser, event:'case.created'|'case.versioned', entityId:string, detail:unknown) {
  await client.query('INSERT INTO workspace_audit(id,workspace_id,actor_id,actor_login,event,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),WORKSPACE,actor.id,actor.login,event,entityId,JSON.stringify(detail)]);
}

/** Create a case from an existing snapshot record. Runs inside the caller's transaction. */
export async function createCase(client:PoolClient, actor:WorkspaceUser, input:CreateCaseInput, now:Date = new Date()):Promise<CaseWriteResult> {
  return runIdempotent(client, actor, 'case.created', input, async () => {
    const found = await client.query('SELECT s.id,s.source_date,s.imported_at,p.record,p.detail FROM research_snapshot_properties p JOIN research_snapshots s ON s.id=p.snapshot_id WHERE p.snapshot_id=$1 AND p.property_id=$2 AND p.in_region',[input.snapshotId,input.propertyId]);
    const row = found.rows[0];
    if (!row) throw new WorkspaceValidationError('That property record is not in the selected source snapshot.', {propertyId:'Select a property from the saved snapshot before opening a case.'});
    const origin = buildCaseOrigin({ snapshot:{id:row.id,sourceDate:iso(row.source_date),importedAt:iso(row.imported_at)}, record:row.record as ResearchProperty, detail:row.detail, debtId:input.debtId, principalCents:input.principalCents, scenario:input.scenario, query:input.query, capturedAt:now.toISOString() });
    const prepared = prepareCaseVersion(input.state, input.content, origin);
    const id = randomUUID();
    await client.query('INSERT INTO research_strategy_cases(id,workspace_id,snapshot_id,property_id,debt_id,origin,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',[id,WORKSPACE,input.snapshotId,input.propertyId,origin.debt?.id ?? null,JSON.stringify(origin),actor.id]);
    await insertVersion(client, actor, id, 1, prepared, input.reason);
    await audit(client, actor, 'case.created', id, {propertyId:input.propertyId,snapshotId:input.snapshotId,debtId:origin.debt?.id ?? null,state:prepared.state,lane:prepared.lane});
    return { ok:true, id, version:1, message:'Case opened with its research origin fixed. Later saves append versions; nothing is overwritten.' };
  });
}

/** Append a version. The case row is locked so concurrent saves against the same expected version cannot both succeed. */
export async function appendCaseVersion(client:PoolClient, actor:WorkspaceUser, caseId:string, input:VersionInput):Promise<CaseWriteResult> {
  if (!validUuid(caseId)) throw new WorkspaceValidationError('This case is unavailable in the current workspace.');
  return runIdempotent(client, actor, 'case.versioned', {...input, caseId}, async () => {
    const found = await client.query('SELECT id,origin FROM research_strategy_cases WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[WORKSPACE,caseId]);
    if (!found.rows[0]) throw new WorkspaceValidationError('This case is unavailable in the current workspace.');
    const latest = Number((await client.query('SELECT max(version)::int AS v FROM research_strategy_case_versions WHERE case_id=$1',[caseId])).rows[0].v);
    if (latest !== input.expectedVersion) throw new WorkspaceValidationError('This case changed after you opened it. Reload and review the latest version before saving.', {expectedVersion:`Saved version is ${latest}.`});
    const prepared = prepareCaseVersion(input.state, input.content, found.rows[0].origin as CaseOrigin);
    const version = latest + 1;
    await insertVersion(client, actor, caseId, version, prepared, input.reason);
    await audit(client, actor, 'case.versioned', caseId, {version,state:prepared.state,lane:prepared.lane});
    return { ok:true, id:caseId, version, message:`Version ${version} saved as ${prepared.state.replaceAll('_',' ')}. Earlier versions and the research origin are retained.` };
  });
}

export async function readCase(client:PoolClient, id:string):Promise<StrategyCase|null> {
  if (!validUuid(id)) return null;
  const head = (await client.query('SELECT * FROM research_strategy_cases WHERE workspace_id=$1 AND id=$2',[WORKSPACE,id])).rows[0];
  if (!head) return null;
  const versions = (await client.query('SELECT * FROM research_strategy_case_versions WHERE case_id=$1 ORDER BY version DESC',[id])).rows.map(mapVersion);
  return { id:head.id, snapshotId:head.snapshot_id, propertyId:head.property_id, debtId:head.debt_id, createdAt:iso(head.created_at), createdBy:head.created_by, origin:head.origin, current:versions[0], versions };
}

export async function listCases(client:PoolClient, filter:{propertyId?:string} = {}):Promise<StrategyCaseSummary[]> {
  const rows = (await client.query(`SELECT c.id,c.snapshot_id,c.property_id,c.debt_id,c.created_at,c.origin,v.version,v.state,v.lane,v.content,v.created_at AS version_at,v.created_by AS version_by
    FROM research_strategy_cases c JOIN LATERAL (SELECT * FROM research_strategy_case_versions x WHERE x.case_id=c.id ORDER BY x.version DESC LIMIT 1) v ON true
    WHERE c.workspace_id=$1 AND ($2::text IS NULL OR c.property_id=$2) ORDER BY v.created_at DESC, c.id`,[WORKSPACE,filter.propertyId ?? null])).rows;
  return rows.map(r => { const o = r.origin as CaseOrigin, c = r.content as CaseContent; return { id:r.id, snapshotId:r.snapshot_id, propertyId:r.property_id, debtId:r.debt_id, address:o.property.address, countyName:o.property.countyName, principalCents:o.principalCents, amountBasis:o.amountBasis, sharedPropertyCount:o.debt?.sharedPropertyCount ?? null, instrumentConflict:o.debt?.instrumentConflict ?? null, reportedMaturity:o.debt?.maturity ?? null, createdAt:iso(r.created_at), version:r.version, state:r.state, lane:r.lane, label:c.label, payerType:c.payerType, operatorRole:c.operatorRole, nextAction:c.nextAction, nextActionDue:c.nextActionDue, missingInputs:c.missingInputs.length, evidenceEntries:Array.isArray(c.evidence) ? c.evidence.length : 0, versionAt:iso(r.version_at), versionBy:r.version_by }; });
}
