// National 2027 Opportunity Zone round inside the workspace (migration 009).
//
// The tract universe is Treasury's revised eligible list of September 23, 2026 on 2020 boundaries. A tract's headline
// status is the best tier among the signals the shipped sources carry for it; eligibility is not nomination, a
// nomination is not a designation, and nothing here is a property-level tax benefit. The OZ 2.0 rural flag
// (Treasury rural_status) is a different statute from EB-5 rural and never substitutes for it: the combined flag below
// requires both, each from its own source.
//
// Client-safe: no Node built-in is imported here. The reads take a caller's client; identity is checked in
// oz2027-service.ts before any parameter is inspected.
import type { PoolClient } from 'pg';
import { ResearchValidationError } from './finance.ts';
import { parseOzEb5State, type OzEb5Class } from './oz-eb5.ts';

/** Best first. scripts/oz2027-lib.mjs carries the same list; tests/research/oz2027.test.ts proves they agree. */
export const OZ2027_TIERS = ['certified', 'nominated', 'state_recommended', 'draft_for_comment', 'local_recommended', 'eligible'] as const;
export type Oz2027Tier = typeof OZ2027_TIERS[number];
export const OZ2027_SIGNAL_TIERS = OZ2027_TIERS.slice(0, -1) as Exclude<Oz2027Tier, 'eligible'>[];
export const OZ2027_CONFIDENCE = ['high', 'medium', 'low', 'unverified'] as const;
export type Oz2027Confidence = typeof OZ2027_CONFIDENCE[number];
export const OZ2027_TIER_LABELS: Record<Oz2027Tier, string> = {
  certified: 'Certified', nominated: 'Nominated', state_recommended: 'State recommended', draft_for_comment: 'Draft for comment',
  local_recommended: 'Local recommendation', eligible: 'Eligible',
};
/** Below this share of a 2010 tract's land a 2020 successor is a sliver: it is shown in the detail, never badged. */
export const OZ2027_LAND_SHARE_THRESHOLD_PCT = 1;
/** The screen's own sliver filter for the 20,000 place test (0.0005 of the 2010 tract's land), in percent. */
export const OZ_EB5_PLACE_TEST_FILTER_PCT = 0.05;
export const tierRank = (tier: Oz2027Tier) => OZ2027_TIERS.indexOf(tier);
export const isTier = (value: unknown): value is Oz2027Tier => typeof value === 'string' && (OZ2027_TIERS as readonly string[]).includes(value);

// ---------- IRS Notice 2026-40 and the 2018 zones ----------
export const NOTICE_2026_40_URL = 'https://www.irs.gov/pub/irs-drop/n-26-40.pdf';
export type Notice202640Label = { text: string; zone: string; ends: string; endDate: string; rule: string; citation: string; url: string };
/**
 * The label every 2018-designated tract carries. 26 U.S.C. 1400Z-1 (former subsection (f)) ends a 2018 designation at the
 * close of the tenth calendar year beginning on or after designation: December 31, 2028 for the states certified in
 * 2018, and December 31, 2027 for Puerto Rico, whose low-income tracts were deemed designated on December 22, 2017.
 */
export function notice202640Label(stateFips = ''): Notice202640Label {
  const puertoRico = stateFips === '72';
  const ends = puertoRico ? '12/31/2027' : '12/31/2028';
  const rule = "new purchases after 12/31/2026 generally don't qualify";
  return {
    text: `2018 zone · ends ${ends} · ${rule} (IRS Notice 2026-40)`,
    zone: '2018 zone', ends: `Ends ${ends}`, endDate: puertoRico ? '2027-12-31' : '2028-12-31',
    rule: rule[0].toUpperCase() + rule.slice(1), citation: 'IRS Notice 2026-40', url: NOTICE_2026_40_URL,
  };
}

