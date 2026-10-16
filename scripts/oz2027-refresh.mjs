// Offline refresh of the national 2027 Opportunity Zone tract table. Never invoked at startup or on a request.
//
//   node scripts/oz2027-refresh.mjs [--out .local/oz2027] [--refetch]      build the import bundle
//   node scripts/oz2027-refresh.mjs --check [--report file.md]             re-hash every source; exit 1 when one changed
//   node scripts/oz2027-refresh.mjs --check --write-baseline               record today's hashes in data/oz2027/baseline.json
//
// Build mode downloads, each with a SHA-256 receipt cached under the Git-ignored output directory: Treasury's revised
// eligible-tract workbook (September 23, 2026), the IRS Rev. Proc. 2026-14 appendix (April), the CDFI Fund list of 2018
// designations, the Census 2010-to-2020 tract relationship file and the Census 2024 cartographic tract boundaries. It
// then reads every list in data/oz2027/sources.json that may be shipped (docs/DECISIONS.md D06), validates every GEOID
// against Treasury's file, and writes oz2027-import.json.gz plus a manifest for scripts/oz2027-import.mjs.
//
// Check mode reads no geometry and touches no database. It re-fetches each list, each list's document and every watched
// Treasury, IRS and CDFI page, hashes what it got (the normalized tract rows for a data service, the visible text of an
// HTML page, the bytes of a file), compares with data/oz2027/baseline.json and prints what changed. Exit 0: nothing
// changed. Exit 1: something changed (the report names it). Exit 2: the check itself failed.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  OZ2027_CONFIDENCE, OZ2027_SHIPPABLE_PUBLISHERS, OZ2027_SIGNAL_TIERS, OZ2027_STATE_STATUSES, assertNoPersonalFields, bboxOf, cachedDownload,
  csvObjects, fetchBytes, headlineOf, isHtml, labelPoint, pageText, pointInGeometry, readDbf, readFirstSheet, readShpPolygons, roundGeometry, sha256, unzip,
} from './oz2027-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES_FILE = path.join(ROOT, 'data/oz2027/sources.json');
const STATES_FILE = path.join(ROOT, 'data/oz2027/states.csv');
const BASELINE_FILE = path.join(ROOT, 'data/oz2027/baseline.json');
export const OZ2027_PARSER_VERSION = 'oz2027-import-1';
const SIMPLIFY_TOLERANCE = 0.00025;
const COORDINATE_PLACES = 5;
const MAX_BUNDLE_BYTES = 40e6;
// Bedford city, VA (51515) was retired into Bedford County (51019) in 2013. CDFI lists the county code; the relationship
// file still carries the city code. The same alias is hard-coded in scripts/oz-eb5-screen.mjs.
const CDFI_TO_2010_ALIAS = { '51019050100': '51515050100' };
const RULE = 'Treasury OTA OZ2 eligible tracts (2026-09-23) on 2020 boundaries; headline status is the best tier among shipped signals: certified > nominated > state_recommended > draft_for_comment > local_recommended > eligible. Eligibility is not nomination and nomination is not designation. 2018 zones end 12/31/2028 (Puerto Rico 12/31/2027); under IRS Notice 2026-40 new purchases after 12/31/2026 generally do not qualify for a 2018 zone.';

