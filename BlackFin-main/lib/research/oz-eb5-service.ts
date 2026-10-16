// Import specifiers carry their extension, as lib/workspace/service.ts does, so node --test can load this module
// and exercise the identity boundary against a real database.
import 'server-only';
import { withDatabase } from '../workspace/db.ts';
import { identity } from './service.ts';
import { ResearchValidationError } from './finance.ts';
import {
  OZ_EB5_BENCHMARK, OZ_EB5_VINTAGES, cbsaFromGeocoder, classifySite, currentOzEb5Run, geocodeLayers, hudPolygonsAt,
  noCbsa, ozEb5AssetRows, ozEb5CbsaForCounty, ozEb5GeometryRows, ozEb5MarketRows, ozEb5TractByGeoid, ozEb5TractRows,
  parseOzEb5AssetFilters, parseOzEb5Filters, parseOzEb5Geoid, parseOzEb5Point, parseOzEb5State, toSummary,
  pickLayer, placeFromGeocoder, subdivisionFromGeocoder,
  type OzEb5AssetFilters, type OzEb5Filters, type OzEb5Run, type OzEb5TractRow, type SiteClassification, type SiteGeography,
} from './oz-eb5.ts';
import { currentOz2027Run, notice202640Label, oz2027PicturesFor2010, ozRuralAndEb5Rural } from './oz2027.ts';
import { labelPoint } from '../../scripts/oz2027-lib.mjs';
import type { PoolClient } from 'pg';

// Label points per run: a point inside each tract's display polygon, computed once per (append-only, immutable) run.
const labelMemo = new Map<string, Map<string, [number, number]>>();
export async function ozEb5LabelPoints(client: PoolClient, runId: string) {
  const known = labelMemo.get(runId);
  if (known) return known;
  const result = await client.query('SELECT geoid_2010, display_geometry FROM research_oz_eb5_tracts WHERE run_id=$1 AND display_geometry IS NOT NULL', [runId]);
  const points = new Map<string, [number, number]>(result.rows.map(r => [r.geoid_2010 as string, labelPoint(r.display_geometry) as [number, number]]));
  labelMemo.set(runId, points);
  return points;
}
/** Label points and, when a 2027 run is imported, each row's 2027 picture with the combined rural flag and the 2018-zone notice. */
async function enrich(client: PoolClient, runId: string, rows: OzEb5TractRow[]) {
  if (!rows.length) return rows;
  const labels = await ozEb5LabelPoints(client, runId);
  const run2027 = await currentOz2027Run(client);
  const pictures = run2027 ? await oz2027PicturesFor2010(client, run2027.id, rows.map(r => r.geoid2010)) : null;
  for (const row of rows) {
    const point = labels.get(row.geoid2010);
    row.labelLon = point ? point[0] : null;
    row.labelLat = point ? point[1] : null;
    const picture = pictures?.get(row.geoid2010) ?? null;
    row.oz2027 = picture && { ...picture, ozRuralAndEb5Rural: ozRuralAndEb5Rural(row.eb5RuralClass, picture), notice: notice202640Label(row.countyFips.slice(0, 2)) };
  }
  return rows;
}

const runSummary = (run: OzEb5Run) => ({ id: run.id, importedAt: run.importedAt, importedBy: run.importedBy, scriptSha256: run.scriptSha256, sources: run.sources, counts: run.counts, rule: run.rule });

/**
 * Bounded designated-tract list. Metropolitan tracts are excluded unless the caller asks for them.
 * The raw query string is parsed after identity, so an unauthenticated caller is refused before any
 * filter is inspected and never learns which values this route would have rejected.
 */
export async function ozEb5Tracts(params: URLSearchParams) {
  await identity();
  const filters: OzEb5Filters = parseOzEb5Filters(params);
  return withDatabase(async client => {
    const run = await currentOzEb5Run(client);
    if (!run) return null;
    const { rows, truncated, limit } = await ozEb5TractRows(client, run.id, filters);
    await enrich(client, run.id, rows);
    // summary=1 sends what the list and map draw; the drawer asks for one full row at a time.
    const out = params.get('summary') === '1' ? rows.map(toSummary) : rows;
    return { run: runSummary(run), filters, rows: out, total: rows.length, truncated, limit };
  });
}