// ---------- land shares: the 2027 picture of one 2018-designated 2010 tract ----------
export type Oz2027Successor = { geoid2020: string; shareOf2010Pct: number; shareOf2020Pct: number; eligible: boolean; status: Oz2027Tier | null; ruralStatus: 0 | 1 | null; confidence: Oz2027Confidence | null };
export type Oz2027Picture = {
  /** Share of the 2010 tract's land in 2020 successors on Treasury's eligible list. */
  eligibleLandPct: number;
  /** Share of the 2010 tract's land in successors that are eligible and OZ-rural (Treasury rural_status 1). */
  ruralEligibleLandPct: number;
  /** `partly_eligible` needs at least the threshold share; an eligible part below it is a sliver, never a badge. */
  badge: 'fully_eligible' | 'partly_eligible' | 'sliver_only' | 'not_eligible';
  /** Best tier among eligible successors holding at least the threshold share; `null` when none does. */
  headline: Oz2027Tier | null;
  slivers: Oz2027Successor[];
  successors: Oz2027Successor[];
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
export function oz2027Picture(successors: Oz2027Successor[], thresholdPct = OZ2027_LAND_SHARE_THRESHOLD_PCT): Oz2027Picture {
  const eligible = successors.filter(s => s.eligible);
  const eligibleLandPct = round3(Math.min(100, eligible.reduce((sum, s) => sum + s.shareOf2010Pct, 0)));
  const ruralEligibleLandPct = round3(Math.min(100, eligible.filter(s => s.ruralStatus === 1).reduce((sum, s) => sum + s.shareOf2010Pct, 0)));
  const counted = eligible.filter(s => s.shareOf2010Pct >= thresholdPct);
  const slivers = eligible.filter(s => s.shareOf2010Pct < thresholdPct);
  const badge = eligibleLandPct >= 99 ? 'fully_eligible' : counted.length && eligibleLandPct >= thresholdPct ? 'partly_eligible' : eligible.length ? 'sliver_only' : 'not_eligible';
  const ranked = counted.map(s => s.status ?? 'eligible').sort((a, b) => tierRank(a) - tierRank(b));
  return { eligibleLandPct, ruralEligibleLandPct, badge, headline: ranked[0] ?? null, slivers, successors };
}
/** OZ-rural (Treasury rural_status 1 on at least the threshold share of land) AND EB-5 rural_clear, each from its own source. */
export function ozRuralAndEb5Rural(eb5Class: OzEb5Class | null, picture: Oz2027Picture | null, thresholdPct = OZ2027_LAND_SHARE_THRESHOLD_PCT) {
  return eb5Class === 'rural_clear' && !!picture && picture.ruralEligibleLandPct >= thresholdPct;
}

// ---------- input validation ----------
export type Oz2027Filters = {
  state: string | null; status: Oz2027Tier | null; county: string | null;
  /** Treasury rural_status = 1 (the OZ 2.0 definition). */
  rural: boolean;
  /** OZ-rural and inside a 2018-designated tract the EB-5 screen classes rural_clear. */
  eb5RuralBoth: boolean;
  /** At least the threshold share of the tract's land is inside a 2018-designated zone. */
  overlap2018: boolean;
};
export function parseOz2027Tier(value: string | null | undefined): Oz2027Tier | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (isTier(text)) return text;
  throw new ResearchValidationError('Unknown 2027 status tier.');
}
export function parseOz2027Filters(params: URLSearchParams): Oz2027Filters {
  const county = String(params.get('county') ?? '').trim();
  if (county.length > 80) throw new ResearchValidationError('County search is too long.');
  for (const key of ['rural', 'both', 'overlap2018']) {
    const v = params.get(key);
    if (v !== null && v !== '0' && v !== '1') throw new ResearchValidationError(`${key} must be 1 or 0.`);
  }
  return {
    state: parseOzEb5State(params.get('state')), status: parseOz2027Tier(params.get('status')), county: county || null,
    rural: params.get('rural') === '1', eb5RuralBoth: params.get('both') === '1', overlap2018: params.get('overlap2018') === '1',
  };
}
export function parseOz2027Geoid(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  if (!/^[0-9]{11}$/.test(text)) throw new ResearchValidationError('A 2020 census tract identifier is exactly eleven digits.');
  return text;
}
export function parseOz2027RunId(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^[a-f0-9]{64}$/.test(text)) throw new ResearchValidationError('A run identifier is 64 hexadecimal characters.');
  return text;
}
/** The largest box a single geometry request may cover: about a large state at the zoom where polygons are drawn. */
export const OZ2027_BBOX_MAX_SPAN = { lon: 30, lat: 20 } as const;
export const OZ2027_GEOMETRY_LIMIT = 4000;
export const OZ2027_ROW_LIMIT = 2000;
export function parseOz2027Bbox(value: string | null | undefined): [number, number, number, number] | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(',');
  if (parts.length !== 4 || parts.some(p => !p.trim())) throw new ResearchValidationError('A bounding box is west,south,east,north.');
  const [w, s, e, n] = parts.map(Number);
  if (![w, s, e, n].every(Number.isFinite) || w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) throw new ResearchValidationError('A bounding box needs west < east and south < north within longitude and latitude range.');
  if (e - w > OZ2027_BBOX_MAX_SPAN.lon || n - s > OZ2027_BBOX_MAX_SPAN.lat) throw new ResearchValidationError(`A bounding box may span at most ${OZ2027_BBOX_MAX_SPAN.lon} degrees of longitude and ${OZ2027_BBOX_MAX_SPAN.lat} of latitude.`);
  return [w, s, e, n];
}

