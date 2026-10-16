// Explicit offline preparer for the OZ / EB-5 application import. Never invoked at startup or on a schedule.
//
//   node scripts/prepare-oz-eb5-import.mjs [screenDir] [outDir]
//
// Reads the offline screen's oz-eb5-tracts.csv and manifest.json, pulls the HUD designated 2010 polygon for
// every tract that is not not_rural_msa, simplifies it for display, carries OMB Bulletin 23-01 List 1 so the
// server-side site test can answer the metropolitan leg for any county, carries the screen's assets output
// (oz-eb5-assets.csv, verified against its own manifest) as layer 4, and writes a gzip bundle plus a manifest
// with SHA-256 receipts. scripts/import-oz-eb5.mjs loads that bundle into the database (migrations 007 and 008).
//
// The minimal zip/xlsx reader below duplicates scripts/oz-eb5-screen.mjs. That script is a CLI entry point
// with top-level dispatch and exports nothing, so it cannot be imported; it stays the reviewed offline
// authority and is not modified here. The duplication is recorded in docs/OZ-EB5-SCREEN.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import simplify from '@turf/simplify';
import { ASSET_COLUMNS, ASSET_SOURCES, EXTENSION_COLUMNS, OZ_EB5_PARSER_VERSION } from './oz-eb5-import-core.mjs';