const STATE_FIPS = {
  Alabama: '01', Alaska: '02', Arizona: '04', Arkansas: '05', California: '06', Colorado: '08', Connecticut: '09', Delaware: '10', 'District of Columbia': '11',
  Florida: '12', Georgia: '13', Hawaii: '15', Idaho: '16', Illinois: '17', Indiana: '18', Iowa: '19', Kansas: '20', Kentucky: '21', Louisiana: '22', Maine: '23',
  Maryland: '24', Massachusetts: '25', Michigan: '26', Minnesota: '27', Mississippi: '28', Missouri: '29', Montana: '30', Nebraska: '31', Nevada: '32',
  'New Hampshire': '33', 'New Jersey': '34', 'New Mexico': '35', 'New York': '36', 'North Carolina': '37', 'North Dakota': '38', Ohio: '39', Oklahoma: '40',
  Oregon: '41', Pennsylvania: '42', 'Rhode Island': '44', 'South Carolina': '45', 'South Dakota': '46', Tennessee: '47', Texas: '48', Utah: '49', Vermont: '50',
  Virginia: '51', Washington: '53', 'West Virginia': '54', Wisconsin: '55', Wyoming: '56', 'American Samoa': '60', Guam: '66', 'Northern Mariana Islands': '69',
  'Puerto Rico': '72', 'Virgin Islands': '78',
};
// Treasury's workbook names two territories differently from the state table.
const TREASURY_STATE_NAMES = { 'Commonwealth of the Northern Mariana Islands': 'Northern Mariana Islands', 'United States Virgin Islands': 'Virgin Islands' };

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const outDir = path.resolve(ROOT, option('--out', '.local/oz2027'));
const rawDir = path.join(outDir, 'raw');
const log = (...parts) => console.log(...parts);
const g11 = value => { const digits = String(value ?? '').replace(/\D/g, ''); return digits ? digits.padStart(11, '0') : ''; };
const num = value => { if (value === null || value === undefined || String(value).trim() === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const isoDate = ms => new Date(ms).toISOString().slice(0, 10);

// ---------- list readers: each returns normalized rows { geoid, jurisdiction, detail, date } and receipts ----------
async function arcgisList(list) {
  const meta = JSON.parse((await fetchBytes(`${list.url}?f=json`)).bytes.toString('utf8'));
  if (meta.error) throw new Error(`layer metadata error ${meta.error.code ?? ''}`);
  const oid = meta.objectIdField || meta.fields?.find(f => f.type === 'esriFieldTypeOID')?.name;
  if (!oid) throw new Error('layer has no object ID field');
  const pageSize = Math.min(Number(meta.maxRecordCount) || 1000, 2000);
  const org = list.aggregate?.organizationField, dateField = list.aggregate?.dateField;
  const wanted = [list.geoidField, list.jurisdictionField, org, dateField].filter(Boolean);
  assertNoPersonalFields(wanted, [list.jurisdictionField, org].filter(Boolean));
  const outFields = [...new Set([oid, ...wanted])].join(',');
  const countUrl = `${list.url}/query?${new URLSearchParams({ where: list.where, returnCountOnly: 'true', f: 'json' })}`;
  const serverCount = JSON.parse((await fetchBytes(countUrl)).bytes.toString('utf8')).count;
  const pages = [];
  const seen = new Map();
  let last = -Infinity;
  for (let page = 0; page < 200; page++) {
    const where = Number.isFinite(last) ? `(${list.where}) AND ${oid} > ${last}` : list.where;
    const url = `${list.url}/query?${new URLSearchParams({ where, outFields, returnGeometry: 'false', orderByFields: `${oid} ASC`, resultRecordCount: String(pageSize), f: 'json' })}`;
    const { bytes } = await fetchBytes(url);
    const body = JSON.parse(bytes.toString('utf8'));
    if (body.error) throw new Error(`query error ${body.error.code ?? ''}`);
    pages.push(bytes);
    const features = body.features ?? [];
    let added = 0;
    for (const f of features) { const id = f.attributes[oid]; if (!seen.has(id)) { seen.set(id, f.attributes); added++; } last = Math.max(last, Number(id)); }
    if (!features.length || !added) break;
  }
  const attributes = [...seen.values()];
  if (Number.isFinite(serverCount) && serverCount !== attributes.length) throw new Error(`fetched ${attributes.length} rows against a server count of ${serverCount}`);
  let rows;
  if (list.aggregate) {
    // One row per tract. Organization names are compared in memory only: counted, test entries dropped, never written.
    const byTract = new Map();
    for (const a of attributes) {
      const name = String(a[org] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!name || /\btest\b/.test(name) || (list.aggregate.excludeOrganizations ?? []).includes(name)) continue;
      const geoid = g11(a[list.geoidField]);
      const entry = byTract.get(geoid) ?? { submissions: 0, organizations: new Set(), dates: [] };
      entry.submissions++; entry.organizations.add(name);
      if (num(a[dateField]) !== null) entry.dates.push(num(a[dateField]));
      byTract.set(geoid, entry);
    }
    rows = [...byTract].map(([geoid, e]) => {
      const dates = e.dates.sort((x, y) => x - y);
      const span = dates.length ? (isoDate(dates[0]) === isoDate(dates.at(-1)) ? ` on ${isoDate(dates[0])}` : `, ${isoDate(dates[0])} to ${isoDate(dates.at(-1))}`) : '';
      return { geoid, jurisdiction: '', detail: `${e.submissions} public submission${e.submissions === 1 ? '' : 's'} from ${e.organizations.size} organization${e.organizations.size === 1 ? '' : 's'}${span}`, date: dates.length ? isoDate(dates.at(-1)) : list.date };
    });
  } else {
    rows = attributes.map(a => ({ geoid: g11(a[list.geoidField]), jurisdiction: list.jurisdictionField ? String(a[list.jurisdictionField] ?? '').trim() : '', detail: '', date: list.date }));
  }
  return { rows, receiptSha256: sha256(Buffer.concat(pages)), serverCount, pages: pages.length, editDate: meta.editingInfo?.lastEditDate ? new Date(meta.editingInfo.lastEditDate).toISOString() : null };
}
async function xlsxList(list) {
  const { bytes } = await fetchBytes(list.url, { timeoutMs: 120000 });
  const sheet = readFirstSheet(bytes);
  const header = sheet.findIndex(r => (r ?? []).includes(list.geoidField));
  if (header < 0) throw new Error(`column ${list.geoidField} not found`);
  const col = sheet[header].indexOf(list.geoidField);
  const rows = sheet.slice(header + 1).map(r => g11(r?.[col])).filter(Boolean).map(geoid => ({ geoid, jurisdiction: '', detail: '', date: list.date }));
  return { rows, receiptSha256: sha256(bytes), documentSha256: sha256(bytes) };
}
async function geojsonList(list) {
  const { bytes } = await fetchBytes(list.url, { timeoutMs: 120000 });
  const features = JSON.parse(bytes.toString('utf8')).features ?? [];
  const keep = features.filter(f => String(f.properties?.[list.geojsonFilter.field] ?? '') === list.geojsonFilter.equals);
  return { rows: keep.map(f => ({ geoid: g11(f.properties[list.geoidField]), jurisdiction: '', detail: '', date: list.date })), receiptSha256: sha256(bytes), documentSha256: sha256(bytes) };
}
async function snapshotList(list) {
  const file = path.join(ROOT, list.snapshot.path);
  const bytes = await fs.readFile(file);
  if (sha256(bytes) !== list.snapshot.sha256) throw new Error(`${list.snapshot.path} does not match the SHA-256 in sources.json; a snapshot is changed only together with its manifest entry`);
  const rows = csvObjects(bytes.toString('utf8')).map(r => ({ geoid: g11(r.geoid_2020), jurisdiction: r.jurisdiction ?? '', detail: r.detail ?? '', date: list.date }));
  return { rows, receiptSha256: list.snapshot.sha256 };
}
const READERS = { arcgis: arcgisList, xlsx: xlsxList, geojson: geojsonList, snapshot: snapshotList };
/** The rows' identity, independent of order and of the service's paging, for the weekly comparison. */
const contentHash = rows => sha256(JSON.stringify([...rows].map(r => [r.geoid, r.jurisdiction, r.detail]).sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1))));