/**
 * Bounded layer-4 list: subsidized properties in designated tracts of the same run. An asset row is a geographic
 * and administrative observation; nothing here says a property is available, for sale or a willing counterparty.
 */
export async function ozEb5Assets(params: URLSearchParams) {
  await identity();
  const filters: OzEb5AssetFilters = parseOzEb5AssetFilters(params);
  return withDatabase(async client => {
    const run = await currentOzEb5Run(client);
    if (!run) return null;
    const { rows, truncated, limit } = await ozEb5AssetRows(client, run.id, filters);
    return { run: runSummary(run), filters, rows, total: rows.length, truncated, limit };
  });
}

/** County roll-up of the same run, restricted to counties holding at least one qualifying tract. */
export async function ozEb5Markets(state: string | null) {
  await identity();
  const resolved = parseOzEb5State(state);
  return withDatabase(async client => {
    const run = await currentOzEb5Run(client);
    if (!run) return null;
    return { run: runSummary(run), state: resolved, rows: await ozEb5MarketRows(client, run.id, { state: resolved }) };
  });
}

/** Simplified HUD 2010 polygons for one state. Metropolitan tracts carry no geometry and are never returned. */
export async function ozEb5Geometry(state: string | null) {
  await identity();
  const resolved = parseOzEb5State(state);
  if (!resolved) return null;
  return withDatabase(async client => {
    const run = await currentOzEb5Run(client);
    if (!run) return null;
    const geometry = await ozEb5GeometryRows(client, run.id, resolved);
    return { runId: run.id, state: resolved, ...geometry };
  });
}

/**
 * The geometry route's wrapper: `run` names the run the browser expects, and when it is the current run the response is
 * marked immutable for that browser, because a run's rows never change.
 */
export async function ozEb5GeometryCached(state: string | null, run: string | null) {
  await identity();
  const expected = String(run ?? '').trim();
  if (expected && !/^[a-f0-9]{64}$/.test(expected)) throw new ResearchValidationError('A run identifier is 64 hexadecimal characters.');
  const body = await ozEb5Geometry(state);
  return { body, immutable: !!body && expected === body.runId };
}

export type OzEb5SiteResult = SiteClassification & {
  latitude: number; longitude: number;
  benchmark: string; vintages: typeof OZ_EB5_VINTAGES;
  tract2010: string | null; tract2020: string | null;
  hudOzPolygons: string[]; ozAgreement: 'agree' | 'conflict' | 'unknown';
  countyFips: string; countyName: string; ombKey: string;
  cbsa: SiteGeography['cbsa']; geocoderCbsa: SiteGeography['geocoderCbsa'];
  place: SiteGeography['place']; countySubdivision: SiteGeography['countySubdivision'];
  tract: OzEb5TractRow | null;
  run: ReturnType<typeof runSummary> | null;
  lookupFailed: boolean;
};

/**
 * Server-side point test. Three keyless Census Geocoder calls and one HUD point query, each with its own
 * 15-second timeout, then the reviewed rule set. The tract's screen class is carried alongside the point
 * result so the two are never confused: the tract class is a screen, the point result tests the site.
 */