const HUD_OZ = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13/query';
const PARSER_VERSION = OZ_EB5_PARSER_VERSION;
const BATCH = 50;
const SIMPLIFY_TOLERANCE = 0.00008;
const MAX_BUNDLE_BYTES = 40e6;
const PAUSE_MS = 150;
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const SCRIPT_SHA256 = sha256(await fs.readFile(fileURLToPath(import.meta.url)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const screenDir = process.argv[2] ?? '.local/oz-eb5-screen';
const outDir = process.argv[3] ?? path.join(screenDir, 'import');
const rawDir = path.join(outDir, 'raw');

// ---------- csv ----------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// ---------- minimal zip and xlsx, for OMB List 1 only ----------
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip archive.');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error('Bad zip central directory.');
    const method = buf.readUInt16LE(offset + 10), csize = buf.readUInt32LE(offset + 20);
    const n = buf.readUInt16LE(offset + 28), e = buf.readUInt16LE(offset + 30), c = buf.readUInt16LE(offset + 32), local = buf.readUInt32LE(offset + 42);
    entries.set(buf.toString('utf8', offset + 46, offset + 46 + n), { method, csize, local });
    offset += 46 + n + e + c;
  }
  return name => {
    const entry = entries.get(name);
    if (!entry) return null;
    const n = buf.readUInt16LE(entry.local + 26), e = buf.readUInt16LE(entry.local + 28);
    const data = buf.subarray(entry.local + 30 + n + e, entry.local + 30 + n + e + entry.csize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Unsupported zip method ${entry.method}.`);
  };
}
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
function readFirstSheet(zipBuf) {
  const get = unzip(zipBuf);
  const shared = [];
  const sharedXml = get('xl/sharedStrings.xml');
  if (sharedXml) for (const m of sharedXml.toString('utf8').matchAll(/<si>(.*?)<\/si>/gs)) shared.push(decodeXml(m[1].replace(/<rPh>.*?<\/rPh>/gs, '').replace(/<[^>]+>/g, '')));
  const workbook = get('xl/workbook.xml');
  const rel = workbook?.toString('utf8').match(/<sheet\b[^>]*?\sr:id="([^"]+)"/)?.[1];
  const rels = get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const id = String(rel ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const target = id ? rels.match(new RegExp(`<Relationship\\b[^>]*?\\sId="${id}"[^>]*>`))?.[0].match(/\sTarget="([^"]+)"/)?.[1] : null;
  const part = target ? (target.startsWith('/') ? target.replace(/^\/+/, '') : `xl/${target.replace(/^\.\//, '')}`) : '';
  const sheetXml = (part && get(part)) || get('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error("Cannot locate the workbook's first worksheet.");
  const rows = new Map();
  for (const m of sheetXml.toString('utf8').matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const [, col, row, attrs, inner = ''] = m;
    const v = inner.match(/<v>(.*?)<\/v>/s), is = inner.match(/<is>(.*?)<\/is>/s);
    const cellType = attrs.match(/\st="([^"]*)"/)?.[1] ?? '';
    let value = '';
    if (cellType === 's') value = v ? (shared[+v[1]] ?? '') : '';
    else if (cellType === 'inlineStr') value = is ? decodeXml(is[1].replace(/<[^>]+>/g, '')) : v ? decodeXml(v[1]) : '';
    else if (cellType === 'str') value = v ? decodeXml(v[1]) : '';
    else if (is) value = decodeXml(is[1].replace(/<[^>]+>/g, ''));
    else if (v) value = decodeXml(v[1]);
    let index = 0;
    for (const ch of col) index = index * 26 + (ch.charCodeAt(0) - 64);
    if (!rows.has(+row)) rows.set(+row, []);
    rows.get(+row)[index - 1] = value.trim();
  }
  return [...rows.keys()].sort((a, b) => a - b).map(k => rows.get(k));
}
function loadOmbCounties(buf) {
  const rows = readFirstSheet(buf);
  const headerIndex = rows.findIndex(r => /CBSA Code/i.test(r[0] ?? ''));
  if (headerIndex < 0) throw new Error('OMB workbook header not found.');
  const counties = [];
  for (const r of rows.slice(headerIndex + 1)) {
    if (!/^\d{2}$/.test(r[9] ?? '') || !/^\d{3}$/.test(r[10] ?? '')) continue;
    // List 1 carries exactly two values here. Anything else would silently pass a metropolitan county as rural.
    const kind = String(r[4] ?? '').trim();
    if (kind !== 'Metropolitan Statistical Area' && kind !== 'Micropolitan Statistical Area') {
      throw new Error(`OMB List 1 row for county ${r[9]}${r[10]} has Metropolitan/Micropolitan value "${kind}".`);
    }
    counties.push({ countyFips: r[9] + r[10], countyName: r[7] ?? '', cbsaCode: r[0], cbsaTitle: r[3], cbsaType: kind === 'Metropolitan Statistical Area' ? 'metropolitan' : 'micropolitan' });
  }
  if (counties.length < 1800) throw new Error(`OMB list parsed only ${counties.length} counties.`);
  if (new Set(counties.map(c => c.countyFips)).size !== counties.length) throw new Error('OMB list has duplicate county codes.');
  return counties;
}

// ---------- HUD polygons, cached with receipts ----------
async function fetchHudBatch(ids) {
  const key = sha256(Buffer.from([...ids].sort().join(','))).slice(0, 16);
  const file = path.join(rawDir, `hud-${key}.geojson`);
  const receiptPath = `${file}.receipt.json`;
  const params = new URLSearchParams({
    where: `GEOID10 IN (${ids.map(id => `'${id}'`).join(',')})`,
    outFields: 'GEOID10', returnGeometry: 'true', outSR: '4326', f: 'geojson',
  });
  const url = `${HUD_OZ}?${params}`;
  try {
    const buf = await fs.readFile(file);
    const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
    if (receipt.sha256 === sha256(buf) && receipt.requested_count === ids.length) return JSON.parse(buf.toString('utf8'));
  } catch { /* no usable cache */ }
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buf = Buffer.from(await response.arrayBuffer());
      const json = JSON.parse(buf.toString('utf8'));
      if (json.error) throw new Error(`HUD service error ${JSON.stringify(json.error)}`);
      if (json.exceededTransferLimit) throw new Error('HUD response hit the service transfer limit; reduce the batch size.');
      await fs.writeFile(file, buf);
      await fs.writeFile(receiptPath, JSON.stringify({ file: path.basename(file), url, sha256: sha256(buf), bytes: buf.length, fetched_utc: new Date().toISOString(), requested_count: ids.length, returned_count: (json.features ?? []).length }, null, 2));
      return json;
    } catch (error) { lastError = error; if (attempt < 4) await pause(1000 * attempt * attempt); }
  }
  throw new Error(`HUD batch failed: ${lastError?.message ?? lastError}`);
}

// ---------- run ----------
const csvText = await fs.readFile(path.join(screenDir, 'oz-eb5-tracts.csv'));
const screenManifest = JSON.parse(await fs.readFile(path.join(screenDir, 'manifest.json'), 'utf8'));
if (screenManifest.outputs?.csv?.sha256 && screenManifest.outputs.csv.sha256 !== sha256(csvText)) {
  throw new Error('oz-eb5-tracts.csv does not match the SHA-256 recorded in the screen manifest. Rerun the screen before preparing an import.');
}
const rows = parseCsv(csvText.toString('utf8'));
const header = rows[0];
const column = name => { const i = header.indexOf(name); if (i < 0) throw new Error(`oz-eb5-tracts.csv lacks ${name}.`); return i; };
const COLUMNS = ['geoid_2010', 'state', 'county_name', 'county_fips', 'tract_type', 'oz_status', 'oz_authority', 'geoid_2010_geometry_alias', 'cbsa_code', 'cbsa_title', 'cbsa_type', 'msa_basis', 'town_basis', 'bridge_type', 'tracts_2020', 'dropped_successors', 'iiusa_rows', 'iiusa_coverage_pct', 'iiusa_rural_tea', 'iiusa_msa', 'place_20k_names', 'place_20k_kind', 'place_20k_successor_land_pct', 'eb5_rural_class', 'class_reason', 'notes'];
// The twenty-six extension columns (2027 round, incentive flags, ACS demographics) are required by name as
// well: a blank measured cell becomes null, never 0, and the import core refuses any undocumented value.
const EXTENSIONS = Object.keys(EXTENSION_COLUMNS);
const index = Object.fromEntries([...COLUMNS, ...EXTENSIONS].map(name => [name, column(name)]));
const numeric = new Set(['iiusa_rows', 'iiusa_coverage_pct', 'place_20k_successor_land_pct']);
const measured = value => {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`oz-eb5-tracts.csv carries a non-numeric measured value "${raw}".`);
  return n;
};
const tracts = rows.slice(1).map(r => {
  const row = {};
  for (const name of COLUMNS) { const raw = r[index[name]] ?? ''; row[name] = numeric.has(name) ? (raw === '' ? 0 : Number(raw)) : raw; }
  for (const name of EXTENSIONS) {
    const raw = r[index[name]] ?? '';
    const rule = EXTENSION_COLUMNS[name];
    row[name] = rule.kind === 'text' ? raw : rule.kind === 'enum' ? (raw === '' ? null : raw) : measured(raw);
  }
  if (!/^\d{11}$/.test(row.geoid_2010)) throw new Error(`Invalid tract id ${row.geoid_2010}.`);
  return row;
});
if (!tracts.length) throw new Error('oz-eb5-tracts.csv has no data rows.');
if (new Set(tracts.map(t => t.geoid_2010)).size !== tracts.length) throw new Error('oz-eb5-tracts.csv has duplicate tract ids.');
if (screenManifest.designated_tracts && tracts.length !== screenManifest.designated_tracts) throw new Error(`Parsed ${tracts.length} tracts; the screen manifest records ${screenManifest.designated_tracts}.`);

const ombBuf = await fs.readFile(path.join(screenDir, 'raw', 'list1_2023.xlsx'));
if (screenManifest.sources?.omb?.sha256 && screenManifest.sources.omb.sha256 !== sha256(ombBuf)) throw new Error('list1_2023.xlsx does not match its receipt in the screen manifest.');
const omb = loadOmbCounties(ombBuf);
process.stdout.write(`Tracts: ${tracts.length}; OMB List 1 counties: ${omb.length}\n`);

// ---------- layer 4: the assets output of the screen, verified against its own manifest ----------
// One row per source property in a designated tract. The assets mode joins by 2010 tract ID against the
// tract table, so every row here must name a tract in this bundle and carry that tract's class; a mismatch
// means the assets mode ran against a different tract table and the operator reruns it before preparing.
const assetsCsv = await fs.readFile(path.join(screenDir, 'oz-eb5-assets.csv'));
const assetsManifest = JSON.parse(await fs.readFile(path.join(screenDir, 'oz-eb5-assets.manifest.json'), 'utf8'));
if (assetsManifest.mode !== 'assets' || assetsManifest.outputs?.csv?.sha256 !== sha256(assetsCsv)) throw new Error('oz-eb5-assets.csv does not match the SHA-256 recorded in the assets manifest. Rerun the assets mode before preparing an import.');
if (assetsManifest.owner_or_agent_fields_requested !== false && assetsManifest.owner_or_agent_fields_requested !== undefined) throw new Error('The assets manifest reports owner or agent fields; refusing to import them.');
const assetRows = parseCsv(assetsCsv.toString('utf8'));
const assetHeader = assetRows[0];
const assetIndex = Object.fromEntries(ASSET_COLUMNS.map(name => { const i = assetHeader.indexOf(name); if (i < 0) throw new Error(`oz-eb5-assets.csv lacks ${name}.`); return [name, i]; }));
for (const name of assetHeader) if (/owner|agent|phone|email|contact/i.test(name)) throw new Error(`oz-eb5-assets.csv carries a ${name} column; refusing to import it.`);
const integerOrNull = (value, label) => {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`oz-eb5-assets.csv carries a non-integer ${label} "${raw}".`);
  return n;
};
const classOf = new Map(tracts.map(t => [t.geoid_2010, t.eb5_rural_class]));
const assets = assetRows.slice(1).map(r => {
  const row = {};
  for (const name of ASSET_COLUMNS) row[name] = r[assetIndex[name]] ?? '';
  for (const name of ['total_units', 'assisted_units', 'contract_or_restriction_expiration_year', 'loan_maturity_year', 'effective_year']) row[name] = integerOrNull(row[name], name);
  row.latitude = Number(row.latitude); row.longitude = Number(row.longitude);
  if (!ASSET_SOURCES.has(row.source)) throw new Error(`oz-eb5-assets.csv carries an unknown source "${row.source}".`);
  if (!classOf.has(row.geoid_2010)) throw new Error(`Asset ${row.source}:${row.source_object_id} names tract ${row.geoid_2010}, which is not in oz-eb5-tracts.csv.`);
  if (classOf.get(row.geoid_2010) !== row.eb5_rural_class) throw new Error(`Asset ${row.source}:${row.source_object_id} carries class ${row.eb5_rural_class} but its tract ${row.geoid_2010} is ${classOf.get(row.geoid_2010)}; rerun the assets mode against the current tract table.`);
  return row;
});
if (assetsManifest.totals?.rows !== undefined && assets.length !== assetsManifest.totals.rows) throw new Error(`Parsed ${assets.length} asset rows; the assets manifest records ${assetsManifest.totals.rows}.`);
const assetsBySource = {};
for (const a of assets) assetsBySource[a.source] = (assetsBySource[a.source] ?? 0) + 1;
process.stdout.write(`Assets: ${assets.length} (${Object.entries(assetsBySource).map(([k, v]) => `${k} ${v}`).join(', ')}); ${assets.filter(a => a.eb5_rural_class === 'rural_clear').length} in rural_clear tracts\n`);