// ---------- database reads ----------
export type Oz2027Run = { id: string; importedAt: string; importedBy: string; parserVersion: string; scriptSha256: string; treasurySha256: string; sources: Oz2027Source[]; counts: Record<string, unknown>; rule: string };
export type Oz2027Source = {
  id: string; state: string; tier: Oz2027Tier; confidence: Oz2027Confidence; publisher: string; publisherClass: string; shipped: boolean;
  url: string | null; documentUrl: string | null; date: string; fetch: string; notes: string; reason?: string;
  fetchedUtc?: string; receiptSha256?: string; rows?: number; signals?: number; offList?: number; editDate?: string | null;
};
export type Oz2027TractRow = {
  geoid2020: string; state: string; county: string; countyFips: string; cbsa: string;
  povertyRate: number | null; mfiRatio: number | null; mfiUbRatio: number | null; tempDisplacement: boolean; eligibilityRoute: string;
  ruralStatus: 0 | 1; inAprilAppendix: boolean;
  headlineStatus: Oz2027Tier; headlineConfidence: Oz2027Confidence | null; headlineSourceId: string | null; signalCount: number;
  overlap2018LandPct: number; labelLon: number; labelLat: number;
  /** EB-5 classes of the 2018-designated 2010 tracts this tract was tested as a successor of (above the place-test filter). */
  eb5Classes: OzEb5Class[];
  eb5RuralBoth: boolean;
};
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
function toRow(r: Record<string, unknown>): Oz2027TractRow {
  const classes = ((r.eb5_classes as string[] | null) ?? []).filter(Boolean).sort() as OzEb5Class[];
  return {
    geoid2020: String(r.geoid_2020), state: String(r.state), county: String(r.county), countyFips: String(r.county_fips), cbsa: String(r.cbsa),
    povertyRate: n(r.poverty_rate), mfiRatio: n(r.mfi_ratio), mfiUbRatio: n(r.mfi_ub_ratio), tempDisplacement: Boolean(r.temp_displacement), eligibilityRoute: String(r.eligibility_route),
    ruralStatus: Number(r.rural_status) as 0 | 1, inAprilAppendix: Boolean(r.in_april_appendix),
    headlineStatus: String(r.headline_status) as Oz2027Tier, headlineConfidence: (r.headline_confidence ?? null) as Oz2027Confidence | null, headlineSourceId: (r.headline_source_id ?? null) as string | null,
    signalCount: Number(r.signal_count), overlap2018LandPct: Number(r.overlap_2018_land_pct), labelLon: Number(r.label_lon), labelLat: Number(r.label_lat),
    eb5Classes: classes, eb5RuralBoth: Number(r.rural_status) === 1 && classes.includes('rural_clear'),
  };
}
export async function currentOz2027Run(client: PoolClient): Promise<Oz2027Run | null> {
  const found = await client.query("SELECT r.* FROM research_oz2027_current c JOIN research_oz2027_runs r ON r.id=c.run_id WHERE c.workspace_id='primary'");
  const row = found.rows[0];
  if (!row) return null;
  return { id: row.id, importedAt: iso(row.imported_at), importedBy: row.imported_by, parserVersion: row.parser_version, scriptSha256: row.script_sha256, treasurySha256: row.treasury_sha256, sources: row.sources, counts: row.counts, rule: row.rule };
}
const TRACT_COLUMNS = `t.geoid_2020,t.state,t.county,t.county_fips,t.cbsa,t.poverty_rate,t.mfi_ratio,t.mfi_ub_ratio,t.temp_displacement,t.eligibility_route,t.rural_status,t.in_april_appendix,
  t.headline_status,t.headline_confidence,t.headline_source_id,t.signal_count,t.overlap_2018_land_pct,t.label_lon,t.label_lat`;