async function documentHash(url) {
  const { bytes, contentType } = await fetchBytes(url, { timeoutMs: 120000, attempts: 2 });
  return isHtml(contentType, bytes) ? { kind: 'page text', sha256: sha256(pageText(bytes.toString('utf8'))), bytes: bytes.length } : { kind: 'file', sha256: sha256(bytes), bytes: bytes.length };
}

// ---------- check mode ----------
async function check(manifest) {
  const entries = {};
  const add = async (key, label, url, run) => {
    try { entries[key] = { label, url, ...(await run()) }; }
    catch (error) { entries[key] = { label, url, unreachable: error instanceof Error ? error.message : String(error) }; }
  };
  await add('federal:treasury', manifest.federal.treasury.label, manifest.federal.treasury.url, () => documentHash(manifest.federal.treasury.url));
  for (const w of manifest.watch) await add(`watch:${w.id}`, w.label, w.url, () => documentHash(w.url));
  for (const list of manifest.lists) {
    const label = `${list.state}: ${list.publisher} (${list.tier}${list.shipped ? '' : ', not shipped'})`;
    if (list.shipped && list.fetch !== 'snapshot') {
      await add(`list:${list.id}`, label, list.url, async () => { const r = await READERS[list.fetch](list); return { kind: 'tract rows', sha256: contentHash(r.rows), rows: r.rows.length }; });
    }
    const doc = list.fetch === 'snapshot' || !list.shipped ? (list.documentUrl ?? list.url) : list.documentUrl;
    if (doc && list.watch !== false) await add(`document:${list.id}`, `${label} - document`, doc, () => documentHash(doc));
  }
  return entries;
}
function compare(baseline, current) {
  const changed = [], unreachable = [], added = [];
  for (const [key, entry] of Object.entries(current)) {
    const before = baseline.entries?.[key];
    if (entry.unreachable) { unreachable.push({ key, ...entry }); continue; }
    if (!before || !before.sha256) { added.push({ key, ...entry }); continue; }
    if (before.sha256 !== entry.sha256) changed.push({ key, ...entry, before: before.sha256, beforeRows: before.rows });
  }
  const removed = Object.keys(baseline.entries ?? {}).filter(key => !(key in current));
  return { changed, unreachable, added, removed };
}
function report({ changed, unreachable, added, removed }, baseline) {
  const lines = [`OZ 2027 source check, ${new Date().toISOString()} (baseline ${baseline.generatedUtc ?? 'none'}).`, ''];
  if (changed.length) {
    lines.push(`## Changed (${changed.length})`, '');
    for (const c of changed) lines.push(`- **${c.label}**: ${c.url} (${c.kind}${c.rows !== undefined ? `, ${c.beforeRows ?? '?'} -> ${c.rows} rows` : ''}; ${c.before.slice(0, 12)} -> ${c.sha256.slice(0, 12)})`);
    lines.push('');
  }
  if (added.length) { lines.push(`## Not in the baseline (${added.length})`, '', ...added.map(a => `- ${a.label}: ${a.url}`), ''); }
  if (removed.length) { lines.push(`## In the baseline but no longer checked (${removed.length})`, '', ...removed.map(k => `- ${k}`), ''); }
  if (unreachable.length) { lines.push(`## Unreachable this run (${unreachable.length}; not counted as a change)`, '', ...unreachable.map(u => `- ${u.label}: ${u.url} (${u.unreachable})`), ''); }
  lines.push('To accept these as the new baseline after review: `node scripts/oz2027-refresh.mjs --check --write-baseline`, then commit `data/oz2027/baseline.json`. A changed list or document needs a refresh and an import before the application shows it.');
  return lines.join('\n');
}