// Geometry is pulled for every tract that is not not_rural_msa. Metropolitan tracts fail the rural test on the
// MSA leg regardless of place, so they are carried as rows without geometry and are never drawn.
const wanted = tracts.filter(t => t.eb5_rural_class !== 'not_rural_msa');
// The HUD layer carries 2010-vintage identifiers, so Bedford uses the retired city code.
const requestId = t => t.geoid_2010_geometry_alias || t.geoid_2010;
const byRequestId = new Map(wanted.map(t => [requestId(t), t.geoid_2010]));
process.stdout.write(`Tracts needing geometry: ${wanted.length} of ${tracts.length}\n`);
await fs.mkdir(rawDir, { recursive: true });

const geometry = {};
const pages = [];
const ids = [...byRequestId.keys()];
let vertices = 0, simplifiedVertices = 0;
const countVertices = g => {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let n = 0;
  for (const poly of polys) for (const ring of poly) n += ring.length;
  return n;
};
async function collect(batch) {
  const json = await fetchHudBatch(batch);
  const returned = new Set();
  for (const feature of json.features ?? []) {
    const id = String(feature.properties?.GEOID10 ?? '');
    const cdfiId = byRequestId.get(id);
    if (!cdfiId) continue;
    if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error(`HUD returned no usable polygon for ${id}.`);
    returned.add(id);
    vertices += countVertices(feature.geometry);
    const display = simplify({ type: 'Feature', properties: {}, geometry: feature.geometry }, { tolerance: SIMPLIFY_TOLERANCE, highQuality: true }).geometry;
    simplifiedVertices += countVertices(display);
    geometry[cdfiId] = display;
  }
  pages.push({ requested: batch.length, returned: returned.size });
  return batch.filter(id => !returned.has(id));
}
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH);
  const missing = await collect(batch);
  // One individual retry per missing identifier before the run is declared incomplete.
  for (const id of missing) await collect([id]);
  const stillMissing = batch.filter(id => !(byRequestId.get(id) in geometry));
  if (stillMissing.length) throw new Error(`HUD returned no polygon for ${stillMissing.join(', ')}. The import is incomplete; investigate before importing.`);
  process.stdout.write(`HUD polygons: ${Object.keys(geometry).length} / ${ids.length}\r`);
  await pause(PAUSE_MS);
}
process.stdout.write(`\nHUD polygons fetched: ${Object.keys(geometry).length} of ${ids.length}\n`);
if (Object.keys(geometry).length !== ids.length) throw new Error('Geometry count does not reconcile with the requested identifiers.');