// The EB-5 classes a 2020 tract carries are those of the 2018-designated 2010 tracts it is a successor of above the screen's
// place-test filter: those are the successors whose own IIUSA observation entered the class. $2 is the current EB-5 run.
const EB5_CLASSES = `(SELECT array_agg(DISTINCT e.eb5_rural_class) FROM research_oz2027_links l JOIN research_oz_eb5_tracts e ON e.run_id=$2 AND e.geoid_2010=l.geoid_2010
  WHERE l.run_id=t.run_id AND l.geoid_2020=t.geoid_2020 AND l.share_of_2010_pct > ${OZ_EB5_PLACE_TEST_FILTER_PCT}) eb5_classes`;
export async function oz2027TractRows(client: PoolClient, runId: string, eb5RunId: string | null, f: Oz2027Filters) {
  const like = f.county === null ? null : f.county.replace(/[\\%_]/g, '\\$&');
  const where = `t.run_id=$1
       AND ($3::text IS NULL OR t.state=$3)
       AND ($4::text IS NULL OR t.headline_status=$4)
       AND ($5::text IS NULL OR t.county ILIKE '%'||$5||'%' ESCAPE '\\')
       AND (NOT $6::boolean OR t.rural_status=1)
       AND (NOT $7::boolean OR t.overlap_2018_land_pct >= ${OZ2027_LAND_SHARE_THRESHOLD_PCT})
       AND (NOT $8::boolean OR (t.rural_status=1 AND EXISTS (SELECT 1 FROM research_oz2027_links l JOIN research_oz_eb5_tracts e ON e.run_id=$2 AND e.geoid_2010=l.geoid_2010
             WHERE l.run_id=t.run_id AND l.geoid_2020=t.geoid_2020 AND l.share_of_2010_pct > ${OZ_EB5_PLACE_TEST_FILTER_PCT} AND e.eb5_rural_class='rural_clear')))`;
  const params = [runId, eb5RunId, f.state, f.status, like, f.rural, f.overlap2018, f.eb5RuralBoth];
  const [rows, total] = await Promise.all([
    client.query(`SELECT ${TRACT_COLUMNS}, ${EB5_CLASSES} FROM research_oz2027_tracts t WHERE ${where}
       ORDER BY array_position(ARRAY['certified','nominated','state_recommended','draft_for_comment','local_recommended','eligible']::text[], t.headline_status), t.state, t.county, t.geoid_2020
       LIMIT ${OZ2027_ROW_LIMIT + 1}`, params),
    client.query(`SELECT count(*)::int n FROM research_oz2027_tracts t WHERE ${where}`, params),
  ]);
  const truncated = rows.rows.length > OZ2027_ROW_LIMIT;
  return { rows: rows.rows.slice(0, OZ2027_ROW_LIMIT).map(toRow), total: total.rows[0].n as number, truncated, limit: OZ2027_ROW_LIMIT };
}
export type Oz2027State = {
  state: string; status: string; nominatedDate: string | null; certifiedDate: string | null; cap: number | null;
  eligibleCount: number; eligibleRuralCount: number; nominatedCount: number | null; tractSignalCount: number;
  listUrl: string; sourceUrl: string; confidence: Oz2027Confidence; deadlineTrack: string; notes: string;
  tiers: Record<Oz2027Tier, number>;
};
export async function oz2027StateRows(client: PoolClient, runId: string): Promise<Oz2027State[]> {
  const [states, tiers] = await Promise.all([
    client.query('SELECT * FROM research_oz2027_states WHERE run_id=$1 ORDER BY state', [runId]),
    client.query('SELECT state, headline_status, count(*)::int n FROM research_oz2027_tracts WHERE run_id=$1 GROUP BY state, headline_status', [runId]),
  ]);
  const byState = new Map<string, Record<Oz2027Tier, number>>();
  for (const r of tiers.rows) {
    const t = byState.get(r.state) ?? Object.fromEntries(OZ2027_TIERS.map(k => [k, 0])) as Record<Oz2027Tier, number>;
    t[r.headline_status as Oz2027Tier] = r.n;
    byState.set(r.state, t);
  }
  return states.rows.map(r => ({
    state: r.state, status: r.status, nominatedDate: r.nominated_date, certifiedDate: r.certified_date, cap: r.cap, eligibleCount: r.eligible_count,
    eligibleRuralCount: r.eligible_rural_count, nominatedCount: r.nominated_count, tractSignalCount: r.tract_signal_count, listUrl: r.list_url,
    sourceUrl: r.source_url, confidence: r.confidence, deadlineTrack: r.deadline_track, notes: r.notes,
    tiers: byState.get(r.state) ?? Object.fromEntries(OZ2027_TIERS.map(k => [k, 0])) as Record<Oz2027Tier, number>,
  }));
}
export async function oz2027Geometry(client: PoolClient, runId: string, by: { state: string } | { bbox: [number, number, number, number] }) {
  const result = 'state' in by
    ? await client.query(`SELECT geoid_2020, state, county, headline_status, rural_status, overlap_2018_land_pct, display_geometry FROM research_oz2027_tracts
        WHERE run_id=$1 AND state=$2 ORDER BY geoid_2020 LIMIT ${OZ2027_GEOMETRY_LIMIT + 1}`, [runId, by.state])
    : await client.query(`SELECT geoid_2020, state, county, headline_status, rural_status, overlap_2018_land_pct, display_geometry FROM research_oz2027_tracts
        WHERE run_id=$1 AND max_lon >= $2 AND min_lon <= $4 AND max_lat >= $3 AND min_lat <= $5 ORDER BY geoid_2020 LIMIT ${OZ2027_GEOMETRY_LIMIT + 1}`, [runId, ...by.bbox]);
  const truncated = result.rows.length > OZ2027_GEOMETRY_LIMIT;
  return {
    type: 'FeatureCollection' as const, truncated, limit: OZ2027_GEOMETRY_LIMIT,
    features: result.rows.slice(0, OZ2027_GEOMETRY_LIMIT).map(r => ({
      type: 'Feature' as const, id: r.geoid_2020, geometry: r.display_geometry,
      properties: { geoid: r.geoid_2020, state: r.state, county: r.county, status: r.headline_status as Oz2027Tier, rural: Number(r.rural_status), overlap2018: Number(r.overlap_2018_land_pct) },
    })),
  };
}
export type Oz2027Signal = { sourceId: string; status: Oz2027Tier; jurisdiction: string; sourceUrl: string; sourceDate: string | null; confidence: Oz2027Confidence; receiptSha256: string; onEligibleList: boolean; notes: string; source: Oz2027Source | null };
export type Oz2027Link2018 = { geoid2010: string; shareOf2010Pct: number; shareOf2020Pct: number; eb5RuralClass: OzEb5Class | null; notice: Notice202640Label };
/** Everything the drawer shows for one 2020 tract: Treasury's row, every signal with its source, the state, and the 2018 overlap. */
export async function oz2027TractDetail(client: PoolClient, run: Oz2027Run, eb5RunId: string | null, geoid: string) {
  const [tract, signals, links] = await Promise.all([
    client.query(`SELECT ${TRACT_COLUMNS}, ${EB5_CLASSES} FROM research_oz2027_tracts t WHERE t.run_id=$1 AND t.geoid_2020=$3`, [run.id, eb5RunId, geoid]),
    client.query('SELECT * FROM research_oz2027_signals WHERE run_id=$1 AND geoid_2020=$2', [run.id, geoid]),
    client.query(`SELECT l.geoid_2010, l.share_of_2010_pct, l.share_of_2020_pct, e.eb5_rural_class FROM research_oz2027_links l
       LEFT JOIN research_oz_eb5_tracts e ON e.run_id=$3 AND e.geoid_2010=l.geoid_2010 WHERE l.run_id=$1 AND l.geoid_2020=$2 ORDER BY l.share_of_2020_pct DESC, l.geoid_2010`, [run.id, geoid, eb5RunId]),
  ]);
  const sources = new Map(run.sources.map(s => [s.id, s]));
  const signalRows: Oz2027Signal[] = signals.rows.map(s => ({
    sourceId: s.source_id, status: s.status, jurisdiction: s.jurisdiction, sourceUrl: s.source_url, sourceDate: s.source_date, confidence: s.confidence,
    receiptSha256: s.receipt_sha256, onEligibleList: s.on_eligible_list, notes: s.notes, source: sources.get(s.source_id) ?? null,
  })).sort((a, b) => tierRank(a.status) - tierRank(b.status) || a.sourceId.localeCompare(b.sourceId));
  const row = tract.rows[0] ? toRow(tract.rows[0]) : null;
  const stateName = row?.state ?? signalRows[0]?.source?.state ?? null;
  const state = stateName ? (await client.query('SELECT * FROM research_oz2027_states WHERE run_id=$1 AND state=$2', [run.id, stateName])).rows[0] ?? null : null;
  const link2018: Oz2027Link2018[] = links.rows.map(l => ({ geoid2010: l.geoid_2010, shareOf2010Pct: Number(l.share_of_2010_pct), shareOf2020Pct: Number(l.share_of_2020_pct), eb5RuralClass: l.eb5_rural_class ?? null, notice: notice202640Label(l.geoid_2010.slice(0, 2)) }));
  return {
    geoid, tract: row, onEligibleList: row !== null, signals: signalRows, links2018: link2018,
    // Lists the manifest withholds under D06 are named at state level, never as tract claims.
    withheldStateSources: stateName ? run.sources.filter(s => s.state === stateName && !s.shipped) : [],
    state: state && { state: state.state, status: state.status, nominatedDate: state.nominated_date, certifiedDate: state.certified_date, cap: state.cap, eligibleCount: state.eligible_count, confidence: state.confidence, sourceUrl: state.source_url, listUrl: state.list_url, notes: state.notes },
  };
}
/** The 2027 picture for 2018-designated 2010 tracts, keyed by 2010 GEOID, for the OZ / EB-5 screen. */
export async function oz2027PicturesFor2010(client: PoolClient, runId: string, geoids2010: string[]) {
  if (!geoids2010.length) return new Map<string, Oz2027Picture>();
  const result = await client.query(
    `SELECT l.geoid_2010, l.geoid_2020, l.share_of_2010_pct, l.share_of_2020_pct, z.geoid_2020 IS NOT NULL eligible, z.headline_status, z.rural_status, z.headline_confidence
     FROM research_oz2027_links l LEFT JOIN research_oz2027_tracts z ON z.run_id=l.run_id AND z.geoid_2020=l.geoid_2020
     WHERE l.run_id=$1 AND l.geoid_2010 = ANY($2::text[]) ORDER BY l.geoid_2010, l.share_of_2010_pct DESC`, [runId, geoids2010]);
  const grouped = new Map<string, Oz2027Successor[]>();
  for (const r of result.rows) {
    const list = grouped.get(r.geoid_2010) ?? [];
    list.push({ geoid2020: r.geoid_2020, shareOf2010Pct: Number(r.share_of_2010_pct), shareOf2020Pct: Number(r.share_of_2020_pct), eligible: r.eligible,
      status: r.eligible ? r.headline_status : null, ruralStatus: r.eligible ? Number(r.rural_status) as 0 | 1 : null, confidence: r.headline_confidence ?? null });
    grouped.set(r.geoid_2010, list);
  }
  return new Map([...grouped].map(([geoid, successors]) => [geoid, oz2027Picture(successors)]));
}
/** Treasury eligibility and the 2027 tier for a set of 2020 tracts (the Florida research view). */
export async function oz2027ForTracts(client: PoolClient, runId: string, geoids2020: string[]) {
  const map = new Map<string, { status: Oz2027Tier; confidence: Oz2027Confidence | null; rural: boolean; overlap2018LandPct: number; inAprilAppendix: boolean }>();
  if (!geoids2020.length) return map;
  const result = await client.query('SELECT geoid_2020, headline_status, headline_confidence, rural_status, overlap_2018_land_pct, in_april_appendix FROM research_oz2027_tracts WHERE run_id=$1 AND geoid_2020 = ANY($2::text[])', [runId, geoids2020]);
  for (const r of result.rows) map.set(r.geoid_2020, { status: r.headline_status, confidence: r.headline_confidence, rural: Number(r.rural_status) === 1, overlap2018LandPct: Number(r.overlap_2018_land_pct), inAprilAppendix: r.in_april_appendix });
  return map;
}
/** Every eligible tract as [geoid, lon, lat, tier index, rural 0/1, 2018 overlap at least the threshold 0/1]: the national point view. */
export async function oz2027Points(client: PoolClient, runId: string) {
  const result = await client.query(`SELECT geoid_2020, label_lon, label_lat, headline_status, rural_status, overlap_2018_land_pct >= ${OZ2027_LAND_SHARE_THRESHOLD_PCT} overlap FROM research_oz2027_tracts WHERE run_id=$1 ORDER BY geoid_2020`, [runId]);
  return {
    fields: ['geoid', 'lon', 'lat', 'tier', 'rural', 'overlap2018'] as const, tiers: OZ2027_TIERS,
    rows: result.rows.map(r => [r.geoid_2020, Number(r.label_lon), Number(r.label_lat), tierRank(r.headline_status), Number(r.rural_status), r.overlap ? 1 : 0] as [string, number, number, number, number, number]),
  };
}
