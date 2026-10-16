// Identity-checked service layer for the national 2027 OZ round (migration 009). Every entry point calls identity()
// before it inspects a parameter, so an unauthenticated caller learns nothing about which values would be rejected.
import 'server-only';
import { withDatabase } from '../workspace/db.ts';
import { identity } from './service.ts';
import { currentOzEb5Run, parseOzEb5State } from './oz-eb5.ts';
import {
  currentOz2027Run, oz2027Geometry, oz2027Points, oz2027StateRows, oz2027TractDetail, oz2027TractRows,
  parseOz2027Bbox, parseOz2027Filters, parseOz2027Geoid, parseOz2027RunId, type Oz2027Run,
} from './oz2027.ts';
import { ResearchValidationError } from './finance.ts';

const runSummary = (run: Oz2027Run) => ({ id: run.id, importedAt: run.importedAt, importedBy: run.importedBy, parserVersion: run.parserVersion, treasurySha256: run.treasurySha256, counts: run.counts, rule: run.rule });

/** Bounded tract list with the filters echoed, the full matching count and the truncation flag. */
export async function oz2027Tracts(params: URLSearchParams) {
  await identity();
  const filters = parseOz2027Filters(params);
  return withDatabase(async client => {
    const run = await currentOz2027Run(client);
    if (!run) return null;
    const eb5 = await currentOzEb5Run(client);
    const result = await oz2027TractRows(client, run.id, eb5?.id ?? null, filters);
    return { run: runSummary(run), eb5RunId: eb5?.id ?? null, filters, ...result };
  });
}

/** One row per jurisdiction with this run's tier counts, plus every source the manifest names (shipped or withheld). */
export async function oz2027States() {
  await identity();
  return withDatabase(async client => {
    const run = await currentOz2027Run(client);
    if (!run) return null;
    return { run: runSummary(run), states: await oz2027StateRows(client, run.id), sources: run.sources };
  });
}

/**
 * Display polygons for one state or one bounding box. `run` names the run the caller expects; when it matches the
 * current run the response is immutable for the browser to cache, because a run's rows never change.
 */
export async function oz2027GeometryFor(params: URLSearchParams) {
  await identity();
  const state = parseOzEb5State(params.get('state'));
  const bbox = parseOz2027Bbox(params.get('bbox'));
  const runParam = parseOz2027RunId(params.get('run'));
  if (!state === !bbox) throw new ResearchValidationError('Ask for exactly one of state or bbox.');
  return withDatabase(async client => {
    const run = await currentOz2027Run(client);
    if (!run) return { body: null, immutable: false };
    const geometry = await oz2027Geometry(client, run.id, state ? { state } : { bbox: bbox! });
    return { body: { runId: run.id, state, bbox, ...geometry }, immutable: runParam === run.id };
  });
}

/** The drawer payload for one 2020 tract: every signal with its source, the state, and the 2018 overlap with its notice. */
export async function oz2027Tract(geoid: string | null) {
  await identity();
  const id = parseOz2027Geoid(geoid);
  return withDatabase(async client => {
    const run = await currentOz2027Run(client);
    if (!run) return null;
    const eb5 = await currentOzEb5Run(client);
    return { run: runSummary(run), ...(await oz2027TractDetail(client, run, eb5?.id ?? null, id)) };
  });
}

/** The national point view: one label point per eligible tract, immutable for a request naming the current run. */
export async function oz2027PointsFor(params: URLSearchParams) {
  await identity();
  const runParam = parseOz2027RunId(params.get('run'));
  return withDatabase(async client => {
    const run = await currentOz2027Run(client);
    if (!run) return { body: null, immutable: false };
    return { body: { runId: run.id, ...(await oz2027Points(client, run.id)) }, immutable: runParam === run.id };
  });
}