const byClass = {};
for (const t of tracts) byClass[t.eb5_rural_class] = (byClass[t.eb5_rural_class] ?? 0) + 1;
const transformedHash = sha256(Buffer.from(JSON.stringify({ tracts, geometry, omb, assets })));
const manifest = {
  parserVersion: PARSER_VERSION,
  preparedUtc: new Date().toISOString(),
  prepareScriptSha256: SCRIPT_SHA256,
  screenScriptSha256: screenManifest.script_sha256,
  screenStartedUtc: screenManifest.started_utc ?? null,
  screenFinishedUtc: screenManifest.finished_utc ?? null,
  tractsCsvSha256: sha256(csvText),
  sources: {
    ...screenManifest.sources,
    hud: { url: HUD_OZ, note: 'HUD Opportunity Zones FeatureServer layer 13; designated 2010 polygons, outSR 4326', pages: pages.length, fetched_utc: new Date().toISOString() },
    // The assets output carries its own receipts per layer; the manifest hash and the CSV hash name the exact run.
    assets: { url: '', sha256: assetsManifest.outputs.csv.sha256, fetched_utc: assetsManifest.started_utc ?? '', note: `oz-eb5-assets.csv from the screen's assets mode (script ${assetsManifest.script_sha256 ?? 'unrecorded'}); ${assets.length} rows from three HUD-hosted layers, no owner or agent field requested`, manifest_sha256: sha256(Buffer.from(JSON.stringify(assetsManifest))), screen_script_sha256: assetsManifest.script_sha256 ?? '', tract_table_sha256: assetsManifest.tract_source?.sha256 ?? '' },
    ...Object.fromEntries(Object.entries(assetsManifest.sources ?? {}).filter(([, s]) => s && typeof s === 'object' && typeof s.layer === 'string').map(([key, s]) => [`assets_${key}`, { url: s.layer, sha256: '', fetched_utc: assetsManifest.started_utc ?? '', note: `${s.label ?? key}: ${s.fetched_count ?? '?'} fetched against a server count of ${s.server_count ?? '?'} (${s.reconciliation ?? 'unrecorded'}); owner or agent fields requested: ${s.owner_or_agent_fields_requested === true ? 'yes' : 'no'}` }])),
  },
  counts: {
    tracts: tracts.length,
    withGeometry: Object.keys(geometry).length,
    withoutGeometry: tracts.length - Object.keys(geometry).length,
    ombCounties: omb.length,
    ...byClass,
    assets: assets.length,
    assetsInRuralClear: assets.filter(a => a.eb5_rural_class === 'rural_clear').length,
    ...Object.fromEntries(Object.entries(assetsBySource).map(([k, v]) => [`assets_${k}`, v])),
  },
  geometry: { tolerance: SIMPLIFY_TOLERANCE, highQuality: true, sourceVertices: vertices, displayVertices: simplifiedVertices },
  sliverFilterShare: screenManifest.sliver_filter_share ?? null,
  transformedHash,
  rule: screenManifest.rule,
};
const id = sha256(Buffer.from(JSON.stringify(manifest)));
const bundle = { id, parserVersion: PARSER_VERSION, manifest, tracts, geometry, omb, assets };
await fs.mkdir(outDir, { recursive: true });
const bundlePath = path.join(outDir, 'oz-eb5-import.json.gz');
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
if (gz.length > MAX_BUNDLE_BYTES) throw new Error(`Bundle is ${gz.length} bytes, over the ${MAX_BUNDLE_BYTES}-byte import limit.`);
await fs.writeFile(bundlePath, gz);
await fs.writeFile(`${bundlePath}.manifest.json`, JSON.stringify({ id, bundleSha256: sha256(gz), bundleBytes: gz.length, ...manifest }, null, 2));
process.stdout.write(`${JSON.stringify({ id, bytes: gz.length, megabytes: +(gz.length / 1e6).toFixed(2), counts: manifest.counts, sourceVertices: vertices, displayVertices: simplifiedVertices })}\nWrote ${bundlePath}\n`);