export async function ozEb5Site(latitude: string | null, longitude: string | null): Promise<OzEb5SiteResult> {
  await identity();
  const { lat, lon } = parseOzEb5Point(latitude, longitude);
  const base = {
    latitude: lat, longitude: lon, benchmark: OZ_EB5_BENCHMARK, vintages: OZ_EB5_VINTAGES,
    tract2010: null as string | null, tract2020: null as string | null, hudOzPolygons: [] as string[],
    ozAgreement: 'unknown' as const, countyFips: '', countyName: '', ombKey: '',
    cbsa: noCbsa, geocoderCbsa: noCbsa, place: null, countySubdivision: null, tract: null,
  };
  return withDatabase(async client => {
    const run = await currentOzEb5Run(client);
    const runInfo = run ? runSummary(run) : null;
    try {
      const [g2020, g2010, current, hud] = await Promise.all([
        geocodeLayers(lon, lat, OZ_EB5_VINTAGES.places),
        geocodeLayers(lon, lat, OZ_EB5_VINTAGES.tract2010),
        geocodeLayers(lon, lat, OZ_EB5_VINTAGES.cbsa),
        hudPolygonsAt(lon, lat),
      ]);
      const tract2010 = pickLayer(g2010, 'Census Tracts')?.GEOID;
      const tract2020 = pickLayer(g2020, 'Census Tracts')?.GEOID;
      const county2020 = pickLayer(g2020, 'Counties');
      const countyCurrent = pickLayer(current, 'Counties');
      const countyFips = county2020 ? String(county2020.GEOID) : '';
      // Connecticut's OMB 2023 key is its planning region, which is the current-vintage "county" at the point.
      const ombKey = countyCurrent ? String(countyCurrent.GEOID) : countyFips;
      const tractId = tract2010 ? String(tract2010) : null;
      const tractRow = run && tractId ? await ozEb5TractByGeoid(client, run.id, tractId) : null;
      if (run && tractRow) await enrich(client, run.id, [tractRow]);
      const geography: SiteGeography = {
        tract2010: tractId,
        tract2020: tract2020 ? String(tract2020) : null,
        countyFips,
        countyName: county2020 ? String(county2020.NAME) : '',
        ombKey,
        cbsa: run ? await ozEb5CbsaForCounty(client, run.id, ombKey) : noCbsa,
        geocoderCbsa: cbsaFromGeocoder(current),
        place: placeFromGeocoder(g2020),
        countySubdivision: subdivisionFromGeocoder(g2020),
        // Membership of the designated list is the imported run itself; with no run there is nothing to test against.
        designated: !tractId || !run ? null : tractRow !== null,
      };
      const classification = classifySite(run ? geography : null);
      if (!run) classification.notes.push('No OZ / EB-5 run is imported, so designated-OZ membership and the tract class were not resolved.');
      return {
        ...base, ...classification,
        tract2010: geography.tract2010, tract2020: geography.tract2020,
        hudOzPolygons: hud,
        ozAgreement: !tractId || !run ? 'unknown' as const : (hud.length > 0) === (tractRow !== null) ? 'agree' as const : 'conflict' as const,
        countyFips: geography.countyFips, countyName: geography.countyName, ombKey: geography.ombKey,
        cbsa: geography.cbsa, geocoderCbsa: geography.geocoderCbsa, place: geography.place, countySubdivision: geography.countySubdivision,
        tract: tractRow, run: runInfo, lookupFailed: false,
      };
    } catch (error) {
      // A failed public lookup is reported as unknown with its reason, never as a rural or non-rural finding.
      const reason = error instanceof Error ? error.message : 'The lookup failed.';
      return {
        ...base, ...classifySite(null), classReason: `Lookup failed: ${reason} No leg of the EB-5 rural test was decided.`,
        run: runInfo, lookupFailed: true,
      };
    }
  });
}

/** One designated tract in full, enriched, for the drawer. Either Bedford identifier finds the same row. */
export async function ozEb5Tract(geoid: string | null) {
  await identity();
  const id = parseOzEb5Geoid(geoid);
  if (!id) throw new ResearchValidationError('A 2010 census tract identifier is exactly eleven digits.');
  return withDatabase(async client => {
    const run = await currentOzEb5Run(client);
    if (!run) return null;
    const row = await ozEb5TractByGeoid(client, run.id, id);
    if (row) await enrich(client, run.id, [row]);
    return { run: runSummary(run), row };
  });
}