// ---------- build mode ----------
async function build(manifest) {
  const started = new Date().toISOString();
  const refresh = flag('--refetch');
  const fed = manifest.federal;
  log('Downloading federal files (cached under', path.relative(ROOT, rawDir), ')');
  const treasury = await cachedDownload(fed.treasury.url, path.join(rawDir, 'OZ2-Eligible-Tracts-Data-Transparency-09232026.xlsx'), { refresh, note: fed.treasury.label });
  const appendix = await cachedDownload(manifest.watch.find(w => w.id === 'irs-rev-proc-2026-14-appendix').url, path.join(rawDir, 'rp-26-14-appendix.xlsx'), { refresh, note: 'IRS Rev. Proc. 2026-14 appendix' });
  const cdfi = await cachedDownload(fed.cdfi2018.url, path.join(rawDir, 'designated-qozs.12.14.18.xlsx'), { refresh, note: fed.cdfi2018.label });
  const rel = await cachedDownload(fed.relationship.url, path.join(rawDir, 'tab20_tract20_tract10_natl.txt'), { refresh, note: fed.relationship.label });
  const shapes = await cachedDownload(fed.geometry.url, path.join(rawDir, 'cb_2024_us_tract_500k.zip'), { refresh, note: fed.geometry.label });

  // Treasury: every tract, so a list GEOID can be told apart as eligible, ineligible or not a tract at all.
  const sheet = readFirstSheet(treasury.bytes);
  const header = sheet[0];
  const col = name => { const i = header.indexOf(name); if (i < 0) throw new Error(`Treasury workbook lacks ${name}.`); return i; };
  const C = Object.fromEntries(['census_tract_number', 'state', 'county', 'cbsa', 'poverty_rate', 'mfi_ratio', 'mfi_ub_ratio', 'temp_displacement_elig', 'eligible_lic', 'rural_status'].map(n => [n, col(n)]));
  const allTracts = new Set();
  const eligible = new Map();
  for (const r of sheet.slice(1)) {
    const geoid = g11(r[C.census_tract_number]);
    if (!/^\d{11}$/.test(geoid)) continue;
    allTracts.add(geoid);
    if (r[C.eligible_lic] !== '1') continue;
    const state = TREASURY_STATE_NAMES[r[C.state]] ?? r[C.state];
    if (STATE_FIPS[state] !== geoid.slice(0, 2)) throw new Error(`Treasury tract ${geoid} is under ${r[C.state]}, which does not match its state code.`);
    const pov = num(r[C.poverty_rate]), mfi = num(r[C.mfi_ratio]), ub = num(r[C.mfi_ub_ratio]), temp = r[C.temp_displacement_elig] === '1';
    const povertyLeg = pov !== null && pov >= 20 && (mfi === null || mfi <= 125);
    const incomeLeg = mfi !== null ? mfi <= 70 : ub !== null && ub <= 70;
    const route = povertyLeg && incomeLeg ? 'poverty_and_median_income' : povertyLeg ? 'poverty' : incomeLeg ? (mfi !== null ? 'median_income' : 'median_income_upper_bound') : temp ? 'temporary_displacement' : 'other';
    if (!['0', '1'].includes(r[C.rural_status])) throw new Error(`Treasury tract ${geoid} has rural_status ${r[C.rural_status]}.`);
    eligible.set(geoid, { geoid_2020: geoid, state, state_fips: geoid.slice(0, 2), county: String(r[C.county] ?? '').trim(), county_fips: geoid.slice(0, 5), cbsa: String(r[C.cbsa] ?? '').trim(),
      poverty_rate: pov === null ? null : round(pov, 4), mfi_ratio: mfi === null ? null : round(mfi, 4), mfi_ub_ratio: ub === null ? null : round(ub, 4), temp_displacement: temp,
      eligibility_route: route, rural_status: Number(r[C.rural_status]) });
  }
  log(`Treasury: ${allTracts.size} tracts, ${eligible.size} eligible, ${[...eligible.values()].filter(t => t.rural_status === 1).length} rural`);
  if (allTracts.size !== fed.treasury.expectedTracts || eligible.size !== fed.treasury.expectedEligible) log(`  NOTE: Treasury counts differ from the manifest's expected ${fed.treasury.expectedTracts} / ${fed.treasury.expectedEligible}.`);

  const appendixRows = readFirstSheet(appendix.bytes);
  const aHeader = appendixRows.findIndex(r => (r ?? []).includes('Census Tract Number'));
  const aCol = appendixRows[aHeader].indexOf('Census Tract Number');
  const april = new Set(appendixRows.slice(aHeader + 1).map(r => g11(r?.[aCol])).filter(Boolean));
  log(`IRS April appendix: ${april.size} tracts; ${[...eligible.keys()].filter(g => !april.has(g)).length} eligible only in Treasury's September list, ${[...april].filter(g => !eligible.has(g)).length} on April's list but not September's`);

  // CDFI 2018 designations, on 2010 tracts.
  const cdfiRows = readFirstSheet(cdfi.bytes);
  const cHeader = cdfiRows.findIndex(r => /Census Tract Number/i.test(r?.[2] ?? ''));
  if (cHeader < 0) throw new Error('CDFI workbook header not found.');
  const designated = new Map();
  for (const r of cdfiRows.slice(cHeader + 1)) if (/^\d{11}$/.test(r?.[2] ?? '')) designated.set(r[2], r[0]);
  log(`CDFI 2018 designations: ${designated.size} tracts`);

  // Connecticut: the relationship file keys 2020 tracts on the old counties, Treasury and the 2024 boundaries on the 2022
  // planning regions. Tract codes were kept, so a land tract maps by its six-digit code; an ambiguous code is recorded.
  const ctByCode = new Map();
  for (const geoid of allTracts) if (geoid.startsWith('09')) ctByCode.set(geoid.slice(5), ctByCode.has(geoid.slice(5)) ? null : geoid);
  const ctUnmapped = new Set();
  const to2024 = geoid => { if (!geoid.startsWith('09')) return geoid; const mapped = ctByCode.get(geoid.slice(5)); if (!mapped) ctUnmapped.add(geoid); return mapped ?? null; };

  // 2010 -> 2020 links for every designated 2010 tract, slivers included.
  const lines = rel.bytes.toString('utf8').replace(/^﻿/, '').split('\n');
  const h = lines[0].trim().split('|');
  const ix = name => { const i = h.indexOf(name); if (i < 0) throw new Error(`Relationship file lacks ${name}.`); return i; };
  const [i20, i10, iL20, iW20, iL10, iW10, iLP, iWP] = ['GEOID_TRACT_20', 'GEOID_TRACT_10', 'AREALAND_TRACT_20', 'AREAWATER_TRACT_20', 'AREALAND_TRACT_10', 'AREAWATER_TRACT_10', 'AREALAND_PART', 'AREAWATER_PART'].map(ix);
  const wanted2010 = new Map([...designated.keys()].map(g => [CDFI_TO_2010_ALIAS[g] ?? g, g]));
  const links = [];
  const bridged = new Set();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.trim().split('|');
    const designatedId = wanted2010.get(f[i10]);
    if (!designatedId) continue;
    const t20 = to2024(f[i20]);
    if (!t20) continue;
    const land10 = +f[iL10], land20 = +f[iL20], part = +f[iLP];
    // A tract with no land (never designated in practice) falls back to total area so a share is still defined.
    const share10 = land10 > 0 ? (part / land10) * 100 : ((part + +f[iWP]) / Math.max(1, land10 + +f[iW10])) * 100;
    const share20 = land20 > 0 ? (part / land20) * 100 : ((part + +f[iWP]) / Math.max(1, land20 + +f[iW20])) * 100;
    links.push({ geoid_2010: designatedId, geoid_2020: t20, land_part_sqm: part, share_of_2010_pct: round(Math.min(100, share10), 6), share_of_2020_pct: round(Math.min(100, share20), 6) });
    bridged.add(designatedId);
  }
  links.sort((a, b) => a.geoid_2010.localeCompare(b.geoid_2010) || a.geoid_2020.localeCompare(b.geoid_2020));
  const unbridged = [...designated.keys()].filter(g => !bridged.has(g));
  log(`Links: ${links.length} 2010->2020 parts for ${bridged.size} designated tracts; unbridged ${unbridged.length}; Connecticut codes unmapped ${ctUnmapped.size}`);
  const overlap = new Map();
  for (const l of links) overlap.set(l.geoid_2020, Math.min(100, (overlap.get(l.geoid_2020) ?? 0) + l.share_of_2020_pct));

  // Lists.
  const signals = [];
  const sourceReceipts = [];
  for (const list of manifest.lists) {
    if (!OZ2027_SIGNAL_TIERS.includes(list.tier) || !OZ2027_CONFIDENCE.includes(list.confidence)) throw new Error(`${list.id}: unknown tier or confidence.`);
    const base = { id: list.id, state: list.state, tier: list.tier, confidence: list.confidence, publisher: list.publisher, publisherClass: list.publisherClass, shipped: list.shipped,
      url: list.url ?? null, documentUrl: list.documentUrl ?? null, date: list.date, fetch: list.fetch, notes: list.notes };
    if (!list.shipped || !OZ2027_SHIPPABLE_PUBLISHERS.has(list.publisherClass)) {
      if (list.shipped) throw new Error(`${list.id}: a ${list.publisherClass} list cannot be shipped (D06).`);
      sourceReceipts.push({ ...base, reason: list.reason, expectedCount: list.expectedCount });
      log(`  ${list.id}: not shipped (${list.publisherClass})`);
      continue;
    }
    const fetchedUtc = new Date().toISOString();
    const read = await READERS[list.fetch](list);
    let document = null;
    if (list.fetch === 'snapshot' && list.watch !== false) { try { document = await documentHash(list.documentUrl); } catch (error) { document = { unreachable: error instanceof Error ? error.message : String(error) }; } }
    const byGeoid = new Map();
    const invalid = [], notTract = [], otherState = [];
    for (const row of read.rows) {
      if (!/^\d{11}$/.test(row.geoid)) { invalid.push(row.geoid); continue; }
      if (!allTracts.has(row.geoid)) { notTract.push(row.geoid); continue; }
      if (row.geoid.slice(0, 2) !== STATE_FIPS[list.state]) { otherState.push(row.geoid); continue; }
      const prior = byGeoid.get(row.geoid);
      if (prior) { if (row.jurisdiction && !prior.jurisdiction.split('; ').includes(row.jurisdiction)) prior.jurisdiction = `${prior.jurisdiction ? `${prior.jurisdiction}; ` : ''}${row.jurisdiction}`.slice(0, 200); continue; }
      byGeoid.set(row.geoid, { ...row });
    }
    let offList = 0;
    for (const row of byGeoid.values()) {
      const on = eligible.has(row.geoid);
      if (!on) offList++;
      const notes = [row.detail, on ? '' : "Not on Treasury's eligible list of 2026-09-23.", on && !april.has(row.geoid) ? "Eligible only through Treasury's September 2026 revision (not on the April appendix)." : ''].filter(Boolean).join(' ');
      signals.push({ geoid_2020: row.geoid, source_id: list.id, state: list.state, status: list.tier, jurisdiction: row.jurisdiction.slice(0, 200), source_url: list.documentUrl ?? list.url,
        source_date: /^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '') ? row.date : null, confidence: list.confidence, receipt_sha256: read.receiptSha256, on_eligible_list: on, notes: notes.slice(0, 2000) });
    }
    const receipt = { ...base, fetchedUtc, receiptSha256: read.receiptSha256, contentSha256: contentHash(read.rows), rows: read.rows.length, signals: byGeoid.size, offList,
      invalid: invalid.length, notATract: notTract, otherState, expectedCount: list.expectedCount, serverCount: read.serverCount ?? null, editDate: read.editDate ?? null,
      snapshot: list.snapshot ?? null, document };
    sourceReceipts.push(receipt);
    log(`  ${list.id}: ${read.rows.length} rows -> ${byGeoid.size} tracts (${offList} off-list${notTract.length ? `, ${notTract.length} not a tract` : ''}${otherState.length ? `, ${otherState.length} outside ${list.state}` : ''}${invalid.length ? `, ${invalid.length} invalid` : ''})${list.expectedCount !== undefined && byGeoid.size !== list.expectedCount ? `  NOTE expected ${list.expectedCount}` : ''}`);
  }
  signals.sort((a, b) => a.geoid_2020.localeCompare(b.geoid_2020) || a.source_id.localeCompare(b.source_id));

  // Geometry from the 2024 cartographic boundaries, simplified for display only.
  const { default: simplify } = await import('@turf/simplify');
  const zip = unzip(shapes.bytes);
  const shpName = zip.names().find(n => n.endsWith('.shp')), dbfName = zip.names().find(n => n.endsWith('.dbf'));
  const records = readDbf(zip(dbfName));
  const polygons = readShpPolygons(zip(shpName));
  if (records.length !== polygons.length) throw new Error('Shapefile and attribute table disagree on record count.');
  const geometry = new Map();
  records.forEach((r, i) => { if (eligible.has(r.GEOID) && polygons[i]) geometry.set(r.GEOID, polygons[i]); });
  const missing = [...eligible.keys()].filter(g => !geometry.has(g));
  if (missing.length) throw new Error(`${missing.length} eligible tracts have no 2024 boundary, e.g. ${missing.slice(0, 5).join(', ')}.`);
  log(`Geometry: ${records.length} boundaries read, ${geometry.size} eligible tracts matched`);

  const signalsBy = new Map();
  for (const s of signals) { if (!signalsBy.has(s.geoid_2020)) signalsBy.set(s.geoid_2020, []); signalsBy.get(s.geoid_2020).push(s); }
  let vertices = 0, labelOutside = 0;
  const tracts = [...eligible.values()].sort((a, b) => a.geoid_2020.localeCompare(b.geoid_2020)).map(t => {
    const raw = geometry.get(t.geoid_2020);
    const simple = simplify({ type: 'Feature', properties: {}, geometry: raw }, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false }).geometry;
    const display = roundGeometry(simple, COORDINATE_PLACES) ?? roundGeometry(raw, COORDINATE_PLACES);
    if (!display) throw new Error(`Tract ${t.geoid_2020} has no displayable polygon.`);
    for (const p of display.type === 'Polygon' ? [display.coordinates] : display.coordinates) for (const ring of p) vertices += ring.length;
    const [min_lon, min_lat, max_lon, max_lat] = bboxOf(display);
    const [label_lon, label_lat] = labelPoint(display);
    if (!pointInGeometry([label_lon, label_lat], display)) labelOutside++;
    const own = signalsBy.get(t.geoid_2020) ?? [];
    const head = headlineOf(own);
    return { ...t, in_april_appendix: april.has(t.geoid_2020), headline_status: head.status, headline_confidence: head.confidence, headline_source_id: head.sourceId,
      signal_count: own.length, overlap_2018_land_pct: round(overlap.get(t.geoid_2020) ?? 0, 6), min_lon, min_lat, max_lon, max_lat, label_lon, label_lat, display_geometry: display };
  });

  // States: the research table, with Treasury's own eligible and rural counts and this run's tract signal counts.
  const stateRows = csvObjects(await fs.readFile(STATES_FILE, 'utf8'));
  const states = stateRows.map(s => {
    if (!STATE_FIPS[s.state]) throw new Error(`Unknown jurisdiction ${s.state} in states.csv.`);
    if (!OZ2027_STATE_STATUSES.includes(s.status) || !OZ2027_CONFIDENCE.includes(s.confidence)) throw new Error(`${s.state}: unknown status or confidence.`);
    const mine = tracts.filter(t => t.state === s.state);
    const eligibleCount = mine.length, ruralCount = mine.filter(t => t.rural_status === 1).length;
    if (num(s.eligible_count) !== null && num(s.eligible_count) !== eligibleCount) log(`  NOTE ${s.state}: states.csv says ${s.eligible_count} eligible, Treasury ${eligibleCount}`);
    const withheld = sourceReceipts.filter(r => r.state === s.state && !r.shipped);
    const notes = [s.notes, ...withheld.map(w => `Tract list withheld: ${w.reason}`)].filter(Boolean).join(' ').slice(0, 4000);
    return { state: s.state, status: s.status, nominated_date: s.nominated_date || null, certified_date: s.certified_date || null, cap: num(s.cap), eligible_count: eligibleCount,
      eligible_rural_count: ruralCount, nominated_count: num(s.nominated_count), tract_signal_count: mine.filter(t => t.signal_count > 0).length,
      list_url: s.list_url, source_url: s.source_url, confidence: s.confidence, deadline_track: s.deadline_track, notes };
  }).sort((a, b) => a.state.localeCompare(b.state));
  if (states.length !== 56) throw new Error(`Expected 56 jurisdictions, found ${states.length}.`);

  const headline = Object.fromEntries(['certified', 'nominated', 'state_recommended', 'draft_for_comment', 'local_recommended', 'eligible'].map(tier => [tier, tracts.filter(t => t.headline_status === tier).length]));
  const florida = tracts.filter(t => t.state === 'Florida');
  const counts = {
    tracts: tracts.length, rural: tracts.filter(t => t.rural_status === 1).length, inAprilAppendix: tracts.filter(t => t.in_april_appendix).length,
    signals: signals.length, signalsOnList: signals.filter(s => s.on_eligible_list).length, signalsOffList: signals.filter(s => !s.on_eligible_list).length,
    tractsWithSignals: tracts.filter(t => t.signal_count > 0).length, states: states.length, links: links.length, designated2010: designated.size, bridged2010: bridged.size,
    with2018Overlap: tracts.filter(t => t.overlap_2018_land_pct >= 1).length, headline,
    routes: Object.fromEntries(['poverty', 'median_income', 'poverty_and_median_income', 'median_income_upper_bound', 'temporary_displacement', 'other'].map(r => [r, tracts.filter(t => t.eligibility_route === r).length])),
    florida: { tracts: florida.length, rural: florida.filter(t => t.rural_status === 1).length, headline: Object.fromEntries(Object.keys(headline).map(k => [k, florida.filter(t => t.headline_status === k).length])) },
    displayVertices: vertices, labelPointsOutsidePolygon: labelOutside,
  };
  const scriptSha256 = sha256(await fs.readFile(fileURLToPath(import.meta.url)));
  const bundleManifest = {
    parserVersion: OZ2027_PARSER_VERSION, preparedUtc: started, refreshScriptSha256: scriptSha256, libSha256: sha256(await fs.readFile(new URL('./oz2027-lib.mjs', import.meta.url))),
    sourcesJsonSha256: sha256(await fs.readFile(SOURCES_FILE)), statesCsvSha256: sha256(await fs.readFile(STATES_FILE)),
    federal: { treasury: treasury.receipt, appendix: appendix.receipt, cdfi2018: cdfi.receipt, relationship: rel.receipt, geometry: { ...shapes.receipt, simplifyTolerance: SIMPLIFY_TOLERANCE, coordinatePlaces: COORDINATE_PLACES } },
    bridge: { bedfordAlias: CDFI_TO_2010_ALIAS, connecticut: 'Relationship-file 2020 GEOIDs on the old Connecticut counties are re-keyed to the 2022 planning regions by their six-digit tract code; codes shared by two planning regions are left unmapped.', connecticutUnmapped: [...ctUnmapped].sort(), unbridged },
    sources: sourceReceipts, counts, rule: RULE,
  };
  bundleManifest.transformedHash = sha256(JSON.stringify({ tracts, signals, states, links }));
  const id = sha256(JSON.stringify(bundleManifest));
  const bundle = { id, parserVersion: OZ2027_PARSER_VERSION, manifest: bundleManifest, tracts, signals, states, links };
  const gz = zlib.gzipSync(JSON.stringify(bundle), { level: 9 });
  if (gz.length > MAX_BUNDLE_BYTES) throw new Error(`Bundle is ${gz.length} bytes, above ${MAX_BUNDLE_BYTES}.`);
  const importDir = path.join(outDir, 'import');
  await fs.mkdir(importDir, { recursive: true });
  const file = path.join(importDir, 'oz2027-import.json.gz');
  await fs.writeFile(file, gz);
  await fs.writeFile(`${file}.manifest.json`, JSON.stringify({ runId: id, bundleSha256: sha256(gz), bundleBytes: gz.length, ...bundleManifest }, null, 2));
  log(JSON.stringify({ runId: id, bundle: path.relative(ROOT, file), bytes: gz.length, bundleSha256: sha256(gz), counts }, null, 2));
}

const manifest = JSON.parse(await fs.readFile(SOURCES_FILE, 'utf8'));
if (flag('--check')) {
  try {
    const current = await check(manifest);
    if (flag('--write-baseline')) {
      await fs.writeFile(BASELINE_FILE, `${JSON.stringify({ generatedUtc: new Date().toISOString(), note: 'Written by node scripts/oz2027-refresh.mjs --check --write-baseline. Each entry is the hash the weekly check compares against.', entries: current }, null, 2)}\n`);
      const unreachable = Object.values(current).filter(e => e.unreachable).length;
      log(`Baseline written: ${Object.keys(current).length} entries, ${unreachable} unreachable this run.`);
    } else {
      let baseline = { entries: {} };
      try { baseline = JSON.parse(await fs.readFile(BASELINE_FILE, 'utf8')); } catch { /* no baseline: every entry is new */ }
      const result = compare(baseline, current);
      const text = report(result, baseline);
      console.log(text);
      const reportFile = option('--report', null);
      if (reportFile) await fs.writeFile(reportFile, `${text}\n`);
      const reachable = Object.values(current).filter(e => !e.unreachable).length;
      if (!reachable) { console.error('No source could be reached; the check did not run.'); process.exitCode = 2; }
      else process.exitCode = result.changed.length || result.added.length || result.removed.length ? 1 : 0;
    }
  } catch (error) {
    console.error(`OZ 2027 check failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
} else {
  await build(manifest);
}
