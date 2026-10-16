// Designated Opportunity Zone x EB-5 rural screen from official public sources.
// Explicit, offline preparer. Never invoked at app startup or on a schedule. No paid provider, no database.
//
//   node scripts/oz-eb5-screen.mjs tracts [outdir]              national tract table (CSV + XLSX + manifest)
//   node scripts/oz-eb5-screen.mjs sites <input.csv> [outdir]   point test for addresses or coordinates
//   node scripts/oz-eb5-screen.mjs parcels <MT|NC|WI> [outdir]  cadastral parcels inside rural_clear tracts
//   node scripts/oz-eb5-screen.mjs assets [outdir]              subsidized multifamily joined to the tract table
//
// EB-5 rural (INA 203(b)(5)(D)(ii), RIA 2022): outside every OMB metropolitan statistical area AND outside
// the outer boundary of any city or town with 2020 decennial population of 20,000 or more. Micropolitan
// areas do not exclude. The test is geographic; a tract is a container, not a site.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as pipModule from '@turf/boolean-point-in-polygon';
const pointInPolygon = pipModule.booleanPointInPolygon ?? pipModule.default;

const SOURCES = {
  cdfi: { file: 'designated-qozs.12.14.18.xlsx', url: 'https://www.cdfifund.gov/system/files/documents/designated-qozs.12.14.18.xlsx', note: 'CDFI Fund list of designated Qualified Opportunity Zones, December 14, 2018 (IRS Notice 2018-48 as amended by Notice 2019-42); 2010 census tract GEOIDs' },
  omb: { file: 'list1_2023.xlsx', url: 'https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx', note: 'OMB Bulletin 23-01 (July 2023) core based statistical area delineations, List 1, prepared by the Census Bureau; Connecticut on planning regions' },
  rel: { file: 'tab20_tract20_tract10_natl.txt', url: 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_natl.txt', note: 'Census Bureau 2010 to 2020 census tract relationship file with land and water area of each part' },
  iiusa: { file: 'iiusa-tea-tracts-v40.csv', url: 'https://eb5-unemployment-area.themapsolutely.com/TEA%20tracts%20-%20V40.csv', note: 'IIUSA TEA mapping tool tract table V40; external comparison source on 2020-vintage tracts; city, 2020 population, MSA and Rural_TEA per tract; methodology and redistribution terms not published' },
  irs2027: { file: 'rp-26-14-appendix.xlsx', url: 'https://www.irs.gov/pub/irs-drop/rp-26-14-appendix.xlsx', note: 'IRS Rev. Proc. 2026-14 appendix: census tracts eligible for nomination in the 2027 Opportunity Zone round, on 2020 boundaries, with the OZ 2.0 rural flag (city or town over 50,000 plus adjacent urbanized area). Eligibility is not designation and this rural flag is not the EB-5 rural definition.' },
  nmtc: { file: 'NMTC_LIC_Eligibility_Dataset_9_3_2026.xlsx', url: 'https://www.cdfifund.gov/system/files?file=2026-09/NMTC_LIC_Eligibility_Dataset_9_3_2026.xlsx', note: 'CDFI Fund New Markets Tax Credit Low-Income Community eligibility dataset, 2016-2020 American Community Survey, on 2020 census tract boundaries; linked from the CDFI Fund geographic reports page as "New Markets Tax Credit 2016-2020 ACS Low-Income Communities and Distress". Carries poverty rate, percent of benchmarked median family income, unemployment, the LIC eligibility flag and the severe/deep distress flags. Eligibility is not an allocation or an award.' },
  nmtc2015: { file: 'nmtc-2011-2015-lic-nov2-2017-4pm.xlsx', url: 'https://www.cdfifund.gov/sites/cdfi/files/documents/nmtc-2011-2015-lic-nov2-2017-4pm.xlsx', note: 'CDFI Fund New Markets Tax Credit Low-Income Community eligibility dataset, 2011-2015 American Community Survey, on 2010 census tract boundaries (November 2, 2017 release). The ACS vintage in force when the 2018 Opportunity Zone designations were made, under the same low-income-community test that defined Opportunity Zone eligibility. Carries poverty rate, percent of benchmarked median family income, unemployment, the LIC flag and the population for whom poverty status is determined. Eligibility is not an allocation or an award.' },
  acs2024_b01003: { file: 'acsdt5y2024-b01003.dat', url: 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01003.dat', note: 'Census Bureau American Community Survey 2020-2024 5-year estimates, table-based summary file, table B01003 Total Population, every geography; census tracts on 2020 boundaries' },
  acs2024_b17001: { file: 'acsdt5y2024-b17001.dat', url: 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b17001.dat', note: 'Census Bureau American Community Survey 2020-2024 5-year estimates, table-based summary file, table B17001 Poverty Status in the Past 12 Months by Sex by Age; E001 is the population for whom poverty status is determined and E002 the part with income below the poverty level' },
  acs2024_b19113: { file: 'acsdt5y2024-b19113.dat', url: 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b19113.dat', note: 'Census Bureau American Community Survey 2020-2024 5-year estimates, table-based summary file, table B19113 Median Family Income in the Past 12 Months (in 2024 inflation-adjusted dollars)' },
};
// The 2027 appendix is a 2020-vintage list, so it reaches a 2010 tract only through the relationship-file bridge.
// A 2010 tract counts as fully eligible when at least this share of its land maps to appendix successors.
const OZ2027_FULL_SHARE_PCT = 99;
const OZ2027_BASIS = 'IRS Rev. Proc. 2026-14 appendix (2027 Opportunity Zone nomination-eligibility list, 2020 tract boundaries), mapped onto this 2010 tract by land share through the Census 2010-to-2020 relationship file; the appendix rural flag is the OZ 2.0 definition (city or town over 50,000 plus adjacent urbanized area) and is not the EB-5 rural definition, which never substitutes for it.';
// ---------- incentive flags (layer 1, keyed to the 2010 tract GEOID) ----------
// Three eligibility indicators that travel with a tract and are read constantly beside an Opportunity Zone screen.
// None of them is an EB-5 input: eb5_rural_class is never derived from them and they are never derived from it.
// The two HUD layers and the CDFI file are 2020-vintage, so each reaches a 2010 tract only through the same
// relationship-file bridge the 2027 columns use, on allParts as published and before the 0.05% sliver filter.
const HUD_QCT_2026 = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0';
const HUD_DDA_2026 = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Difficult_Development_Areas_2026/FeatureServer/0';
const INCENTIVE_FULL_SHARE_PCT = 99;
const QCT_OUT_FIELDS = 'OBJECTID,GEOID,STATE,COUNTY,NAME';
const DDA_OUT_FIELDS = 'OBJECTID,ZCTA5,DDA_CODE,DDA_TYPE,DDA_NAME';
// Non-metropolitan DDA records carry no county FIPS field; the county is inside DDA_CODE as "NCNTY<fips>N<fips>"
// (for example NCNTY10005N10005, Sussex County, Delaware). Metropolitan records key on ZCTA5 instead.
const DDA_NONMETRO_CODE = /^NCNTY(\d{5})/;
const QCT_BASIS = 'HUD LIHTC Qualified Census Tracts 2026 (QUALIFIED_CENSUS_TRACTS_2026 FeatureServer layer 0), designated on 2020 census tract boundaries and mapped onto this 2010 tract by land share through the Census 2010-to-2020 relationship file. A QCT is a tract where at least 50% of households have income below 60% of area median gross income, or the poverty rate is at least 25% (26 U.S.C. 42(d)(5)(B)). QCT status means eligibility for the 30% boost to LIHTC qualified basis; it is not a housing programme award, an allocation or any statement that a project here has been funded.';
const DDA_BASIS_HEAD = 'HUD LIHTC Difficult Development Areas 2026 (Difficult_Development_Areas_2026 FeatureServer layer 0): areas with high construction, land and utility costs relative to area median gross income. DDA status means eligibility for the 30% boost to LIHTC qualified basis, not a housing programme award.';
const DDA_BASIS_METRO = `${DDA_BASIS_HEAD} Metropolitan DDAs are designated by ZIP Code Tabulation Area, not by tract or county, and this tract's county is metropolitan under OMB 2023, so answering it needs a tract-to-ZCTA crosswalk that this pass does not add. The metropolitan leg was not evaluated; only the non-metropolitan county leg is implemented here.`;
const NMTC_BASIS = 'CDFI Fund New Markets Tax Credit Low-Income Community eligibility dataset (2016-2020 American Community Survey, 2020 census tract boundaries), mapped onto this 2010 tract by land share through the Census 2010-to-2020 relationship file. LIC eligibility means the 2020 tract meets the NMTC poverty-rate test (20% or more) or the median family income test (80% or less of the benchmark), or is a high-migration rural tract. It is a programme eligibility indicator only: it is not an allocation, an award, a qualified equity investment or any statement that a project here has been financed.';
// ---------- ACS demographics (layer 1, keyed to the 2010 tract GEOID) ----------
// The same three facts at two dates: at designation (ACS 2011-2015, the vintage the 2018 designations rested on,
// on 2010 boundaries, joined directly) and the latest 5-year release (ACS 2020-2024, on 2020 boundaries, bridged).
// Sample-based estimates that describe the tract. None of them is an EB-5 input and none feeds eb5_rural_class.
// A count is summed across 2020 successors only when every one of them lies wholly inside the 2010 tract; a median
// is never combined; nothing is apportioned by land share, because that would invent a figure the source does not publish.
const ACS_LATEST_LABEL = 'ACS 2020-2024 5-year';
const ACS_MFI_TOP_CODE = 250001;
// A 2020 successor lies wholly inside the 2010 tract when at least this share of the successor's own land is in the part.
const CONTAINMENT_SHARE = 0.999;
const ACS2015_BASIS = 'CDFI Fund NMTC Low-Income Community eligibility dataset for the 2011-2015 American Community Survey (nmtc-2011-2015-lic-nov2-2017-4pm.xlsx, November 2, 2017), on 2010 census tract boundaries, joined directly on this tract\'s GEOID with no bridge. This is the ACS vintage in force when the 2018 Opportunity Zone designations were made, and the low-income-community test it applies (poverty rate 20% or more, or median family income 80% or less of the statewide or metropolitan benchmark) is the test that defined Opportunity Zone eligibility. The population is the ACS population for whom poverty status is determined, not total population. These are sample estimates whose margins of error are not carried here; they describe the tract a decade ago, not a current condition, and they are not an EB-5 input.';
const ACS2024_BASIS = 'Census Bureau American Community Survey 2020-2024 5-year estimates, table-based summary file, tables B01003 (total population), B17001 (poverty status in the past 12 months: E001 population for whom poverty status is determined, E002 income below the poverty level) and B19113 (median family income in the past 12 months, 2024 inflation-adjusted dollars), on 2020 census tract boundaries, read onto this 2010 tract through the Census 2010-to-2020 relationship file. Counts are summed only across successors that lie wholly inside the tract, a median is never combined, and nothing is apportioned by land share. These are sample estimates whose margins of error are not carried here; they are not an EB-5 input and not a market study.';
const GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/';
const HUD_OZ ='https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13/query';
const BENCHMARK = 'Public_AR_Current';
// Bedford city, VA (51515) was retired into Bedford County (51019) in 2013. CDFI lists the county code; 2010-vintage geometry and relationship files carry the city code.
const CDFI_TO_2010_ALIAS = { '51019050100': '51515050100' };
const NEW_ENGLAND = new Set(['09', '23', '25', '33', '44', '50']);
// Connecticut (09) is resolved through its own interior-point path because OMB 2023 keys it on planning regions.
// The other five New England states get an interior-point town test when they would otherwise classify rural_clear.
const NEW_ENGLAND_TOWN_TEST = new Set(['23', '25', '33', '44', '50']);
const POP_THRESHOLD = 20000;
// 2020 successors holding this share or less of the 2010 tract's land are treated as boundary slivers for the
// place test and listed in dropped_successors. bridge_type and the metro-successor note are computed before it.
const SLIVER_SHARE = 0.0005;
const PAUSE_MS = 150;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
// Hash of this file as loaded, so a manifest names the code that ran even if the file is edited during a long run.
const SCRIPT_SHA256 = sha256(await fs.readFile(fileURLToPath(import.meta.url)));
const pad11 = (s) => String(s ?? '').trim().padStart(11, '0');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- downloads with receipts ----------
async function fetchCached(src, rawDir) {
  await fs.mkdir(rawDir, { recursive: true });
  const file = path.join(rawDir, src.file);
  const receiptPath = file + '.receipt.json';
  try {
    const buf = await fs.readFile(file);
    const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
    if (receipt.sha256 === sha256(buf)) return { buf, receipt };
  } catch {}
  process.stdout.write(`Downloading ${src.url}\n`);
  const response = await fetch(src.url, { signal: AbortSignal.timeout(240000), redirect: 'follow' });
  if (!response.ok) throw new Error(`${src.url} returned HTTP ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  const receipt = { file: src.file, url: src.url, note: src.note, sha256: sha256(buf), bytes: buf.length, fetched_utc: new Date().toISOString() };
  await fs.writeFile(file, buf);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  return { buf, receipt };
}

// Bounded retry: at most four attempts per request, then the caller records the failure on the row.
async function fetchJson(url) {
  const attempts = 4;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await pause(1000 * attempt * attempt);
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

// ---------- minimal zip and xlsx (no dependencies) ----------
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
  return (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (buf.readUInt32LE(entry.local) !== 0x04034b50) throw new Error('Bad zip local header.');
    const n = buf.readUInt16LE(entry.local + 26), e = buf.readUInt16LE(entry.local + 28);
    const data = buf.subarray(entry.local + 30 + n + e, entry.local + 30 + n + e + entry.csize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Unsupported zip method ${entry.method}.`);
  };
}
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const FALLBACK_SHEET = 'xl/worksheets/sheet1.xml';
// The first worksheet is whichever part xl/workbook.xml's first <sheet r:id> points at, resolved through
// xl/_rels/workbook.xml.rels. Producers are free to name it sheet3.xml or put it outside xl/worksheets/,
// so assuming sheet1.xml silently reads the wrong table. Returns the part name plus why, if it could not resolve.
function firstSheetPart(get) {
  const workbook = get('xl/workbook.xml');
  if (!workbook) return { part: '', why: 'xl/workbook.xml is absent' };
  const sheet = workbook.toString('utf8').match(/<sheet\b[^>]*?\sr:id="([^"]+)"/);
  if (!sheet) return { part: '', why: 'xl/workbook.xml has no <sheet> element carrying an r:id' };
  const rels = get('xl/_rels/workbook.xml.rels');
  if (!rels) return { part: '', why: `xl/_rels/workbook.xml.rels is absent, so relationship ${sheet[1]} cannot be resolved` };
  const id = sheet[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rel = rels.toString('utf8').match(new RegExp(`<Relationship\\b[^>]*?\\sId="${id}"[^>]*>`));
  const target = rel?.[0].match(/\sTarget="([^"]+)"/)?.[1];
  if (!target) return { part: '', why: `relationship ${sheet[1]} is missing from xl/_rels/workbook.xml.rels or carries no Target` };
  // Target may be package-absolute ("/xl/worksheets/sheet1.xml") or relative to the xl/ part ("worksheets/sheet1.xml").
  return { part: target.startsWith('/') ? target.replace(/^\/+/, '') : `xl/${target.replace(/^\.\//, '')}`, why: '' };
}
function readFirstSheet(zipBuf) {
  const get = unzip(zipBuf);
  const shared = [];
  const sharedXml = get('xl/sharedStrings.xml');
  if (sharedXml) for (const m of sharedXml.toString('utf8').matchAll(/<si>(.*?)<\/si>/gs)) shared.push(decodeXml(m[1].replace(/<rPh>.*?<\/rPh>/gs, '').replace(/<[^>]+>/g, '')));
  const first = firstSheetPart(get);
  let sheetXml = first.part ? get(first.part) : null;
  if (!sheetXml) {
    const why = first.why || `the first-sheet relationship resolved to ${first.part}, which this archive does not contain`;
    sheetXml = get(FALLBACK_SHEET);
    if (!sheetXml) throw new Error(`Cannot locate the workbook's first worksheet: ${why}; the fallback part ${FALLBACK_SHEET} is absent as well.`);
    process.stderr.write(`Warning: ${why}; falling back to ${FALLBACK_SHEET}.\n`);
  }
  const rows = new Map();
  for (const m of sheetXml.toString('utf8').matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const [, col, row, attrs, inner = ''] = m;
    const v = inner.match(/<v>(.*?)<\/v>/s), is = inner.match(/<is>(.*?)<\/is>/s);
    // Parse the cell type attribute by value: "s" is a shared-string index, "inlineStr" carries <is>,
    // "str" is a formula's string result in <v>, and every other type ("n", "b", "e", "d") is a literal <v>.
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
  return [...rows.keys()].sort((a, b) => a - b).map((k) => rows.get(k));
}
function zipFiles(files) {
  const parts = [], central = [];
  let offset = 0;
  // Constant DOS timestamp, 2020-01-01 00:00:00. The manifest records a SHA-256 of the XLSX; a wall-clock stamp
  // in every local and central header changes those bytes on every run, so two runs over identical data would
  // report different hashes and the output could never be shown to be reproducible.
  const dosTime = 0;
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, content] of files) {
    // Content may already be a Buffer: large sheets are assembled in chunks because one joined string overflows the V8 string limit.
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), comp = zlib.deflateRawSync(data, { level: 6 }), crc = zlib.crc32(data), nameBuf = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    parts.push(lh, nameBuf, comp); central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}
function writeXlsx(sheets) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
  ];
  sheets.forEach((sheet, i) => {
    let width = 0;
    for (const r of sheet.rows) if (r.length > width) width = r.length;
    // Assemble the sheet body in buffered chunks. A single joined string overflows the V8 string limit on parcel-sized sheets.
    const parts = [Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>`, 'utf8')];
    let chunk = [];
    sheet.rows.forEach((row, ri) => {
      chunk.push(`<row r="${ri + 1}">${row.map((v, ci) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = `${colName(ci)}${ri + 1}`;
        return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('')}</row>`);
      if (chunk.length >= 5000) { parts.push(Buffer.from(chunk.join(''), 'utf8')); chunk = []; }
    });
    if (chunk.length) parts.push(Buffer.from(chunk.join(''), 'utf8'));
    parts.push(Buffer.from(`</sheetData><autoFilter ref="A1:${colName(width - 1)}${sheet.rows.length}"/></worksheet>`, 'utf8'));
    files.push([`xl/worksheets/sheet${i + 1}.xml`, Buffer.concat(parts)]);
  });
  return zipFiles(files);
}

// ---------- csv ----------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}
const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
// Same bytes as toCsv, built in slices so a parcel-sized table never needs one string.
function toCsvBuffer(rows, bom = true, slice = 20000) {
  const parts = bom ? [Buffer.from('﻿', 'utf8')] : [];
  for (let i = 0; i < rows.length; i += slice) {
    parts.push(Buffer.from(rows.slice(i, i + slice).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8'));
  }
  return Buffer.concat(parts);
}
const objectsToRows = (objects, columns) => [columns, ...objects.map((o) => columns.map((c) => o[c] ?? ''))];

// ---------- source loaders ----------
function loadCdfi(buf) {
  const rows = readFirstSheet(buf);
  const headerIndex = rows.findIndex((r) => /Census Tract Number/i.test(r[2] ?? ''));
  if (headerIndex < 0) throw new Error('CDFI workbook header not found.');
  const tracts = [];
  for (const r of rows.slice(headerIndex + 1)) if (/^\d{11}$/.test(r[2] ?? '')) tracts.push({ geoid: r[2], state: r[0], county_name: r[1], tract_type: r[3], acs_source: r[4] });
  const ids = new Set(tracts.map((t) => t.geoid));
  if (ids.size !== tracts.length) throw new Error('CDFI list has duplicate tract IDs.');
  return tracts;
}
function loadOmb(buf) {
  const rows = readFirstSheet(buf);
  const headerIndex = rows.findIndex((r) => /CBSA Code/i.test(r[0] ?? ''));
  if (headerIndex < 0) throw new Error('OMB workbook header not found.');
  const byCounty = new Map();
  for (const r of rows.slice(headerIndex + 1)) {
    if (!/^\d{2}$/.test(r[9] ?? '') || !/^\d{3}$/.test(r[10] ?? '')) continue;
    // List 1 carries exactly two values in this column. Anything else means the layout moved or the file changed;
    // defaulting an unrecognised value to micropolitan would silently pass a metropolitan county as EB-5 rural.
    const kind = String(r[4] ?? '').trim();
    if (kind !== 'Metropolitan Statistical Area' && kind !== 'Micropolitan Statistical Area') {
      throw new Error(`OMB List 1 row for county ${r[9]}${r[10]} (${r[7] ?? ''}) has Metropolitan/Micropolitan value "${kind}"; expected "Metropolitan Statistical Area" or "Micropolitan Statistical Area".`);
    }
    byCounty.set(r[9] + r[10], { cbsa_code: r[0], cbsa_title: r[3], cbsa_type: kind === 'Metropolitan Statistical Area' ? 'metropolitan' : 'micropolitan', central_outlying: r[11], county_name: r[7] });
  }
  if (byCounty.size < 1800) throw new Error(`OMB list parsed only ${byCounty.size} counties.`);
  return byCounty;
}
function loadRelationship(buf) {
  const lines = buf.toString('utf8').replace(/^﻿/, '').split('\n');
  const header = lines[0].trim().split('|');
  const col = (n) => { const i = header.indexOf(n); if (i < 0) throw new Error(`Relationship file lacks ${n}.`); return i; };
  const i20 = col('GEOID_TRACT_20'), i10 = col('GEOID_TRACT_10'), iLand10 = col('AREALAND_TRACT_10'), iWater10 = col('AREAWATER_TRACT_10'), iLandPart = col('AREALAND_PART'), iWaterPart = col('AREAWATER_PART');
  // The 2020 tract's own area is kept beside each part so a caller can tell a successor that lies wholly inside the
  // 2010 tract from one that extends beyond it. Nothing that existed before reads these two fields.
  const iLand20 = col('AREALAND_TRACT_20'), iWater20 = col('AREAWATER_TRACT_20');
  const by2010 = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.trim().split('|');
    const key = f[i10];
    if (!by2010.has(key)) by2010.set(key, { land10: +f[iLand10], water10: +f[iWater10], parts: [] });
    by2010.get(key).parts.push({ t20: f[i20], land: +f[iLandPart], water: +f[iWaterPart], land20: +f[iLand20], water20: +f[iWater20] });
  }
  return by2010;
}
function loadIiusa(buf) {
  const rows = parseCsv(buf.toString('utf8'));
  const header = rows[0];
  const col = (n) => { const i = header.indexOf(n); if (i < 0) throw new Error(`IIUSA file lacks ${n}.`); return i; };
  const iId = col('CT_FIPS'), iCounty = col('county_FIPS'), iCountyName = col('county_name'), iCity = col('city_town_geography'), iPop = col('city_pop_2020_census'), iMsaCode = col('MSA_CBSA_code'), iMsa = col('MSA_geography'), iRural = col('Rural_TEA');
  const byTract = new Map();
  for (const r of rows.slice(1)) {
    const city = r[iCity] ?? '';
    // IIUSA's city_town_geography suffixes are: city, CDP, town, (balance), village, borough, municipality,
    // county, township and the bare consolidated name "Princeton". A "(balance)" entry, a city-county
    // consolidation ("... County", "... municipality") and Princeton are not plain incorporated cities or towns:
    // the population belongs to a county-wide or merged entity, so the outer-boundary question is not settled by
    // the name alone. They are kept separate rather than counted as an incorporated place of 20,000 or more.
    const kind = /^Not in a City\/Town/i.test(city) ? 'none'
      : /\bCDP$/i.test(city) ? 'cdp'
      : /\(balance\)/i.test(city) || /\s(?:county|municipality|princeton)$/i.test(city) ? 'consolidated'
      : 'incorporated';
    const pop = /^\d+$/.test(r[iPop] ?? '') ? +r[iPop] : null;
    const hasMsa = /^\d+$/.test(r[iMsaCode] ?? '');
    byTract.set(pad11(r[iId]), { county: pad11(r[iCounty]).slice(-5), county_name: r[iCountyName], city: kind === 'none' ? '' : city, kind, pop, msa_code: hasMsa ? r[iMsaCode] : '', msa: hasMsa ? r[iMsa] : '', rural: r[iRural] === 'TRUE' ? 'TRUE' : r[iRural] === 'FALSE' ? 'FALSE' : '' });
  }
  if (byTract.size < 80000) throw new Error(`IIUSA file parsed only ${byTract.size} tracts.`);
  return byTract;
}
// IRS Rev. Proc. 2026-14 appendix: State | County | Census Tract Number | Rural Status, one row per eligible
// 2020-vintage tract. Excel stores the tract number as a number, so 4,477 of the 25,332 ids arrive ten digits
// long with the leading zero gone; they are padded back to eleven rather than read as a different tract.
function loadOz2027(buf) {
  const rows = readFirstSheet(buf);
  const headerIndex = rows.findIndex((r) => /Census Tract Number/i.test(r[2] ?? ''));
  if (headerIndex < 0) throw new Error('IRS 2027 appendix header not found (expected "Census Tract Number" in column C).');
  const byTract = new Map();
  let ruralRows = 0, unexpected = new Set();
  for (const r of rows.slice(headerIndex + 1)) {
    const raw = String(r[2] ?? '').trim();
    if (!/^\d{10,11}$/.test(raw)) continue;
    const status = String(r[3] ?? '').trim();
    // The column carries exactly "Rural" and "Non-rural". Reading anything else as non-rural would quietly
    // understate the OZ 2.0 rural share, so unrecognised values are collected and refused below.
    if (status !== 'Rural' && status !== 'Non-rural') { unexpected.add(status); continue; }
    const rural = status === 'Rural';
    if (rural) ruralRows++;
    byTract.set(pad11(raw), { rural, state: r[0] ?? '', county: r[1] ?? '', rural_status: status });
  }
  if (unexpected.size) throw new Error(`IRS 2027 appendix Rural Status column carries unexpected values: ${[...unexpected].map((v) => `"${v}"`).join(', ')}; expected only "Rural" and "Non-rural".`);
  if (byTract.size !== 25332) throw new Error(`IRS 2027 appendix parsed ${byTract.size} eligible tracts; the published appendix carries 25,332.`);
  return { byTract, eligible: byTract.size, rural: ruralRows, non_rural: byTract.size - ruralRows };
}

// ---------- incentive-flag loaders ----------
// One HUD ArcGIS layer read end to end with keyset paging on the object ID, the same scheme the parcel and asset
// modes use and for the same reason: resultOffset paging returns overlapping windows on some services. The layer's
// own metadata document is fetched first and cached with a receipt, so what the publisher says about the dataset
// (its name, description and field list) is on the record beside the rows and can be quoted rather than assumed.
async function fetchIncentiveLayer(layerUrl, dir, outFields, pageCap = 2000) {
  await fs.mkdir(dir, { recursive: true });
  const receipts = [];
  const meta = await cachedQuery(layerUrl, { f: 'json' }, path.join(dir, 'layer.json'), 'GET');
  if (!meta.cached) await pause(PAUSE_MS);
  if (meta.json.error) throw new Error(`${layerUrl} metadata: ${JSON.stringify(meta.json.error)}`);
  receipts.push({ file: 'layer.json', ...meta.receipt });
  const url = `${layerUrl}/query`;
  const countReply = await cachedQuery(url, { where: '1=1', returnCountOnly: 'true', f: 'json' }, path.join(dir, 'count.json'));
  if (!countReply.cached) await pause(PAUSE_MS);
  if (countReply.json.error) throw new Error(`${url} count query: ${JSON.stringify(countReply.json.error)}`);
  const serverCount = typeof countReply.json.count === 'number' ? countReply.json.count : '';
  receipts.push({ file: 'count.json', ...countReply.receipt });
  const seen = new Set(), records = [];
  let last = -1, pages = 0, duplicates = 0;
  for (let page = 0; page < 500; page++) {
    const params = { where: `OBJECTID > ${last}`, outFields, orderByFields: 'OBJECTID ASC', resultRecordCount: String(pageCap), returnGeometry: 'false', f: 'json' };
    const file = path.join(dir, `page${page + 1}.json`);
    const reply = await cachedQuery(url, params, file);
    if (reply.json.error) throw new Error(`${url} page ${page + 1}: ${JSON.stringify(reply.json.error)}`);
    if (!reply.cached) await pause(PAUSE_MS);
    pages = page + 1;
    receipts.push({ file: path.basename(file), ...reply.receipt });
    let added = 0;
    for (const feature of reply.json.features ?? []) {
      const attributes = feature.attributes ?? {};
      const oid = Number(attributes.OBJECTID);
      if (!Number.isFinite(oid)) throw new Error(`${url} page ${page + 1}: feature without a numeric OBJECTID; keyset paging needs it.`);
      if (seen.has(oid)) { duplicates++; continue; }
      seen.add(oid);
      if (oid > last) last = oid;
      records.push(attributes);
      added++;
    }
    if (added === 0) break;
  }
  const reconciliation = serverCount === '' ? 'no_server_count' : serverCount === records.length ? 'complete' : 'incomplete';
  const layerMeta = { name: textOf(meta.json.name), description: textOf(meta.json.description), fields: (meta.json.fields ?? []).map((f) => f.name), max_record_count: meta.json.maxRecordCount ?? '' };
  process.stdout.write(`${layerUrl}: server ${serverCount} fetched ${records.length} across ${pages} pages (${reconciliation}${duplicates ? `, ${duplicates} duplicate object IDs dropped` : ''})\n`);
  return { records, pages, serverCount, duplicates, receipts, reconciliation, meta: layerMeta };
}

// QCT records are one polygon per qualified tract, keyed on an 11-digit GEOID. HUD has designated QCTs on 2020
// tract boundaries since the 2023 designation year; runTracts checks that claim against the relationship file
// rather than trusting it, and records the result. Only the GEOID and two identifying attributes are kept.
function parseQct2026(records) {
  const byTract = new Map();
  const malformed = new Set();
  let duplicateIds = 0;
  for (const a of records) {
    const raw = textOf(a.GEOID);
    if (!/^\d{11}$/.test(raw)) { malformed.add(raw); continue; }
    if (byTract.has(raw)) { duplicateIds++; continue; }
    byTract.set(raw, { state: textOf(a.STATE), county: textOf(a.COUNTY), name: textOf(a.NAME) });
  }
  if (malformed.size) throw new Error(`HUD QCT 2026 layer carries ${malformed.size} distinct GEOID values that are not 11 digits (for example ${[...malformed].slice(0, 5).map((v) => `"${v}"`).join(', ')}); the tract key cannot be built from them.`);
  return { byTract, tracts: byTract.size, duplicate_geoids: duplicateIds };
}

// DDAs are not tract-keyed. Metropolitan ("SA", small area) records are designated by ZIP Code Tabulation Area and
// carry ZCTA5; non-metropolitan ("NM") records are designated along county boundaries and carry the county FIPS
// inside DDA_CODE. Only the county leg is joined here. An unrecognised DDA_TYPE is refused rather than defaulted,
// because reading a metropolitan record as a county record would mark whole counties as designated.
function parseDda2026(records) {
  const nonMetroCounties = new Map();
  const unexpectedTypes = new Set(), unparsedCodes = new Set(), metroZctas = new Set();
  let metroRows = 0, nonMetroRows = 0, metroWithoutZcta = 0;
  for (const a of records) {
    const type = textOf(a.DDA_TYPE);
    if (type !== 'NM' && type !== 'SA') { unexpectedTypes.add(type); continue; }
    if (type === 'SA') {
      metroRows++;
      const zcta = textOf(a.ZCTA5);
      if (zcta) metroZctas.add(zcta); else metroWithoutZcta++;
      continue;
    }
    nonMetroRows++;
    const match = DDA_NONMETRO_CODE.exec(textOf(a.DDA_CODE));
    if (!match) { unparsedCodes.add(textOf(a.DDA_CODE)); continue; }
    nonMetroCounties.set(match[1], { name: textOf(a.DDA_NAME), code: textOf(a.DDA_CODE) });
  }
  if (unexpectedTypes.size) throw new Error(`HUD DDA 2026 layer carries unexpected DDA_TYPE values: ${[...unexpectedTypes].map((v) => `"${v}"`).join(', ')}; expected only "NM" (non-metropolitan, county-designated) and "SA" (metropolitan small area, ZCTA-designated).`);
  if (unparsedCodes.size) throw new Error(`HUD DDA 2026 non-metropolitan records carry DDA_CODE values with no NCNTY<county FIPS> prefix: ${[...unparsedCodes].slice(0, 5).map((v) => `"${v}"`).join(', ')}; the county key cannot be built from them.`);
  return { nonMetroCounties, non_metro_rows: nonMetroRows, non_metro_counties: nonMetroCounties.size, metro_rows: metroRows, metro_zctas: metroZctas.size, metro_rows_without_zcta: metroWithoutZcta };
}

// CDFI Fund NMTC LIC eligibility workbook, first sheet "2016-2020": a two-line header (row 1 groups the distress
// columns, row 2 names them) and one row per 2020 census tract. Columns are located by header text, not by letter.
// "NA" is the file's own missing-value marker on the poverty and income columns and is carried through as blank
// rather than read as zero; any other unparseable value is refused.
function loadNmtc(buf) {
  const rows = readFirstSheet(buf);
  const headerIndex = rows.findIndex((r) => /Census Tract Number FIPS code/i.test(r[0] ?? ''));
  if (headerIndex < 0) throw new Error('CDFI NMTC eligibility workbook header not found (expected "2020 Census Tract Number FIPS code. GEOID" in column A).');
  const header = rows[headerIndex];
  const col = (pattern, label) => { const i = header.findIndex((h) => pattern.test(h ?? '')); if (i < 0) throw new Error(`CDFI NMTC eligibility workbook lacks the ${label} column.`); return i; };
  const iLic = col(/Qualify For NMTC Low-Income Community/i, 'LIC eligibility'), iPoverty = col(/Census Tract Poverty Rate/i, 'poverty rate');
  const iMfi = col(/Percent of Benchmarked Median Family Income/i, 'median family income ratio'), iMetro = col(/Metro\/Non-metro Designation/i, 'metro designation');
  const iSevere = col(/^Severe Distress/i, 'severe distress'), iDeep = col(/^Deep Distress/i, 'deep distress');
  const byTract = new Map();
  const unexpectedLic = new Set(), unparsedNumbers = new Set();
  let parsed = 0, eligible = 0, severe = 0, deep = 0, nonMetro = 0, povertyNa = 0, mfiNa = 0, duplicates = 0;
  // The file writes the median family income column as a ratio (0.736 = 73.6% of the benchmark) even though its
  // header calls it a percent, so it is multiplied by 100 once here and the column name says pct.
  const number = (value, label, geoid, naCounter) => {
    const s = String(value ?? '').trim();
    if (s === '' || /^N\/?A$/i.test(s)) { naCounter(); return ''; }
    const n = Number(s);
    if (!Number.isFinite(n)) { unparsedNumbers.add(`${label} "${s}" (tract ${geoid})`); return ''; }
    return n;
  };
  for (const r of rows.slice(headerIndex + 1)) {
    const geoid = String(r[0] ?? '').trim();
    if (!/^\d{10,11}$/.test(geoid)) continue;
    const key = pad11(geoid);
    const lic = String(r[iLic] ?? '').trim().toUpperCase();
    if (lic !== 'YES' && lic !== 'NO') { unexpectedLic.add(String(r[iLic] ?? '').trim()); continue; }
    if (byTract.has(key)) { duplicates++; continue; }
    const poverty = number(r[iPoverty], 'poverty rate', key, () => { povertyNa++; });
    const mfi = number(r[iMfi], 'median family income ratio', key, () => { mfiNa++; });
    parsed++;
    if (lic === 'YES') eligible++;
    const severeFlag = String(r[iSevere] ?? '').trim().toUpperCase() === 'YES';
    const deepFlag = String(r[iDeep] ?? '').trim().toUpperCase() === 'YES';
    const metro = String(r[iMetro] ?? '').trim();
    if (severeFlag) severe++;
    if (deepFlag) deep++;
    if (/^Non-metro/i.test(metro)) nonMetro++;
    byTract.set(key, { lic: lic === 'YES', poverty, mfi_ratio_pct: mfi === '' ? '' : +(mfi * 100).toFixed(1), metro, severe: severeFlag, deep: deepFlag });
  }
  if (unexpectedLic.size) throw new Error(`CDFI NMTC eligibility column "${header[iLic]}" carries unexpected values: ${[...unexpectedLic].slice(0, 5).map((v) => `"${v}"`).join(', ')}; expected only "YES" and "NO".`);
  if (unparsedNumbers.size) throw new Error(`CDFI NMTC eligibility workbook carries values that are neither a number nor the file's "NA" marker: ${[...unparsedNumbers].slice(0, 5).join('; ')}.`);
  if (duplicates) throw new Error(`CDFI NMTC eligibility workbook repeats ${duplicates} tract GEOIDs; the file is expected to carry one row per 2020 census tract.`);
  if (byTract.size < 70000) throw new Error(`CDFI NMTC eligibility workbook parsed only ${byTract.size} tracts; the 2020 tract universe is about 85,000.`);
  return { byTract, tracts: byTract.size, rows_parsed: parsed, eligible, not_eligible: parsed - eligible, severe_distress: severe, deep_distress: deep, non_metro: nonMetro, poverty_rate_na: povertyNa, mfi_ratio_na: mfiNa, acs_vintage: '2016-2020 American Community Survey', header_row: header };
}

// One 2020-vintage list read onto a 2010 tract by land share, on the bridge as published. Returns the share and a
// four-value verdict on the same thresholds the 2027 columns use: yes at or above the full share, partial above 0,
// no at 0, and unknown when the tract has no bridge to 2020 tracts at all.
function bridgedShare(allParts, has) {
  const share = allParts.filter((p) => has(p.t20)).reduce((s, p) => s + p.share, 0);
  const pct = +(share * 100).toFixed(1);
  return { pct, verdict: pct >= INCENTIVE_FULL_SHARE_PCT ? 'yes' : share > 0 ? 'partial' : 'no' };
}

// ---------- ACS loaders ----------
// CDFI Fund NMTC LIC workbook for the 2011-2015 ACS, first sheet "NMTC LICs 2011-2015 ACS": one header row and one
// row per 2010 census tract. Columns are located by header text, never by letter. "N/A" is the file's own
// missing-value marker and is carried through as blank; any other unparseable value is refused. Unlike the
// 2016-2020 file, the income column here is already a percent, and that is checked rather than assumed: a national
// column whose median sits below 2 is a ratio, and the loader refuses to multiply by an assumed 100.
function loadNmtc2015(buf) {
  const rows = readFirstSheet(buf);
  const headerIndex = rows.findIndex((r) => /2010 Census Tract Number FIPS code/i.test(r[0] ?? ''));
  if (headerIndex < 0) throw new Error('CDFI NMTC 2011-2015 workbook header not found (expected "2010 Census Tract Number FIPS code. GEOID" in column A).');
  const header = rows[headerIndex];
  const col = (pattern, label) => { const i = header.findIndex((h) => pattern.test(h ?? '')); if (i < 0) throw new Error(`CDFI NMTC 2011-2015 workbook lacks the ${label} column.`); return i; };
  const iLic = col(/Qualify For NMTC Low-Income Community/i, 'LIC eligibility'), iPoverty = col(/Census Tract Poverty Rate/i, 'poverty rate');
  const iMfi = col(/Percent of Benchmarked Median Family Income/i, 'median family income ratio'), iPop = col(/Population for whom poverty status is determined/i, 'poverty universe population');
  const byTract = new Map();
  const unexpectedLic = new Set(), unparsed = new Set(), mfiValues = [];
  let eligible = 0, povertyNa = 0, mfiNa = 0, popNa = 0, duplicates = 0;
  const number = (value, label, geoid, onNa) => {
    const s = String(value ?? '').trim();
    if (s === '' || /^N\/?A$/i.test(s)) { onNa(); return ''; }
    const n = Number(s);
    if (!Number.isFinite(n)) { unparsed.add(`${label} "${s}" (tract ${geoid})`); return ''; }
    return n;
  };
  for (const r of rows.slice(headerIndex + 1)) {
    const geoid = String(r[0] ?? '').trim();
    if (!/^\d{10,11}$/.test(geoid)) continue;
    const key = pad11(geoid);
    const lic = String(r[iLic] ?? '').trim().toUpperCase();
    if (lic !== 'YES' && lic !== 'NO') { unexpectedLic.add(String(r[iLic] ?? '').trim()); continue; }
    if (byTract.has(key)) { duplicates++; continue; }
    const poverty = number(r[iPoverty], 'poverty rate', key, () => { povertyNa++; });
    const mfi = number(r[iMfi], 'median family income ratio', key, () => { mfiNa++; });
    const pop = number(r[iPop], 'poverty universe population', key, () => { popNa++; });
    if (mfi !== '') mfiValues.push(mfi);
    if (lic === 'YES') eligible++;
    byTract.set(key, { lic: lic === 'YES', poverty: poverty === '' ? '' : +poverty.toFixed(1), mfi_pct: mfi === '' ? '' : +mfi.toFixed(1), pop: pop === '' ? '' : Math.round(pop) });
  }
  if (unexpectedLic.size) throw new Error(`CDFI NMTC 2011-2015 eligibility column "${header[iLic]}" carries unexpected values: ${[...unexpectedLic].slice(0, 5).map((v) => `"${v}"`).join(', ')}; expected only "Yes" and "No".`);
  if (unparsed.size) throw new Error(`CDFI NMTC 2011-2015 workbook carries values that are neither a number nor the file's "N/A" marker: ${[...unparsed].slice(0, 5).join('; ')}.`);
  if (duplicates) throw new Error(`CDFI NMTC 2011-2015 workbook repeats ${duplicates} tract GEOIDs; the file is expected to carry one row per 2010 census tract.`);
  if (byTract.size < 70000 || byTract.size > 80000) throw new Error(`CDFI NMTC 2011-2015 workbook parsed ${byTract.size} tracts; the 2010 tract universe is about 74,000.`);
  mfiValues.sort((a, b) => a - b);
  const mfiMedian = mfiValues[Math.floor(mfiValues.length / 2)];
  if (!(mfiMedian > 2)) throw new Error(`CDFI NMTC 2011-2015 income column reads as a ratio (national median ${mfiMedian}), not the percent its header promises; refusing to multiply by an assumed 100.`);
  return { byTract, tracts: byTract.size, eligible, not_eligible: byTract.size - eligible, poverty_rate_na: povertyNa, mfi_ratio_na: mfiNa, population_na: popNa, mfi_median_pct: +mfiMedian.toFixed(1), acs_vintage: '2011-2015 American Community Survey', header_row: header };
}

// One ACS table-based summary file: a pipe-delimited header naming every estimate and margin cell, then one row
// per geography of every summary level. Only census tract rows (GEO_ID 1400000US<geoid>) and the requested
// estimate cells are kept. A value that is not a plain non-negative integer is a Census jam value (for example
// -666666666, "estimate not available") and is carried as blank with the code counted, never as a number.
function loadAcsTable(buf, table, cells) {
  const text = buf.toString('utf8');
  const firstBreak = text.indexOf('\n');
  const header = text.slice(0, firstBreak).replace(/^﻿/, '').trim().split('|');
  if (header[0] !== 'GEO_ID') throw new Error(`ACS table ${table}: expected GEO_ID in the first column, found "${header[0]}".`);
  const wanted = cells.map((c) => { const name = `${table}_E${String(c).padStart(3, '0')}`; const i = header.indexOf(name); if (i < 0) throw new Error(`ACS table ${table} lacks ${name}.`); return { c, i, name }; });
  const byTract = new Map(), jam = {};
  let rows = 0, duplicates = 0, start = firstBreak + 1;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    if (text.startsWith('1400000US', start)) {
      const f = text.slice(start, end).trim().split('|');
      const geoid = f[0].slice(9);
      if (!/^\d{11}$/.test(geoid)) throw new Error(`ACS table ${table}: tract GEO_ID "${f[0]}" does not carry an 11-digit tract code.`);
      const rec = {};
      for (const { c, i, name } of wanted) {
        const s = f[i] ?? '';
        if (/^\d+$/.test(s)) rec[c] = +s;
        else { rec[c] = ''; const k = `${name}:${s || '(blank)'}`; jam[k] = (jam[k] ?? 0) + 1; }
      }
      if (byTract.has(geoid)) duplicates++; else { byTract.set(geoid, rec); rows++; }
    }
    start = end + 1;
  }
  if (duplicates) throw new Error(`ACS table ${table} repeats ${duplicates} tract GEO_IDs.`);
  if (rows < 80000) throw new Error(`ACS table ${table} carries only ${rows} tract rows; the 2020 tract universe is about 85,000.`);
  return { byTract, tract_rows: rows, cells: wanted.map((w) => w.name), jam_values: jam };
}

// ---------- geocoder and HUD ----------
function pick(geographies, layer) { const list = geographies?.[layer]; return Array.isArray(list) && list.length ? list[0] : null; }
async function geocodePoint(lon, lat, vintage) {
  const json = await fetchJson(`${GEOCODER}coordinates?x=${lon}&y=${lat}&benchmark=${BENCHMARK}&vintage=${vintage}&layers=all&format=json`);
  return json?.result?.geographies ?? {};
}
async function geocodeAddress(address, vintage) {
  const json = await fetchJson(`${GEOCODER}onelineaddress?address=${encodeURIComponent(address)}&benchmark=${BENCHMARK}&vintage=${vintage}&layers=all&format=json`);
  return json?.result?.addressMatches?.[0] ?? null;
}
async function hudPolygonAt(lon, lat) {
  const params = new URLSearchParams({ geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'GEOID10', returnGeometry: 'false', f: 'json' });
  const json = await fetchJson(`${HUD_OZ}?${params}`);
  if (json.error) throw new Error(`HUD service error ${JSON.stringify(json.error)}`);
  return (json.features ?? []).map((f) => f.attributes.GEOID10);
}
// Interior point of any Polygon or MultiPolygon feature: scan the bbox mid-lines and keep the first point inside.
function interiorPointOfFeature(feature) {
  const geometry = feature?.geometry ?? feature;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null;
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const flat = rings.flat(2);
  if (!flat.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of flat) {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }
  const steps = 200;
  for (let i = 1; i < steps; i++) {
    for (const c of [[minX + (maxX - minX) * i / steps, (minY + maxY) / 2], [(minX + maxX) / 2, minY + (maxY - minY) * i / steps]]) {
      if (pointInPolygon({ type: 'Point', coordinates: c }, feature)) return { lon: c[0], lat: c[1] };
    }
  }
  return null;
}
async function hudInteriorPoint(geoid10) {
  const params = new URLSearchParams({ where: `GEOID10='${geoid10}'`, outFields: 'GEOID10', returnGeometry: 'true', outSR: '4326', f: 'geojson' });
  const json = await fetchJson(`${HUD_OZ}?${params}`);
  const feature = json.features?.[0];
  if (!feature) return null;
  return interiorPointOfFeature(feature);
}

// ---------- classification helpers ----------
function msaFromOmb(countyFips, omb) {
  const row = omb.get(countyFips);
  if (row) return { cbsa_code: row.cbsa_code, cbsa_title: row.cbsa_title, cbsa_type: row.cbsa_type };
  return { cbsa_code: '', cbsa_title: '', cbsa_type: 'none' };
}
function msaFromGeocoder(geographies) {
  const metro = pick(geographies, 'Metropolitan Statistical Areas'), micro = pick(geographies, 'Micropolitan Statistical Areas');
  if (metro) return { cbsa_code: metro.GEOID, cbsa_title: metro.NAME, cbsa_type: 'metropolitan' };
  if (micro) return { cbsa_code: micro.GEOID, cbsa_title: micro.NAME, cbsa_type: 'micropolitan' };
  return { cbsa_code: '', cbsa_title: '', cbsa_type: 'none' };
}
function classifyTractRow(row, incorporatedSharePct = null) {
  if (row.cbsa_type === 'metropolitan') { row.eb5_rural_class = 'not_rural_msa'; row.class_reason = `County ${row.county_fips} is in ${row.cbsa_title} (OMB 2023 metropolitan statistical area).`; return; }
  const micro = row.cbsa_type === 'micropolitan' ? ` County is in the ${row.cbsa_title} micropolitan area, which does not exclude.` : '';
  if (row.iiusa_rows === 0) { row.eb5_rural_class = 'unknown'; row.class_reason = `Outside every 2023 OMB metropolitan area, but no IIUSA observation exists for tract ${row.geoid_2010} or its 2020 successors, so the 20,000 city/town test was not performed.${micro}`; return; }
  // Each entry reads `<GEOID> (<share>%; <place>; <MSA>)`, so it holds '; ' itself; count GEOIDs, not separators.
  const dropped = ((row.dropped_successors ?? '').match(/\d{11} \(/g) ?? []).length;
  const filterNote = `above the ${(SLIVER_SHARE * 100).toFixed(2)}% land-share filter; ${dropped} smaller part${dropped === 1 ? '' : 's'} listed in dropped_successors`;
  if (row.place_20k_kind === 'none') {
    if (row.iiusa_coverage_pct < 95) { row.eb5_rural_class = 'rural_interpretation_dependent'; row.class_reason = `Outside every MSA; IIUSA observations cover ${row.iiusa_coverage_pct}% of the 2010 tract land and report no 20,000+ city or town; the remainder is unobserved.${micro}`; return; }
    row.eb5_rural_class = 'rural_clear';
    // Never claim every 2020 successor when sliver successors were filtered out of the place test.
    const scope = dropped ? `for the tract and its 2020 successors ${filterNote}` : row.bridge_type === 'same_id' ? 'for the tract' : 'for the tract or any of its 2020 successors';
    row.class_reason = `Outside every 2023 OMB metropolitan area; IIUSA reports no city or town of 20,000 or more ${scope}.${micro}`;
    return;
  }
  const kinds = new Set(String(row.place_20k_kind).split('+'));
  if (kinds.has('consolidated')) {
    row.eb5_rural_class = 'rural_interpretation_dependent';
    row.class_reason = `Outside every MSA; the 20,000+ entry IIUSA reports is ${row.place_20k_names}, a consolidated city-county, balance-of-county or merged municipality rather than a plain incorporated city or town, so whether a site sits inside the outer boundary of a city or town is not settled by this observation.${micro}`;
    return;
  }
  if (row.place_20k_kind === 'cdp') { row.eb5_rural_class = 'rural_interpretation_dependent'; row.class_reason = `Outside every MSA; the only 20,000+ place is a census designated place (${row.place_20k_names}), and USCIS treatment of CDPs as a city or town is not settled.${micro}`; return; }
  if (row.place_20k_kind === 'incorporated+cdp') {
    // The CDP share cannot stand in for the incorporated share: only the incorporated leg decides not_rural.
    const incorporated = incorporatedSharePct ?? 0;
    if (incorporated >= 99) { row.eb5_rural_class = 'not_rural_place_per_iiusa'; row.class_reason = `Outside every MSA, but ${incorporated}% of the 2010 tract land maps to 2020 tracts associated with an incorporated place of 20,000 or more; a 20,000+ census designated place is present as well. Places reported: ${row.place_20k_names}. Land outside that boundary is not excluded by this observation.${micro}`; return; }
    row.eb5_rural_class = 'rural_interpretation_dependent';
    row.class_reason = `Outside every MSA; the 20,000+ places on this tract's successors are both an incorporated place and a census designated place (${row.place_20k_names}). The incorporated-only successor land share is ${incorporated}%, below 99%, and USCIS treatment of CDPs as a city or town is not settled. Site position decides.${micro}`;
    return;
  }
  if (row.place_20k_successor_land_pct < 99) { row.eb5_rural_class = 'rural_interpretation_dependent'; row.class_reason = `Outside every MSA; ${row.place_20k_successor_land_pct}% of the 2010 tract land maps to 2020 tracts associated with ${row.place_20k_names}; the rest reports no 20,000+ place. Site position decides.${micro}`; return; }
  row.eb5_rural_class = 'not_rural_place_per_iiusa'; row.class_reason = `Outside every MSA, but IIUSA associates the tract with ${row.place_20k_names}, an incorporated place of 20,000 or more. Land outside that boundary is not excluded by this observation.${micro}`;
}

// ---------- tract mode ----------
async function runTracts(outDir) {
  const rawDir = path.join(outDir, 'raw');
  const started = new Date().toISOString();
  const receipts = {}, loaded = {};
  for (const [key, src] of Object.entries(SOURCES)) { const { buf, receipt } = await fetchCached(src, rawDir); receipts[key] = receipt; loaded[key] = buf; }
  const cdfi = loadCdfi(loaded.cdfi), omb = loadOmb(loaded.omb), rel = loadRelationship(loaded.rel), iiusa = loadIiusa(loaded.iiusa), oz2027 = loadOz2027(loaded.irs2027);
  const nmtc = loadNmtc(loaded.nmtc);
  const nmtc2015 = loadNmtc2015(loaded.nmtc2015);
  const acsPop = loadAcsTable(loaded.acs2024_b01003, 'B01003', [1]), acsPov = loadAcsTable(loaded.acs2024_b17001, 'B17001', [1, 2]), acsMfi = loadAcsTable(loaded.acs2024_b19113, 'B19113', [1]);
  const acsJam = { ...acsPop.jam_values, ...acsPov.jam_values, ...acsMfi.jam_values };
  process.stdout.write(`CDFI designated tracts: ${cdfi.length}; OMB counties in CBSAs: ${omb.size}; 2010 tracts in relationship file: ${rel.size}; IIUSA tracts: ${iiusa.size}\n`);
  process.stdout.write(`IRS 2027 appendix: ${oz2027.eligible} tracts eligible for nomination, ${oz2027.rural} flagged rural under the OZ 2.0 definition (not EB-5 rural), ${oz2027.non_rural} non-rural\n`);
  process.stdout.write(`CDFI NMTC LIC file (${nmtc.acs_vintage}): ${nmtc.tracts} tracts, ${nmtc.eligible} eligible LIC, ${nmtc.severe_distress} severe distress, ${nmtc.deep_distress} deep distress, ${nmtc.poverty_rate_na} with poverty rate "NA", ${nmtc.mfi_ratio_na} with median family income "NA"\n`);
  process.stdout.write(`CDFI NMTC LIC file (${nmtc2015.acs_vintage}, 2010 tracts): ${nmtc2015.tracts} tracts, ${nmtc2015.eligible} eligible LIC, ${nmtc2015.poverty_rate_na} with poverty rate "N/A", ${nmtc2015.mfi_ratio_na} with median family income "N/A", ${nmtc2015.population_na} with population "N/A"; income column national median ${nmtc2015.mfi_median_pct}%, read as a percent\n`);
  process.stdout.write(`${ACS_LATEST_LABEL} tract rows: B01003 ${acsPop.tract_rows}, B17001 ${acsPov.tract_rows}, B19113 ${acsMfi.tract_rows}; jam values ${JSON.stringify(acsJam)}\n`);
  if (cdfi.length !== 8764) throw new Error(`Expected 8,764 designated tracts, parsed ${cdfi.length}.`);

  // HUD's two LIHTC basis-boost layers. Both are read end to end with receipts before any tract is classified.
  const qctFetch = await fetchIncentiveLayer(HUD_QCT_2026, path.join(rawDir, 'qct-2026'), QCT_OUT_FIELDS);
  const qct = parseQct2026(qctFetch.records);
  const ddaFetch = await fetchIncentiveLayer(HUD_DDA_2026, path.join(rawDir, 'dda-2026'), DDA_OUT_FIELDS);
  const dda = parseDda2026(ddaFetch.records);
  process.stdout.write(`HUD QCT 2026: ${qct.tracts} qualified census tracts (layer "${qctFetch.meta.name}")\n`);
  process.stdout.write(`HUD DDA 2026: ${dda.non_metro_counties} non-metropolitan county designations and ${dda.metro_zctas} metropolitan ZCTAs across ${ddaFetch.records.length} records (layer "${ddaFetch.meta.name}")\n`);
  // Vintage check, not an assumption: every 2020 tract in the relationship file, and every 2010 tract it keys on.
  // A 2020-vintage list lands almost entirely in the first set; a 2010-vintage list would land in the second.
  const tracts2020 = new Set(), tracts2010 = new Set(rel.keys());
  for (const bridge of rel.values()) for (const part of bridge.parts) tracts2020.add(part.t20);
  const vintageOf = (ids) => {
    const on2020 = ids.filter((g) => tracts2020.has(g)).length;
    const on2010Only = ids.filter((g) => !tracts2020.has(g) && tracts2010.has(g)).length;
    return { ids: ids.length, on_2020_tracts: on2020, on_2010_tracts_only: on2010Only, on_neither: ids.length - on2020 - on2010Only,
      reads_as: on2020 > on2010Only ? '2020 tract boundaries' : on2010Only > on2020 ? '2010 tract boundaries' : 'indeterminate' };
  };
  const qctVintage = vintageOf([...qct.byTract.keys()]), nmtcVintage = vintageOf([...nmtc.byTract.keys()]);
  process.stdout.write(`Vintage check against the relationship file - QCT: ${JSON.stringify(qctVintage)}\nVintage check - NMTC: ${JSON.stringify(nmtcVintage)}\n`);
  if (qctVintage.reads_as !== '2020 tract boundaries') throw new Error(`HUD QCT 2026 GEOIDs do not read as 2020 census tracts (${JSON.stringify(qctVintage)}); the bridge in this pass assumes a 2020-vintage list.`);
  if (nmtcVintage.reads_as !== '2020 tract boundaries') throw new Error(`CDFI NMTC LIC GEOIDs do not read as 2020 census tracts (${JSON.stringify(nmtcVintage)}); the bridge in this pass assumes a 2020-vintage list.`);
  // The 2011-2015 file is joined directly on the 2010 GEOID, so it must read as 2010 tracts. An unchanged tract
  // carries the same ID in both vintages, so the telling figures are the file's size against the two universes and
  // the IDs that exist in only one of them; vintageOf above would call any 2010 list "2020" on shared IDs alone.
  const ids2015 = [...nmtc2015.byTract.keys()];
  const acs2015Vintage = { ids: ids2015.length, in_2010_universe: ids2015.filter((g) => tracts2010.has(g)).length, only_in_2020_universe: ids2015.filter((g) => !tracts2010.has(g) && tracts2020.has(g)).length, in_neither: ids2015.filter((g) => !tracts2010.has(g) && !tracts2020.has(g)).length, universe_2010: tracts2010.size, universe_2020: tracts2020.size };
  const acs2024Vintage = { B01003: vintageOf([...acsPop.byTract.keys()]), B17001: vintageOf([...acsPov.byTract.keys()]), B19113: vintageOf([...acsMfi.byTract.keys()]) };
  process.stdout.write(`Vintage check - CDFI 2011-2015: ${JSON.stringify(acs2015Vintage)}\nVintage check - ${ACS_LATEST_LABEL}: ${JSON.stringify(acs2024Vintage)}\n`);
  if (acs2015Vintage.in_2010_universe < 0.99 * ids2015.length || acs2015Vintage.only_in_2020_universe > 0.01 * ids2015.length) throw new Error(`CDFI 2011-2015 GEOIDs do not read as 2010 census tracts (${JSON.stringify(acs2015Vintage)}); the direct join assumes a 2010-vintage file.`);
  for (const [table, v] of Object.entries(acs2024Vintage)) if (v.reads_as !== '2020 tract boundaries') throw new Error(`${ACS_LATEST_LABEL} table ${table} GEOIDs do not read as 2020 census tracts (${JSON.stringify(v)}); the bridge assumes 2020-vintage tables.`);
  // Two ways a state can be out of the bridge's reach, both detected from the data rather than assumed. A state whose
  // ACS tract IDs are all absent from the relationship file's 2020 set is coded on county equivalents the file does
  // not carry (Connecticut's 2022 planning regions). A state present in the relationship file with no ACS tract row
  // at all is outside the survey (the island territories). Both read unknown with the reason, never a number.
  const acsByState = new Map();
  for (const geoid of acsPop.byTract.keys()) {
    const st = geoid.slice(0, 2);
    const entry = acsByState.get(st) ?? { present: 0, absent: 0 };
    if (tracts2020.has(geoid)) entry.present++; else entry.absent++;
    acsByState.set(st, entry);
  }
  const acsUnreachableStates = new Map([...acsByState].filter(([, e]) => e.absent > 0 && e.present === 0).map(([st, e]) => [st, e.absent]));
  const acsPartlyUnreachableStates = Object.fromEntries([...acsByState].filter(([, e]) => e.absent > 0 && e.present > 0));
  const acsAbsentStates = new Map();
  for (const geoid of tracts2020) { const st = geoid.slice(0, 2); if (!acsByState.has(st)) acsAbsentStates.set(st, (acsAbsentStates.get(st) ?? 0) + 1); }
  process.stdout.write(`${ACS_LATEST_LABEL} states unreachable through the relationship file: ${JSON.stringify([...acsUnreachableStates])}; partly unreachable: ${JSON.stringify(acsPartlyUnreachableStates)}; states with no ACS tract rows: ${JSON.stringify([...acsAbsentStates])}\n`);
  // A state whose QCT GEOIDs are all absent from the relationship file cannot be answered by this bridge, and
  // writing "no" there would be a finding the sources do not support. Connecticut is the live case: HUD codes all
  // 164 of its 2026 QCTs on the 2022 planning regions (091xx) while the 2010-to-2020 relationship file still keys
  // Connecticut on the 2020 counties (09001-09015). Those tracts are unknown. Detected from the data, not assumed.
  const qctByState = new Map();
  for (const geoid of qct.byTract.keys()) {
    const st = geoid.slice(0, 2);
    const entry = qctByState.get(st) ?? { present: 0, absent: 0 };
    if (tracts2020.has(geoid)) entry.present++; else entry.absent++;
    qctByState.set(st, entry);
  }
  const qctUnreachableStates = new Map([...qctByState].filter(([, e]) => e.absent > 0 && e.present === 0).map(([st, e]) => [st, e.absent]));
  const qctPartlyUnreachableStates = Object.fromEntries([...qctByState].filter(([, e]) => e.absent > 0 && e.present > 0));
  process.stdout.write(`QCT states unreachable through the relationship file: ${JSON.stringify([...qctUnreachableStates])}; partly unreachable: ${JSON.stringify(qctPartlyUnreachableStates)}\n`);

  const results = [], connecticut = [], ctPlanningRegion = new Map();
  for (const t of cdfi) {
    const geoid2010 = CDFI_TO_2010_ALIAS[t.geoid] ?? t.geoid;
    const countyFips = t.geoid.slice(0, 5);
    const row = {
      geoid_2010: t.geoid, state: t.state, county_name: t.county_name, county_fips: countyFips, tract_type: t.tract_type,
      oz_status: 'designated_2018', oz_authority: 'CDFI list 2018-12-14 (IRS Notices 2018-48, 2019-42)', geoid_2010_geometry_alias: geoid2010 !== t.geoid ? geoid2010 : '',
      cbsa_code: '', cbsa_title: '', cbsa_type: '', msa_basis: '', town_basis: '', bridge_type: '', tracts_2020: '', dropped_successors: '', iiusa_rows: 0, iiusa_coverage_pct: 0, iiusa_rural_tea: '', iiusa_msa: '',
      place_20k_names: '', place_20k_kind: '', place_20k_successor_land_pct: 0, eb5_rural_class: '', class_reason: '', notes: '',
      // 2027-round columns, appended so every pre-existing column keeps its position and its value.
      oz2027_eligible_land_pct: '', oz2027_status: '', oz2027_rural_land_pct: '', oz2027_rural_flag: '', oz2027_basis: '',
      // Incentive flags, appended after the 2027 columns for the same reason. None of them feeds eb5_rural_class.
      lihtc_qct_2026_land_pct: '', lihtc_qct_2026: '', lihtc_qct_2026_basis: '',
      lihtc_dda_2026: '', lihtc_dda_2026_basis: '',
      nmtc_lic_land_pct: '', nmtc_lic_eligible: '', nmtc_poverty_rate: '', nmtc_mfi_ratio_pct: '', nmtc_basis: '',
      // ACS demographics, appended after the incentive flags: at designation (2011-2015, direct 2010 join) and the
      // latest 5-year release (2020-2024, bridged). Sample estimates that describe the tract, never an EB-5 input.
      acs2015_poverty_rate: '', acs2015_mfi_ratio_pct: '', acs2015_poverty_universe_pop: '', acs2015_lic_eligible: '', acs2015_basis: '',
      acs2024_coverage: '', acs2024_population: '', acs2024_poverty_universe_pop: '', acs2024_poverty_rate: '', acs2024_median_family_income_usd: '', acs2024_basis: '',
    };
    // Bridge the 2010 tract to its 2020 successors by land share.
    const bridge = rel.get(geoid2010);
    let parts = [], allParts = [];
    if (bridge) {
      const useLand = bridge.land10 > 0;
      const denominator = useLand ? bridge.land10 : bridge.water10;
      // held is the share of the successor's own area that lies in this part: 1 when the successor is wholly inside.
      allParts = bridge.parts.map((p) => {
        const successorArea = p.land20 > 0 ? p.land20 : p.water20, partArea = p.land20 > 0 ? p.land : p.water;
        return { t20: p.t20, share: denominator > 0 ? (useLand ? p.land : p.water) / denominator : 1 / bridge.parts.length, held: successorArea > 0 ? partArea / successorArea : 1 };
      });
      // bridge_type describes the relationship file as published, before the sliver filter. A 2010 tract whose land
      // splits 99.9% / 0.1% across two 2020 tracts is a split, and calling it same_id hid a real successor.
      const same = allParts.length === 1 && allParts[0].t20 === geoid2010;
      row.bridge_type = same ? 'same_id' : allParts.length === 1 ? 'renumbered' : allParts.length > 1 ? 'split' : 'none';
      parts = allParts.filter((p) => p.share > SLIVER_SHARE);
      row.tracts_2020 = parts.map((p) => `${p.t20} (${(p.share * 100).toFixed(1)}%)`).join('; ');
      // Every filtered part is named with what it would have contributed, so the filter is auditable rather than silent.
      row.dropped_successors = allParts.filter((p) => p.share <= SLIVER_SHARE).map((p) => {
        const obs = iiusa.get(p.t20);
        const place = !obs ? 'no IIUSA row' : obs.pop !== null && obs.pop >= POP_THRESHOLD && obs.city ? obs.city : 'no 20k place';
        const msa = !obs ? 'no MSA' : obs.msa || 'no MSA';
        return `${p.t20} (${(p.share * 100).toFixed(3)}%; ${place}; ${msa})`;
      }).join('; ');
    } else row.bridge_type = 'none';
    // 2027 nomination round. Computed on allParts, the bridge as published, because the 0.05% sliver filter exists
    // for the 20,000 place test and has nothing to say about whether a successor is on the IRS eligibility list.
    // The two shares use the same denominator (the 2010 tract's land), so the flag compares them directly rather
    // than against an invented threshold: all eligible land rural, none of it rural, or a mixture.
    if (!bridge) {
      row.oz2027_eligible_land_pct = ''; row.oz2027_status = 'unknown'; row.oz2027_rural_land_pct = ''; row.oz2027_rural_flag = 'unknown';
      row.oz2027_basis = `No 2010-to-2020 bridge exists for tract ${geoid2010} in the Census relationship file, so its land cannot be mapped onto the 2020-vintage appendix. ${OZ2027_BASIS}`;
    } else {
      const eligibleParts = allParts.filter((p) => oz2027.byTract.has(p.t20));
      const eligibleShare = eligibleParts.reduce((s, p) => s + p.share, 0);
      const ruralShare = eligibleParts.filter((p) => oz2027.byTract.get(p.t20).rural).reduce((s, p) => s + p.share, 0);
      row.oz2027_eligible_land_pct = +(eligibleShare * 100).toFixed(1);
      row.oz2027_rural_land_pct = +(ruralShare * 100).toFixed(1);
      row.oz2027_status = row.oz2027_eligible_land_pct >= OZ2027_FULL_SHARE_PCT ? 'fully_eligible' : eligibleShare > 0 ? 'partially_eligible' : 'not_eligible';
      row.oz2027_rural_flag = eligibleShare <= 0 ? 'not_eligible' : ruralShare <= 0 ? 'non_rural' : ruralShare >= eligibleShare - 1e-12 ? 'rural' : 'mixed';
      row.oz2027_basis = OZ2027_BASIS;
    }
    // LIHTC Qualified Census Tracts 2026 and NMTC Low-Income Community eligibility. Both lists are 2020-vintage and
    // are read onto this 2010 tract through the same unfiltered bridge as the 2027 columns, for the same reason:
    // the 0.05% sliver filter exists for the 20,000 place test and says nothing about a federal eligibility list.
    if (!bridge) {
      row.lihtc_qct_2026_land_pct = ''; row.lihtc_qct_2026 = 'unknown';
      row.lihtc_qct_2026_basis = `No 2010-to-2020 bridge exists for tract ${geoid2010} in the Census relationship file, so its land cannot be mapped onto the 2020-vintage QCT list. ${QCT_BASIS}`;
      row.nmtc_lic_land_pct = ''; row.nmtc_lic_eligible = 'unknown'; row.nmtc_poverty_rate = ''; row.nmtc_mfi_ratio_pct = '';
      row.nmtc_basis = `No 2010-to-2020 bridge exists for tract ${geoid2010} in the Census relationship file, so its land cannot be mapped onto the 2020-vintage eligibility file and no poverty rate or median family income ratio is carried. ${NMTC_BASIS}`;
    } else {
      const unreachable = qctUnreachableStates.get(countyFips.slice(0, 2));
      if (unreachable) {
        row.lihtc_qct_2026_land_pct = ''; row.lihtc_qct_2026 = 'unknown';
        row.lihtc_qct_2026_basis = `Not answerable for this state by this bridge: all ${unreachable} of HUD's 2026 QCTs in state ${countyFips.slice(0, 2)} are coded on county equivalents the Census 2010-to-2020 relationship file does not carry (Connecticut's 2022 planning regions, 091xx, against the file's 2020 counties 09001-09015), so none of this tract's 2020 successors can be matched against the QCT list. Writing "no" here would assert a finding the sources do not support, and the state does contain designated QCTs. ${QCT_BASIS}`;
      } else {
        const qctShare = bridgedShare(allParts, (t20) => qct.byTract.has(t20));
        row.lihtc_qct_2026_land_pct = qctShare.pct; row.lihtc_qct_2026 = qctShare.verdict; row.lihtc_qct_2026_basis = QCT_BASIS;
      }
      const licShare = bridgedShare(allParts, (t20) => nmtc.byTract.get(t20)?.lic === true);
      row.nmtc_lic_land_pct = licShare.pct; row.nmtc_lic_eligible = licShare.verdict;
      // The poverty rate and income ratio are per-tract ACS figures and cannot be averaged across successors
      // without inventing a number, so they are carried only where this 2010 tract bridges to a single 2020 tract.
      if (allParts.length !== 1) {
        row.nmtc_basis = `This 2010 tract bridges to ${allParts.length} 2020 successors, so no single tract poverty rate or median family income ratio is carried; averaging the successors would invent a figure the source does not publish. ${NMTC_BASIS}`;
      } else {
        const successor = nmtc.byTract.get(allParts[0].t20);
        if (!successor) {
          row.nmtc_basis = `The single 2020 successor of this tract, ${allParts[0].t20}, has no row in the eligibility file, so no poverty rate or median family income ratio is carried. ${NMTC_BASIS}`;
        } else {
          row.nmtc_poverty_rate = successor.poverty;
          row.nmtc_mfi_ratio_pct = successor.mfi_ratio_pct;
          const missing = [successor.poverty === '' ? 'poverty rate' : '', successor.mfi_ratio_pct === '' ? 'median family income ratio' : ''].filter(Boolean);
          const from = `Poverty rate and median family income ratio are the file's own values for the single 2020 successor ${allParts[0].t20}${missing.length ? `, which reports "NA" for its ${missing.join(' and ')}` : ''}.`;
          row.nmtc_basis = `${from} ${NMTC_BASIS}`;
        }
      }
    }
    // ACS demographics at designation. The CDFI Fund's 2011-2015 file is on 2010 tracts, so it joins on this tract's
    // own GEOID with no bridge; the population it carries is the poverty universe and is named so.
    const acs15 = nmtc2015.byTract.get(t.geoid) ?? nmtc2015.byTract.get(geoid2010);
    if (!acs15) {
      row.acs2015_lic_eligible = 'unknown';
      row.acs2015_basis = `Tract ${t.geoid} has no row in the CDFI Fund 2011-2015 file, so nothing is carried. ${ACS2015_BASIS}`;
    } else {
      row.acs2015_poverty_rate = acs15.poverty; row.acs2015_mfi_ratio_pct = acs15.mfi_pct; row.acs2015_poverty_universe_pop = acs15.pop;
      row.acs2015_lic_eligible = acs15.lic ? 'yes' : 'no';
      const na = [acs15.poverty === '' ? 'poverty rate' : '', acs15.mfi_pct === '' ? 'median family income ratio' : '', acs15.pop === '' ? 'poverty universe population' : ''].filter(Boolean);
      row.acs2015_basis = `${na.length ? `The file reports "N/A" for this tract's ${na.join(', ')}. ` : ''}${ACS2015_BASIS}`;
    }
    // Latest ACS, on 2020 tracts. Counts are summed only when every successor lies wholly inside this 2010 tract, so
    // the sum is the tract's own figure and the poverty rate is the exact aggregate; a median cannot be combined, so
    // it is carried only from a single successor. A single successor wider than the tract gives the rate and the
    // median of that containing tract, named as such, and no count. Anything else stays blank with the reason.
    if (!bridge) {
      row.acs2024_coverage = 'unknown';
      row.acs2024_basis = `No 2010-to-2020 bridge exists for tract ${geoid2010} in the Census relationship file, so no ${ACS_LATEST_LABEL} figure can be read onto it. ${ACS2024_BASIS}`;
    } else {
      const successors = allParts.map((p) => ({ ...p, inside: p.held >= CONTAINMENT_SHARE, pop: acsPop.byTract.get(p.t20), pov: acsPov.byTract.get(p.t20), mfi: acsMfi.byTract.get(p.t20) }));
      const missingRows = successors.filter((s) => !s.pop || !s.pov || !s.mfi).map((s) => s.t20);
      const list = successors.map((s) => `${s.t20} (${(s.share * 100).toFixed(1)}% of this tract's land; ${s.inside ? 'wholly inside it' : `this tract holds ${(s.held * 100).toFixed(1)}% of that successor's land`})`).join('; ');
      const notes = [];
      const jamNote = (label, ids) => { if (ids.length) notes.push(`${label} is not available for ${ids.join(', ')} (Census jam value)`); return ids.length === 0; };
      const rate = (universe, below) => { if (universe > 0) return +((below / universe) * 100).toFixed(1); notes.push('the poverty universe is 0, so no rate is computed'); return ''; };
      const topCode = () => row.acs2024_median_family_income_usd === ACS_MFI_TOP_CODE ? `; the median family income is top-coded by the Census Bureau at $${(ACS_MFI_TOP_CODE - 1).toLocaleString('en-US')} or more` : '';
      const stateCode = countyFips.slice(0, 2);
      if (acsUnreachableStates.has(stateCode)) {
        row.acs2024_coverage = 'unknown';
        row.acs2024_basis = `Not answerable for this state by this bridge: all ${acsUnreachableStates.get(stateCode)} ${ACS_LATEST_LABEL} tract rows in state ${stateCode} are coded on county equivalents the Census 2010-to-2020 relationship file does not carry (Connecticut's 2022 planning regions, 091xx, against the file's 2020 counties 09001-09015), so none of this tract's successors can be matched to a table row. Answering it needs a planning-region tract crosswalk this pass does not add. Successors: ${list}. ${ACS2024_BASIS}`;
      } else if (acsAbsentStates.has(stateCode)) {
        row.acs2024_coverage = 'unknown';
        row.acs2024_basis = `The ${ACS_LATEST_LABEL} tables carry no census tract rows for state or territory code ${stateCode} (${acsAbsentStates.get(stateCode)} 2020 tracts in the relationship file, none in the survey tables), so nothing is carried. Successors: ${list}. ${ACS2024_BASIS}`;
      } else if (missingRows.length) {
        row.acs2024_coverage = 'unknown';
        row.acs2024_basis = `Successor ${missingRows.join(', ')} has no tract row in the ${ACS_LATEST_LABEL} tables, so nothing is carried. Successors: ${list}. ${ACS2024_BASIS}`;
      } else if (successors.every((s) => s.inside)) {
        row.acs2024_coverage = 'whole';
        if (jamNote('Total population', successors.filter((s) => s.pop[1] === '').map((s) => s.t20))) row.acs2024_population = successors.reduce((a, s) => a + s.pop[1], 0);
        if (jamNote('Poverty status', successors.filter((s) => s.pov[1] === '' || s.pov[2] === '').map((s) => s.t20))) {
          row.acs2024_poverty_universe_pop = successors.reduce((a, s) => a + s.pov[1], 0);
          row.acs2024_poverty_rate = rate(row.acs2024_poverty_universe_pop, successors.reduce((a, s) => a + s.pov[2], 0));
        }
        if (successors.length === 1) { if (jamNote('Median family income', successors[0].mfi[1] === '' ? [successors[0].t20] : [])) row.acs2024_median_family_income_usd = successors[0].mfi[1]; }
        else notes.push(`median family income is not carried because the tract splits into ${successors.length} 2020 tracts and medians cannot be combined`);
        const how = successors.length === 1 ? `The single 2020 successor ${successors[0].t20} lies wholly inside this tract, so its figures are this tract's figures` : `All ${successors.length} 2020 successors lie wholly inside this tract, so population and the poverty universe are their exact sums and the poverty rate is the exact aggregate`;
        row.acs2024_basis = `${how}${topCode()}. ${notes.length ? `${notes.join('; ')}. ` : ''}Successors: ${list}. ${ACS2024_BASIS}`;
      } else if (successors.length === 1) {
        row.acs2024_coverage = 'containing_tract';
        const s = successors[0];
        if (jamNote('Poverty status', s.pov[1] === '' || s.pov[2] === '' ? [s.t20] : [])) row.acs2024_poverty_rate = rate(s.pov[1], s.pov[2]);
        if (jamNote('Median family income', s.mfi[1] === '' ? [s.t20] : [])) row.acs2024_median_family_income_usd = s.mfi[1];
        row.acs2024_basis = `The single 2020 successor ${s.t20} contains this tract and extends beyond it (this tract holds ${(s.held * 100).toFixed(1)}% of the successor's land), so the poverty rate and median family income describe that wider tract and no population count is carried${topCode()}. ${notes.length ? `${notes.join('; ')}. ` : ''}Successors: ${list}. ${ACS2024_BASIS}`;
      } else {
        row.acs2024_coverage = 'partial';
        row.acs2024_basis = `This tract bridges to ${successors.length} 2020 tracts and at least one of them extends beyond it, so no count, rate or median can be read onto the tract without apportioning a sample estimate; nothing is carried. Successors: ${list}. ${ACS2024_BASIS}`;
      }
    }
    // IIUSA observations for those successors.
    const observations = parts.map((p) => ({ ...p, obs: iiusa.get(p.t20) })).filter((p) => p.obs);
    const allObservations = allParts.map((p) => ({ ...p, obs: iiusa.get(p.t20) })).filter((p) => p.obs);
    row.iiusa_rows = observations.length;
    row.iiusa_coverage_pct = +(observations.reduce((s, p) => s + p.share, 0) * 100).toFixed(1);
    const ruralFlags = new Set(observations.map((p) => p.obs.rural));
    row.iiusa_rural_tea = ruralFlags.size === 0 ? 'NONE' : ruralFlags.size > 1 ? 'MIXED' : [...ruralFlags][0];
    row.iiusa_msa = [...new Set(observations.map((p) => p.obs.msa).filter(Boolean))].join('; ');
    const places20k = observations.filter((p) => p.obs.pop !== null && p.obs.pop >= POP_THRESHOLD);
    row.place_20k_names = [...new Set(places20k.map((p) => `${p.obs.city} (${p.obs.pop.toLocaleString('en-US')})`))].join('; ');
    const kinds = new Set(places20k.map((p) => p.obs.kind));
    row.place_20k_kind = ['incorporated', 'consolidated', 'cdp'].filter((k) => kinds.has(k)).join('+') || 'none';
    row.place_20k_successor_land_pct = +(places20k.reduce((s, p) => s + p.share, 0) * 100).toFixed(1);
    const incorporatedPct = +(places20k.filter((p) => p.obs.kind === 'incorporated').reduce((s, p) => s + p.share, 0) * 100).toFixed(1);
    // MSA leg from OMB by county. Connecticut needs a point resolution because OMB 2023 uses planning regions.
    if (countyFips.startsWith('09')) { row.msa_basis = 'pending'; connecticut.push({ row, geoid2010 }); results.push(row); continue; }
    Object.assign(row, msaFromOmb(countyFips, omb));
    row.msa_basis = 'OMB 2023 List 1 by county';
    if (row.cbsa_type !== 'metropolitan') {
      // A successor IIUSA row inside an MSA while the county is outside one means a county-line realignment sliver or a
      // delineation vintage difference. Computed on the unfiltered parts: a sliver successor is exactly the case this warns about.
      const metroSuccessors = allObservations.filter((p) => p.obs.msa_code);
      if (metroSuccessors.length) row.notes = `IIUSA places ${metroSuccessors.map((p) => `2020 tract ${p.t20} (${(p.share * 100).toFixed(1)}% of the 2010 land) in ${p.obs.msa}`).join('; ')} while the tract's county is outside every 2023 OMB metropolitan area; check county-line position and delineation vintage at the site.`;
    }
    classifyTractRow(row, incorporatedPct);
    results.push(row);
  }
  process.stdout.write(`Connecticut tracts needing point resolution: ${connecticut.length}\n`);
  for (const { row, geoid2010 } of connecticut) {
    try {
      const point = await hudInteriorPoint(geoid2010);
      if (!point) throw new Error('no HUD polygon');
      const current = await geocodePoint(point.lon, point.lat, 'Current_Current');
      Object.assign(row, msaFromGeocoder(current));
      const region = pick(current, 'Counties'), tract = pick(current, 'Census Tracts');
      row.msa_basis = `Census Geocoder current vintage at interior point ${point.lat.toFixed(5)},${point.lon.toFixed(5)}; planning region ${region?.NAME ?? 'unknown'}`;
      // HUD keys non-metropolitan DDAs on the same current-vintage planning regions OMB 2023 uses in Connecticut
      // (09150 Northeastern Connecticut, 09160 Northwest Hills), so the DDA pass below needs this GEOID, not the
      // 2010 county code the tract row carries.
      if (region?.GEOID) ctPlanningRegion.set(row.geoid_2010, { fips: pad11(region.GEOID).slice(-5), name: textOf(region.NAME) });
      const obs = tract ? iiusa.get(pad11(tract.GEOID)) : null;
      let incorporatedPct = 0;
      if (obs) {
        row.iiusa_rows = 1; row.iiusa_coverage_pct = 100; row.iiusa_rural_tea = obs.rural; row.iiusa_msa = obs.msa;
        row.tracts_2020 = `${pad11(tract.GEOID)} (current planning-region tract at interior point)`;
        if (obs.pop !== null && obs.pop >= POP_THRESHOLD) { row.place_20k_names = `${obs.city} (${obs.pop.toLocaleString('en-US')})`; row.place_20k_kind = obs.kind; row.place_20k_successor_land_pct = 100; incorporatedPct = obs.kind === 'incorporated' ? 100 : 0; }
        else { row.place_20k_names = ''; row.place_20k_kind = 'none'; row.place_20k_successor_land_pct = 0; }
      }
      classifyTractRow(row, incorporatedPct);
      if (row.eb5_rural_class === 'rural_clear') { row.eb5_rural_class = 'rural_interpretation_dependent'; row.class_reason += ' Connecticut resolved at one interior point; New England town treatment under the 20,000 test is unresolved.'; }
      await pause(PAUSE_MS);
    } catch (error) {
      // msa_basis must never stay at 'pending': a reader would take it for a resolution still in flight.
      row.cbsa_type = 'unresolved'; row.eb5_rural_class = 'unknown';
      row.msa_basis = `Connecticut point resolution failed: ${error.message}`;
      row.class_reason = `Connecticut point resolution failed: ${error.message}`;
    }
  }

  // New England town test for ME, NH, VT, MA and RI. IIUSA's city/town observation does not answer whether a tract
  // sits inside a New England town, which is the governmental unit there, so every tract that would classify
  // rural_clear is tested at one interior point of its HUD polygon against the 2020 County Subdivisions layer.
  const townChecks = results.filter((r) => NEW_ENGLAND_TOWN_TEST.has(r.county_fips.slice(0, 2)) && r.eb5_rural_class === 'rural_clear');
  process.stdout.write(`New England tracts (ME, NH, VT, MA, RI) needing an interior-point town test: ${townChecks.length}\n`);
  let townDependent = 0, townFailures = 0;
  for (const row of townChecks) {
    const geometryId = row.geoid_2010_geometry_alias || row.geoid_2010;
    try {
      const point = await hudInteriorPoint(geometryId);
      if (!point) throw new Error('no HUD polygon');
      const at = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
      const g2020 = await geocodePoint(point.lon, point.lat, 'Census2020_Current');
      const cousub = pick(g2020, 'County Subdivisions');
      if (!cousub) {
        row.town_basis = `Census Geocoder Census2020_Current at HUD interior point ${at}: no County Subdivisions layer returned`;
        row.notes += `The 2020 County Subdivisions layer returned no town at the tract's interior point, so the New England town question was not answered here. `;
      } else {
        const pop = numOrBlank(cousub.POP100);
        row.town_basis = `Census Geocoder Census2020_Current, County Subdivisions at HUD interior point ${at}: ${cousub.NAME} (${pop === '' ? 'population not returned' : pop.toLocaleString('en-US')})`;
        if (pop === '') {
          row.eb5_rural_class = 'rural_interpretation_dependent';
          row.class_reason = `Outside every 2023 OMB metropolitan area and IIUSA reports no 20,000+ city or town, but town population not returned by the geocoder for ${cousub.NAME} at the tract's interior point, so the 20,000 town test was not performed.`;
          townDependent++;
        } else if (pop >= POP_THRESHOLD) {
          row.eb5_rural_class = 'rural_interpretation_dependent';
          row.class_reason = `Outside every 2023 OMB metropolitan area and IIUSA reports no 20,000+ city or town, but the tract's interior point falls in New England town ${cousub.NAME}, 2020 population ${pop.toLocaleString('en-US')}; tested at one interior point only, and USCIS treatment of New England towns under the 20,000 test is not settled.`;
          townDependent++;
        } else {
          row.notes += `New England town at interior point: ${cousub.NAME} (${pop.toLocaleString('en-US')}); tract may span other towns. `;
        }
      }
      await pause(PAUSE_MS);
    } catch (error) {
      townFailures++;
      row.town_basis = `New England town test failed: ${error.message}`;
      row.notes += `New England town test at the interior point failed (${error.message}); the 20,000 town question is unresolved for this tract. `;
    }
  }
  process.stdout.write(`New England town test: ${townDependent} moved to rural_interpretation_dependent, ${townChecks.length - townDependent - townFailures} stayed rural_clear with a town note, ${townFailures} failed\n`);

  // LIHTC Difficult Development Areas 2026, county leg only. This runs after the Connecticut point resolution
  // because it needs the final cbsa_type and, in Connecticut, the planning-region GEOID that resolution produced.
  // A metropolitan tract is never upgraded from the county list: metropolitan DDAs are ZCTA-designated and this
  // pass adds no tract-to-ZCTA crosswalk, so those tracts say so instead of reading "no".
  let ddaYes = 0, ddaNo = 0, ddaMetro = 0, ddaUnknown = 0;
  for (const row of results) {
    const ct = ctPlanningRegion.get(row.geoid_2010);
    const key = ct ? ct.fips : row.county_fips;
    const keyLabel = ct ? `Connecticut planning region ${ct.fips} (${ct.name})` : `county ${key} (${row.county_name})`;
    if (row.cbsa_type === 'metropolitan') { row.lihtc_dda_2026 = 'metro_zcta_not_evaluated'; row.lihtc_dda_2026_basis = DDA_BASIS_METRO; ddaMetro++; continue; }
    if (row.cbsa_type !== 'micropolitan' && row.cbsa_type !== 'none') {
      row.lihtc_dda_2026 = 'unknown';
      row.lihtc_dda_2026_basis = `The metropolitan status of this tract is "${row.cbsa_type || '(blank)'}", so it could not be routed to either DDA leg. ${DDA_BASIS_HEAD}`;
      ddaUnknown++; continue;
    }
    if (row.county_fips.startsWith('09') && !ct) {
      row.lihtc_dda_2026 = 'unknown';
      row.lihtc_dda_2026_basis = `Connecticut non-metropolitan DDAs are designated on the current planning regions, and the interior-point resolution that supplies this tract's planning region did not return one, so the county leg could not be evaluated. ${DDA_BASIS_HEAD}`;
      ddaUnknown++; continue;
    }
    const hit = dda.nonMetroCounties.get(key);
    if (hit) { row.lihtc_dda_2026 = 'yes'; ddaYes++; } else { row.lihtc_dda_2026 = 'no'; ddaNo++; }
    row.lihtc_dda_2026_basis = `${DDA_BASIS_HEAD} Non-metropolitan DDAs are designated along county boundaries; this tract's ${keyLabel} is outside every 2023 OMB metropolitan area and ${hit ? `appears on the 2026 non-metropolitan DDA list as "${hit.name}" (DDA_CODE ${hit.code})` : 'does not appear on the 2026 non-metropolitan DDA list'}. The whole county is designated or not, so this answer does not vary within the tract.`;
  }
  process.stdout.write(`LIHTC DDA 2026 (county leg): ${ddaYes} yes, ${ddaNo} no, ${ddaMetro} metro_zcta_not_evaluated, ${ddaUnknown} unknown\n`);

  const counts = {};
  for (const r of results) counts[r.eb5_rural_class] = (counts[r.eb5_rural_class] ?? 0) + 1;
  // 2027-round distributions, overall and inside rural_clear. Eligibility for the 2027 round and the EB-5 rural
  // class are independent facts about the same tract; neither is evidence for the other.
  const OZ2027_STATUSES = ['fully_eligible', 'partially_eligible', 'not_eligible', 'unknown'];
  const OZ2027_FLAGS = ['rural', 'non_rural', 'mixed', 'not_eligible', 'unknown'];
  const tally = (rows, field, keys) => Object.fromEntries(keys.map((k) => [k, rows.filter((r) => r[field] === k).length]));
  const ruralClearRows = results.filter((r) => r.eb5_rural_class === 'rural_clear');
  const oz2027Counts = {
    designated_by_status: tally(results, 'oz2027_status', OZ2027_STATUSES),
    designated_by_rural_flag: tally(results, 'oz2027_rural_flag', OZ2027_FLAGS),
    rural_clear_by_status: tally(ruralClearRows, 'oz2027_status', OZ2027_STATUSES),
    rural_clear_by_rural_flag: tally(ruralClearRows, 'oz2027_rural_flag', OZ2027_FLAGS),
  };
  // Incentive-flag distributions, overall and inside rural_clear, on the same pattern. A LIHTC or NMTC flag is an
  // independent fact about the same tract: it is not evidence about the EB-5 rural class and never derived from it.
  const SHARE_VALUES = ['yes', 'partial', 'no', 'unknown'];
  const DDA_VALUES = ['yes', 'no', 'metro_zcta_not_evaluated', 'unknown'];
  const incentiveCounts = {
    lihtc_qct_2026: { designated: tally(results, 'lihtc_qct_2026', SHARE_VALUES), rural_clear: tally(ruralClearRows, 'lihtc_qct_2026', SHARE_VALUES) },
    lihtc_dda_2026: { designated: tally(results, 'lihtc_dda_2026', DDA_VALUES), rural_clear: tally(ruralClearRows, 'lihtc_dda_2026', DDA_VALUES) },
    nmtc_lic_eligible: { designated: tally(results, 'nmtc_lic_eligible', SHARE_VALUES), rural_clear: tally(ruralClearRows, 'nmtc_lic_eligible', SHARE_VALUES) },
  };
  const withValue = (rows, field) => rows.filter((r) => r[field] !== '' && r[field] !== null && r[field] !== undefined).length;
  const nmtcDemographics = {
    designated_with_poverty_rate: withValue(results, 'nmtc_poverty_rate'), designated_with_mfi_ratio: withValue(results, 'nmtc_mfi_ratio_pct'),
    rural_clear_with_poverty_rate: withValue(ruralClearRows, 'nmtc_poverty_rate'), rural_clear_with_mfi_ratio: withValue(ruralClearRows, 'nmtc_mfi_ratio_pct'),
    carried_only_when: 'the 2010 tract bridges to exactly one 2020 successor; averaging successors would invent a figure the source does not publish',
  };
  // ACS demographics: coverage and how many rows carry each figure, overall and inside rural_clear, plus the median
  // of each carried figure as a reading aid. A demographic estimate is not evidence about the EB-5 rural class.
  const ACS_LIC_VALUES = ['yes', 'no', 'unknown'];
  const ACS_COVERAGE = ['whole', 'containing_tract', 'partial', 'unknown'];
  const medianOf = (rows, field) => { const v = rows.map((r) => r[field]).filter((x) => x !== '' && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : ''; };
  const acsCarried = (rows, fields) => Object.fromEntries(fields.map((f) => [f, withValue(rows, `${f}`)]));
  const ACS2015_FIELDS = ['acs2015_poverty_rate', 'acs2015_mfi_ratio_pct', 'acs2015_poverty_universe_pop'];
  const ACS2024_FIELDS = ['acs2024_population', 'acs2024_poverty_universe_pop', 'acs2024_poverty_rate', 'acs2024_median_family_income_usd'];
  const acsCounts = {
    at_designation: {
      lic: { designated: tally(results, 'acs2015_lic_eligible', ACS_LIC_VALUES), rural_clear: tally(ruralClearRows, 'acs2015_lic_eligible', ACS_LIC_VALUES) },
      carried: { designated: acsCarried(results, ACS2015_FIELDS), rural_clear: acsCarried(ruralClearRows, ACS2015_FIELDS) },
      medians: { designated: { poverty_rate: medianOf(results, 'acs2015_poverty_rate'), mfi_ratio_pct: medianOf(results, 'acs2015_mfi_ratio_pct') }, rural_clear: { poverty_rate: medianOf(ruralClearRows, 'acs2015_poverty_rate'), mfi_ratio_pct: medianOf(ruralClearRows, 'acs2015_mfi_ratio_pct') } },
    },
    latest: {
      coverage: { designated: tally(results, 'acs2024_coverage', ACS_COVERAGE), rural_clear: tally(ruralClearRows, 'acs2024_coverage', ACS_COVERAGE) },
      carried: { designated: acsCarried(results, ACS2024_FIELDS), rural_clear: acsCarried(ruralClearRows, ACS2024_FIELDS) },
      medians: { designated: { poverty_rate: medianOf(results, 'acs2024_poverty_rate'), median_family_income_usd: medianOf(results, 'acs2024_median_family_income_usd') }, rural_clear: { poverty_rate: medianOf(ruralClearRows, 'acs2024_poverty_rate'), median_family_income_usd: medianOf(ruralClearRows, 'acs2024_median_family_income_usd') } },
      top_coded_median_family_income: results.filter((r) => r.acs2024_median_family_income_usd === ACS_MFI_TOP_CODE).length,
    },
  };
  const byState = {};
  for (const r of results) { byState[r.state] ??= { state: r.state, designated: 0, rural_clear: 0, rural_interpretation_dependent: 0, not_rural_place_per_iiusa: 0, not_rural_msa: 0, unknown: 0 }; byState[r.state].designated++; byState[r.state][r.eb5_rural_class]++; }
  // Market view: counties ranked by clear-rural designated tracts. A micropolitan title names the town the market is built around.
  const byCounty = new Map();
  for (const r of results) {
    if (!byCounty.has(r.county_fips)) byCounty.set(r.county_fips, { state: r.state, county_name: r.county_name, county_fips: r.county_fips, cbsa_type: '', cbsa_title: '', designated: 0, rural_clear: 0, rural_interpretation_dependent: 0, not_rural_place_per_iiusa: 0, not_rural_msa: 0, unknown: 0, rural_clear_tracts: [], qualifying_types: new Set(), qualifying_titles: new Set() });
    const c = byCounty.get(r.county_fips);
    c.designated++; c[r.eb5_rural_class]++;
    if (r.eb5_rural_class === 'rural_clear') c.rural_clear_tracts.push(r.geoid_2010);
    // The CBSA columns describe the tracts that actually qualify, not whichever designated tract happened to be
    // read first. Connecticut tracts in one 2010 county can resolve to different planning regions.
    if (r.eb5_rural_class === 'rural_clear' || r.eb5_rural_class === 'rural_interpretation_dependent') { c.qualifying_types.add(r.cbsa_type); c.qualifying_titles.add(r.cbsa_title); }
  }
  const markets = [...byCounty.values()].filter((c) => c.rural_clear + c.rural_interpretation_dependent > 0)
    .sort((a, b) => b.rural_clear - a.rural_clear || a.state.localeCompare(b.state) || a.county_name.localeCompare(b.county_name))
    .map(({ qualifying_types, qualifying_titles, ...c }) => {
      const types = [...qualifying_types], titles = [...qualifying_titles];
      return { ...c,
        cbsa_type: types.length === 1 ? types[0] : 'mixed',
        cbsa_title: titles.length <= 1 ? titles[0] ?? '' : `mixed: ${titles.map((t) => t || 'no CBSA').join('; ')}`,
        rural_clear_tracts: c.rural_clear_tracts.join('; ') };
    });
  const marketColumns = ['state', 'county_name', 'county_fips', 'cbsa_type', 'cbsa_title', 'designated', 'rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'not_rural_msa', 'unknown', 'rural_clear_tracts'];
  const columns = Object.keys(results[0]);
  const summaryRows = [['EB-5 rural class', 'Designated OZ tracts', 'Meaning'],
    ['rural_clear', counts.rural_clear ?? 0, `County outside every 2023 OMB metropolitan area and every IIUSA observation for the tract and its 2020 successors above the ${(SLIVER_SHARE * 100).toFixed(2)}% land-share filter reports no city or town of 20,000 or more; in ME, NH, VT, MA and RI the 2020 town at one interior point is also below 20,000. Site check still required at parcel level.`],
    ['rural_interpretation_dependent', counts.rural_interpretation_dependent ?? 0, 'Outside every MSA, but a 20,000+ CDP, a 20,000+ consolidated city-county or balance entry, a partial 20,000+ place overlap after a 2010-2020 split, or the Connecticut/New England town question applies. Resolve at the site.'],
    ['not_rural_place_per_iiusa', counts.not_rural_place_per_iiusa ?? 0, 'Outside every MSA, but IIUSA associates the tract with an incorporated place of 20,000 or more. Land outside that place boundary may still be rural; only a site test can say.'],
    ['not_rural_msa', counts.not_rural_msa ?? 0, 'County is in a 2023 OMB metropolitan statistical area. Whole tract fails the EB-5 rural test regardless of place.'],
    ['unknown', counts.unknown ?? 0, 'Outside every MSA but no IIUSA observation exists for the tract or its 2020 successors (Puerto Rico and retired tracts). Place test not performed.'],
    ['total', results.length, 'CDFI designated list, December 14, 2018'],
    [], ['State', 'Designated', 'rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'not_rural_msa', 'unknown'],
    ...Object.values(byState).sort((a, b) => b.rural_clear - a.rural_clear || a.state.localeCompare(b.state)).map((s) => [s.state, s.designated, s.rural_clear, s.rural_interpretation_dependent, s.not_rural_place_per_iiusa, s.not_rural_msa, s.unknown]),
    [], ['2027 nomination round (IRS Rev. Proc. 2026-14 appendix, 2020 boundaries) - eligibility is not designation'],
    ['oz2027_status', 'Designated OZ tracts', 'rural_clear tracts', 'Meaning'],
    ['fully_eligible', oz2027Counts.designated_by_status.fully_eligible, oz2027Counts.rural_clear_by_status.fully_eligible, `${OZ2027_FULL_SHARE_PCT}% or more of the 2010 tract's land maps to 2020 successors on the appendix.`],
    ['partially_eligible', oz2027Counts.designated_by_status.partially_eligible, oz2027Counts.rural_clear_by_status.partially_eligible, `Some land maps to appendix successors but less than ${OZ2027_FULL_SHARE_PCT}%.`],
    ['not_eligible', oz2027Counts.designated_by_status.not_eligible, oz2027Counts.rural_clear_by_status.not_eligible, 'No 2020 successor of this tract appears on the appendix.'],
    ['unknown', oz2027Counts.designated_by_status.unknown, oz2027Counts.rural_clear_by_status.unknown, 'No 2010-to-2020 bridge exists, so the appendix could not be reached.'],
    [], ['oz2027_rural_flag', 'Designated OZ tracts', 'rural_clear tracts', 'Meaning - OZ 2.0 definition, NOT EB-5 rural'],
    ...OZ2027_FLAGS.map((flag) => [flag, oz2027Counts.designated_by_rural_flag[flag], oz2027Counts.rural_clear_by_rural_flag[flag], ({
      rural: 'Every eligible successor of this tract is flagged rural on the appendix.',
      non_rural: 'Eligible successors exist and none of them is flagged rural.',
      mixed: 'Eligible successors disagree: some rural, some not.',
      not_eligible: 'No eligible successor, so the appendix reports no rural status.',
      unknown: 'No bridge to 2020 tracts, so the appendix could not be reached.',
    })[flag]]),
    [], ['The OZ 2.0 rural definition (city or town over 50,000 plus adjacent urbanized area) and the EB-5 rural definition (outside every OMB metropolitan statistical area and outside any city or town of 20,000 or more) are different statutes and never substitute for one another.'],
    [], ['Incentive flags - eligibility indicators that travel with the tract. None of them is an EB-5 input and none is derived from eb5_rural_class.'],
    ['lihtc_qct_2026', 'Designated OZ tracts', 'rural_clear tracts', 'Meaning - HUD LIHTC Qualified Census Tract 2026, 2020 boundaries bridged by land share'],
    ['yes', incentiveCounts.lihtc_qct_2026.designated.yes, incentiveCounts.lihtc_qct_2026.rural_clear.yes, `${INCENTIVE_FULL_SHARE_PCT}% or more of the 2010 tract's land maps to 2020 successors on HUD's 2026 QCT list.`],
    ['partial', incentiveCounts.lihtc_qct_2026.designated.partial, incentiveCounts.lihtc_qct_2026.rural_clear.partial, `Some land maps to QCT successors but less than ${INCENTIVE_FULL_SHARE_PCT}%.`],
    ['no', incentiveCounts.lihtc_qct_2026.designated.no, incentiveCounts.lihtc_qct_2026.rural_clear.no, 'No 2020 successor of this tract is a 2026 QCT.'],
    ['unknown', incentiveCounts.lihtc_qct_2026.designated.unknown, incentiveCounts.lihtc_qct_2026.rural_clear.unknown, `The QCT list could not be reached: either the tract has no 2010-to-2020 bridge, or its state codes every QCT on county equivalents the relationship file does not carry. On this run that second case is Connecticut, where HUD codes all ${qctUnreachableStates.get('09') ?? 0} QCTs on the 2022 planning regions (09110-09190) while the relationship file keys Connecticut on the 2020 counties. Those tracts read unknown rather than "no".`],
    ['', '', '', 'QCT status means eligibility for the 30% boost to LIHTC qualified basis. It is not a housing programme award or an allocation.'],
    [], ['lihtc_dda_2026', 'Designated OZ tracts', 'rural_clear tracts', 'Meaning - HUD LIHTC Difficult Development Area 2026, non-metropolitan county leg only'],
    ['yes', incentiveCounts.lihtc_dda_2026.designated.yes, incentiveCounts.lihtc_dda_2026.rural_clear.yes, "The tract's county (or Connecticut planning region) is on HUD's 2026 non-metropolitan DDA list."],
    ['no', incentiveCounts.lihtc_dda_2026.designated.no, incentiveCounts.lihtc_dda_2026.rural_clear.no, 'The county is outside every metropolitan area and is not on the non-metropolitan DDA list.'],
    ['metro_zcta_not_evaluated', incentiveCounts.lihtc_dda_2026.designated.metro_zcta_not_evaluated, incentiveCounts.lihtc_dda_2026.rural_clear.metro_zcta_not_evaluated, 'The county is metropolitan. Metropolitan DDAs are designated by ZIP Code Tabulation Area and need a tract-to-ZCTA crosswalk this pass does not add, so the question was not answered rather than answered "no".'],
    ['unknown', incentiveCounts.lihtc_dda_2026.designated.unknown, incentiveCounts.lihtc_dda_2026.rural_clear.unknown, 'Metropolitan status or the Connecticut planning region was not resolved, so neither leg could be applied.'],
    [], ['nmtc_lic_eligible', 'Designated OZ tracts', 'rural_clear tracts', 'Meaning - CDFI Fund NMTC Low-Income Community eligibility, 2016-2020 ACS on 2020 boundaries bridged by land share'],
    ['yes', incentiveCounts.nmtc_lic_eligible.designated.yes, incentiveCounts.nmtc_lic_eligible.rural_clear.yes, `${INCENTIVE_FULL_SHARE_PCT}% or more of the 2010 tract's land maps to 2020 successors the CDFI Fund flags as eligible low-income communities.`],
    ['partial', incentiveCounts.nmtc_lic_eligible.designated.partial, incentiveCounts.nmtc_lic_eligible.rural_clear.partial, `Some land maps to eligible successors but less than ${INCENTIVE_FULL_SHARE_PCT}%.`],
    ['no', incentiveCounts.nmtc_lic_eligible.designated.no, incentiveCounts.nmtc_lic_eligible.rural_clear.no, 'No 2020 successor of this tract is an eligible low-income community.'],
    ['unknown', incentiveCounts.nmtc_lic_eligible.designated.unknown, incentiveCounts.nmtc_lic_eligible.rural_clear.unknown, 'No 2010-to-2020 bridge exists, so the eligibility file could not be reached.'],
    ['nmtc_poverty_rate / nmtc_mfi_ratio_pct populated', nmtcDemographics.designated_with_poverty_rate + ' / ' + nmtcDemographics.designated_with_mfi_ratio, nmtcDemographics.rural_clear_with_poverty_rate + ' / ' + nmtcDemographics.rural_clear_with_mfi_ratio, `Carried only where the 2010 tract bridges to exactly one 2020 successor and that successor reports the figure; averaging successors would invent a number the source does not publish. ${nmtc.poverty_rate_na} of the file's ${nmtc.tracts} tracts report "NA" for the poverty rate and ${nmtc.mfi_ratio_na} for the income ratio.`],
    ['', '', '', 'LIC eligibility is a programme eligibility indicator, not an allocation, an award or a qualified equity investment.'],
    [], ['ACS demographics - sample estimates that describe the tract at designation (2011-2015 ACS) and at the latest 5-year release (2020-2024 ACS). Not an EB-5 input, not a current condition, not a market study.'],
    ['acs2015_lic_eligible', 'Designated OZ tracts', 'rural_clear tracts', 'Meaning - CDFI Fund low-income-community test on the 2011-2015 ACS, the vintage the 2018 designations rested on, joined directly on the 2010 tract'],
    ['yes', acsCounts.at_designation.lic.designated.yes, acsCounts.at_designation.lic.rural_clear.yes, 'The tract met the low-income-community test on the 2011-2015 ACS: poverty rate 20% or more, or median family income 80% or less of the benchmark.'],
    ['no', acsCounts.at_designation.lic.designated.no, acsCounts.at_designation.lic.rural_clear.no, 'The tract did not meet that test on the 2011-2015 ACS. Its designation then rested on contiguity or another route the file does not record.'],
    ['unknown', acsCounts.at_designation.lic.designated.unknown, acsCounts.at_designation.lic.rural_clear.unknown, 'No row for the tract in the 2011-2015 file.'],
    ['acs2015 values carried (poverty rate / income ratio / poverty universe)', ACS2015_FIELDS.map((f) => acsCounts.at_designation.carried.designated[f]).join(' / '), ACS2015_FIELDS.map((f) => acsCounts.at_designation.carried.rural_clear[f]).join(' / '), `The file's own values; "N/A" is carried as blank. ${nmtc2015.poverty_rate_na} of the file's ${nmtc2015.tracts} tracts report "N/A" for the poverty rate, ${nmtc2015.mfi_ratio_na} for the income ratio and ${nmtc2015.population_na} for the population.`],
    [], ['acs2024_coverage', 'Designated OZ tracts', 'rural_clear tracts', `Meaning - how the ${ACS_LATEST_LABEL} tables, on 2020 tracts, reach this 2010 tract`],
    ['whole', acsCounts.latest.coverage.designated.whole, acsCounts.latest.coverage.rural_clear.whole, 'Every 2020 successor lies wholly inside the tract: population and the poverty universe are exact sums, the poverty rate is the exact aggregate, and the median is carried only when there is a single successor.'],
    ['containing_tract', acsCounts.latest.coverage.designated.containing_tract, acsCounts.latest.coverage.rural_clear.containing_tract, 'One 2020 successor contains the tract and extends beyond it: its poverty rate and median describe that wider tract, and no count is carried.'],
    ['partial', acsCounts.latest.coverage.designated.partial, acsCounts.latest.coverage.rural_clear.partial, 'Several successors and at least one extends beyond the tract: nothing is carried rather than apportioning a sample estimate.'],
    ['unknown', acsCounts.latest.coverage.designated.unknown, acsCounts.latest.coverage.rural_clear.unknown, 'No 2010-to-2020 bridge, or a successor with no row in the tables.'],
    ['acs2024 values carried (population / poverty universe / poverty rate / median family income)', ACS2024_FIELDS.map((f) => acsCounts.latest.carried.designated[f]).join(' / '), ACS2024_FIELDS.map((f) => acsCounts.latest.carried.rural_clear[f]).join(' / '), `Census jam values (estimate not available) are carried as blank: ${JSON.stringify(acsJam)}. A median family income of ${ACS_MFI_TOP_CODE} is the Census Bureau top code for $${(ACS_MFI_TOP_CODE - 1).toLocaleString('en-US')} or more; ${acsCounts.latest.top_coded_median_family_income} carried medians are top-coded.`]];
  const roles = { cdfi: 'OZ designation (authority)', omb: 'MSA membership by county (authority)', rel: '2010 to 2020 tract bridge (authority)', iiusa: 'City/town 20,000 test and rural flag (external comparison)', irs2027: '2027 nomination eligibility and the OZ 2.0 rural flag (authority for the 2027 round only)', nmtc: 'NMTC Low-Income Community eligibility, poverty rate and median family income ratio (authority)',
    nmtc2015: 'ACS 2011-2015 poverty rate, median family income ratio, poverty universe and the low-income-community test at designation (authority, 2010 tracts, direct join)',
    acs2024_b01003: `${ACS_LATEST_LABEL} total population (authority, 2020 tracts, bridged)`, acs2024_b17001: `${ACS_LATEST_LABEL} poverty status (authority, 2020 tracts, bridged)`, acs2024_b19113: `${ACS_LATEST_LABEL} median family income (authority, 2020 tracts, bridged)` };
  const sourceRows = [['Key', 'Role', 'URL', 'SHA-256', 'Bytes', 'Fetched (UTC)', 'Note'], ...Object.entries(receipts).map(([k, r]) => [k, roles[k], r.url, r.sha256, r.bytes, r.fetched_utc, r.note]),
    ['geocoder', 'Connecticut interior-point resolution and the ME/NH/VT/MA/RI town test', GEOCODER + 'coordinates', '', '', started, `Census Geocoder, benchmark ${BENCHMARK}; vintage Current_Current for the Connecticut planning region and CBSA, vintage Census2020_Current layers=all for the New England County Subdivisions population`],
    ['hud', 'Designated 2010 polygons for Connecticut and New England interior points', HUD_OZ, '', '', started, 'HUD Opportunity Zones FeatureServer layer 13'],
    ['qct_2026', 'LIHTC Qualified Census Tract 2026 flag (authority)', HUD_QCT_2026, qctFetch.receipts.map((r) => r.sha256).join('; '), qctFetch.receipts.reduce((s, r) => s + r.bytes, 0), qctFetch.receipts[0]?.fetched_utc ?? started, `HUD FeatureServer layer 0, anonymous and keyless; outFields ${QCT_OUT_FIELDS}, no geometry, keyset paging on OBJECTID. ${qct.tracts} qualified tracts fetched across ${qctFetch.pages} pages against a server count of ${qctFetch.serverCount} (${qctFetch.reconciliation}). GEOIDs read as ${qctVintage.reads_as} (${qctVintage.on_2020_tracts} of ${qctVintage.ids} present in the relationship file's 2020 tract set), bridged onto the 2010 tract by land share. The layer's own description still reads "for 2024 ... Date of Coverage: Fiscal Year 2024, Date Updated: 10/2023" while the service is named QUALIFIED_CENSUS_TRACTS_2026; the service name is what is reported here. Connecticut is not answerable through this bridge: all ${qctUnreachableStates.get('09') ?? 0} of HUD's Connecticut QCTs are coded on the 2022 planning regions (09110-09190) while the relationship file keys Connecticut on the 2020 counties 09001-09015, so every Connecticut tract reads unknown rather than "no". QCT status means eligibility for the 30% LIHTC basis boost, not a housing programme award.`],
    ['dda_2026', 'LIHTC Difficult Development Area 2026 flag, non-metropolitan county leg (authority)', HUD_DDA_2026, ddaFetch.receipts.map((r) => r.sha256).join('; '), ddaFetch.receipts.reduce((s, r) => s + r.bytes, 0), ddaFetch.receipts[0]?.fetched_utc ?? started, `HUD FeatureServer layer 0, anonymous and keyless; outFields ${DDA_OUT_FIELDS}, no geometry, keyset paging on OBJECTID. ${ddaFetch.records.length} records fetched across ${ddaFetch.pages} pages against a server count of ${ddaFetch.serverCount} (${ddaFetch.reconciliation}): ${dda.non_metro_rows} non-metropolitan records giving ${dda.non_metro_counties} counties keyed by the NCNTY<FIPS> prefix of DDA_CODE, and ${dda.metro_rows} metropolitan small-area records keyed on ${dda.metro_zctas} ZIP Code Tabulation Areas. Only the county leg is joined here; the ZCTA leg needs a tract-to-ZCTA crosswalk this pass does not add, so metropolitan tracts read metro_zcta_not_evaluated.`]];
  await fs.mkdir(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'oz-eb5-tracts.csv'), xlsxPath = path.join(outDir, 'oz-eb5-tracts.xlsx'), marketsPath = path.join(outDir, 'oz-eb5-markets.csv');
  const csvText = '﻿' + toCsv(objectsToRows(results, columns));
  await fs.writeFile(csvPath, csvText);
  const marketsText = '﻿' + toCsv(objectsToRows(markets, marketColumns));
  await fs.writeFile(marketsPath, marketsText);
  const xlsxBuf = writeXlsx([{ name: 'Tracts', rows: objectsToRows(results, columns) }, { name: 'Markets', rows: objectsToRows(markets, marketColumns) }, { name: 'Summary', rows: summaryRows }, { name: 'Sources', rows: sourceRows }]);
  await fs.writeFile(xlsxPath, xlsxBuf);
  const manifest = { mode: 'tracts', started_utc: started, finished_utc: new Date().toISOString(), script_sha256: SCRIPT_SHA256, designated_tracts: results.length, counts, market_counties: markets.length, connecticut_point_resolved: connecticut.length,
    new_england_town_test: { tracts_tested: townChecks.length, moved_to_interpretation_dependent: townDependent, failed: townFailures },
    sliver_filter_share: SLIVER_SHARE, tracts_with_dropped_successors: results.filter((r) => r.dropped_successors).length,
    iiusa_tracts: iiusa.size, iiusa_rural_true_count: [...iiusa.values()].filter((o) => o.rural === 'TRUE').length,
    oz2027: { receipt: receipts.irs2027, eligible_tracts: oz2027.eligible, oz_rural_tracts: oz2027.rural, non_rural_tracts: oz2027.non_rural, full_share_pct: OZ2027_FULL_SHARE_PCT, counts: oz2027Counts, basis: OZ2027_BASIS },
    lihtc_qct_2026: {
      layer: HUD_QCT_2026, layer_metadata: qctFetch.meta, receipts: qctFetch.receipts,
      server_count: qctFetch.serverCount, fetched_count: qctFetch.records.length, pages: qctFetch.pages,
      duplicate_object_ids_dropped: qctFetch.duplicates, reconciliation: qctFetch.reconciliation,
      qualified_tracts: qct.tracts, duplicate_geoids_dropped: qct.duplicate_geoids,
      geoid_vintage_check: qctVintage, full_share_pct: INCENTIVE_FULL_SHARE_PCT, counts: incentiveCounts.lihtc_qct_2026,
      unreachable_states: Object.fromEntries(qctUnreachableStates), partly_unreachable_states: qctPartlyUnreachableStates,
      unreachable_states_note: `A state whose QCT GEOIDs are all absent from the Census 2010-to-2020 relationship file cannot be answered by this bridge, and every tract in it reads unknown rather than "no". On this run that is Connecticut only: HUD codes all ${qctUnreachableStates.get('09') ?? 0} of its 2026 QCTs on the 2022 planning regions (09110-09190) while the relationship file keys Connecticut on the 2020 counties 09001-09015. Answering Connecticut needs a planning-region tract crosswalk this pass does not add.`,
      // The service is named for 2026 while its own description text still reads 2024; recorded rather than resolved.
      publisher_description_note: 'The layer is served as QUALIFIED_CENSUS_TRACTS_2026 but its description field still reads "for 2024" with "Date of Coverage: Fiscal Year 2024" and "Date Updated: 10/2023". The description was not refreshed with the service name; the GEOIDs themselves are checked against the relationship file above.',
      basis: QCT_BASIS,
    },
    lihtc_dda_2026: {
      layer: HUD_DDA_2026, layer_metadata: ddaFetch.meta, receipts: ddaFetch.receipts,
      server_count: ddaFetch.serverCount, fetched_count: ddaFetch.records.length, pages: ddaFetch.pages,
      duplicate_object_ids_dropped: ddaFetch.duplicates, reconciliation: ddaFetch.reconciliation,
      keyed_by: 'DDA_TYPE "NM" records are designated along county boundaries and carry the county FIPS inside DDA_CODE as NCNTY<fips>N<fips>; DDA_TYPE "SA" records are metropolitan small areas designated by ZIP Code Tabulation Area and carry ZCTA5. The layer has no county FIPS field of its own.',
      non_metro_rows: dda.non_metro_rows, non_metro_counties: dda.non_metro_counties,
      metro_rows: dda.metro_rows, metro_zctas: dda.metro_zctas, metro_rows_without_zcta: dda.metro_rows_without_zcta,
      legs_implemented: { non_metropolitan_county: true, metropolitan_zcta: false },
      metropolitan_leg_note: 'Not implemented. A metropolitan tract reads metro_zcta_not_evaluated rather than "no", because answering it needs a tract-to-ZCTA crosswalk this pass does not add and a metropolitan tract must never be upgraded from the county list.',
      connecticut_planning_regions_resolved: ctPlanningRegion.size, counts: incentiveCounts.lihtc_dda_2026, basis: DDA_BASIS_HEAD,
    },
    nmtc_lic: {
      receipt: receipts.nmtc, acs_vintage: nmtc.acs_vintage, tracts: nmtc.tracts, rows_parsed: nmtc.rows_parsed,
      eligible_lic: nmtc.eligible, not_eligible: nmtc.not_eligible, severe_distress: nmtc.severe_distress, deep_distress: nmtc.deep_distress,
      non_metro_tracts: nmtc.non_metro, poverty_rate_na: nmtc.poverty_rate_na, mfi_ratio_na: nmtc.mfi_ratio_na,
      header_row: nmtc.header_row, geoid_vintage_check: nmtcVintage, full_share_pct: INCENTIVE_FULL_SHARE_PCT,
      counts: incentiveCounts.nmtc_lic_eligible, demographics_carried: nmtcDemographics,
      mfi_note: 'The file writes the median family income column as a ratio (0.736 = 73.6% of the benchmark) though its header calls it a percent; nmtc_mfi_ratio_pct is that ratio multiplied by 100.',
      basis: NMTC_BASIS,
    },
    acs_demographics: {
      at_designation: {
        receipt: receipts.nmtc2015, acs_vintage: nmtc2015.acs_vintage, keyed_on: '2010 census tract GEOID, joined directly with no bridge',
        tracts: nmtc2015.tracts, eligible_lic: nmtc2015.eligible, not_eligible: nmtc2015.not_eligible,
        poverty_rate_na: nmtc2015.poverty_rate_na, mfi_ratio_na: nmtc2015.mfi_ratio_na, population_na: nmtc2015.population_na,
        mfi_column_note: `The income column is already a percent in this file (national median ${nmtc2015.mfi_median_pct}%), unlike the 2016-2020 file's ratio; the loader checks this rather than assuming it.`,
        header_row: nmtc2015.header_row, geoid_vintage_check: acs2015Vintage,
        designated_joined: results.filter((r) => r.acs2015_lic_eligible !== 'unknown').length, counts: acsCounts.at_designation, basis: ACS2015_BASIS,
      },
      latest: {
        label: ACS_LATEST_LABEL, receipts: { B01003: receipts.acs2024_b01003, B17001: receipts.acs2024_b17001, B19113: receipts.acs2024_b19113 },
        tract_rows: { B01003: acsPop.tract_rows, B17001: acsPov.tract_rows, B19113: acsMfi.tract_rows }, cells: [...acsPop.cells, ...acsPov.cells, ...acsMfi.cells],
        jam_values: acsJam, geoid_vintage_check: acs2024Vintage, containment_share: CONTAINMENT_SHARE,
        unreachable_states: Object.fromEntries(acsUnreachableStates), partly_unreachable_states: acsPartlyUnreachableStates, states_without_acs_tract_rows: Object.fromEntries(acsAbsentStates),
        unreachable_states_note: 'A state whose ACS tract IDs are all absent from the relationship file\'s 2020 set is coded on county equivalents the file does not carry (Connecticut\'s 2022 planning regions) and reads unknown; a state present in the relationship file with no ACS tract row is outside the survey (the island territories) and reads unknown. Both are detected from the data on each run.',
        coverage_rule: 'whole: every 2020 successor lies wholly inside the 2010 tract (at least containment_share of the successor\'s own land is in the part), so counts are exact sums and the poverty rate the exact aggregate, with the median carried only from a single successor. containing_tract: one successor extends beyond the tract, so its rate and median describe the wider tract and no count is carried. partial: several successors and at least one extends beyond, nothing carried. unknown: no bridge or a successor with no table row.',
        top_code_note: `A median family income of ${ACS_MFI_TOP_CODE} is the Census Bureau top code for $${(ACS_MFI_TOP_CODE - 1).toLocaleString('en-US')} or more.`,
        counts: acsCounts.latest, basis: ACS2024_BASIS,
      },
    },
    sources: receipts, outputs: { csv: { file: path.basename(csvPath), sha256: sha256(Buffer.from(csvText)) }, markets_csv: { file: path.basename(marketsPath), sha256: sha256(Buffer.from(marketsText)) }, xlsx: { file: path.basename(xlsxPath), sha256: sha256(xlsxBuf) } }, rule: 'EB-5 rural = outside every OMB metropolitan statistical area and outside any city or town with 2020 population >= 20,000 (INA 203(b)(5)(D)(ii)). Micropolitan does not exclude. Tract classes are screens; the statute tests the site.' };
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  process.stdout.write(`${JSON.stringify(counts)}\n${markets.length} counties with clear or interpretation-dependent rural tracts\n`);
  process.stdout.write(`oz2027_status (all designated): ${JSON.stringify(oz2027Counts.designated_by_status)}\noz2027_status (rural_clear): ${JSON.stringify(oz2027Counts.rural_clear_by_status)}\n`);
  process.stdout.write(`oz2027_rural_flag (all designated): ${JSON.stringify(oz2027Counts.designated_by_rural_flag)}\noz2027_rural_flag (rural_clear): ${JSON.stringify(oz2027Counts.rural_clear_by_rural_flag)}\n`);
  for (const [flag, block] of Object.entries(incentiveCounts)) process.stdout.write(`${flag} (all designated): ${JSON.stringify(block.designated)}\n${flag} (rural_clear): ${JSON.stringify(block.rural_clear)}\n`);
  process.stdout.write(`nmtc demographics carried: ${JSON.stringify(nmtcDemographics)}\n`);
  process.stdout.write(`acs2015_lic_eligible (all designated): ${JSON.stringify(acsCounts.at_designation.lic.designated)}\nacs2015_lic_eligible (rural_clear): ${JSON.stringify(acsCounts.at_designation.lic.rural_clear)}\nacs2015 carried: ${JSON.stringify(acsCounts.at_designation.carried)}\nacs2015 medians: ${JSON.stringify(acsCounts.at_designation.medians)}\n`);
  process.stdout.write(`acs2024_coverage (all designated): ${JSON.stringify(acsCounts.latest.coverage.designated)}\nacs2024_coverage (rural_clear): ${JSON.stringify(acsCounts.latest.coverage.rural_clear)}\nacs2024 carried: ${JSON.stringify(acsCounts.latest.carried)}\nacs2024 medians: ${JSON.stringify(acsCounts.latest.medians)}; top-coded medians ${acsCounts.latest.top_coded_median_family_income}\n`);
  process.stdout.write(`Wrote ${csvPath}, ${marketsPath}, ${xlsxPath}, manifest.json\n`);
}

// ---------- site mode ----------
async function runSites(inputPath, outDir) {
  const rawDir = path.join(outDir, 'raw');
  const started = new Date().toISOString();
  // Validate the input before downloading anything. An empty or header-only CSV used to reach Object.keys(results[0])
  // and fail with a TypeError after two downloads; it must fail immediately and say what is wrong.
  const rows = parseCsv(await fs.readFile(inputPath, 'utf8'));
  if (!rows.length) throw new Error(`${inputPath} has no rows at all, not even a header. Supply a CSV with an id column plus latitude/longitude or address.`);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const iId = find(['id', 'site_id', 'parcel_key', 'parcel_id', 'name']), iLat = find(['latitude', 'lat', 'y']), iLon = find(['longitude', 'lon', 'lng', 'long', 'x']), iAddress = find(['address', 'situs_address', 'oneline', 'full_address']);
  if (iLat < 0 && iAddress < 0) throw new Error('Input needs latitude/longitude or address columns.');
  if (rows.length < 2) throw new Error(`${inputPath} has a header row (${rows[0].join(', ')}) but no data rows; there is nothing to test.`);
  const { buf: cdfiBuf, receipt: cdfiReceipt } = await fetchCached(SOURCES.cdfi, rawDir);
  const { buf: ombBuf, receipt: ombReceipt } = await fetchCached(SOURCES.omb, rawDir);
  const designated = new Set(loadCdfi(cdfiBuf).map((t) => t.geoid));
  const aliasToCdfi = new Map(Object.entries(CDFI_TO_2010_ALIAS).map(([cdfiId, id2010]) => [id2010, cdfiId]));
  const omb = loadOmb(ombBuf);
  const results = [];
  for (const [n, r] of rows.slice(1).entries()) {
    const site = { id: iId >= 0 ? r[iId] : String(n + 1), input_address: iAddress >= 0 ? r[iAddress] : '', input_latitude: iLat >= 0 ? r[iLat] : '', input_longitude: iLon >= 0 ? r[iLon] : '', matched_address: '', longitude: '', latitude: '', point_basis: '', tract_2010: '', oz_designated_cdfi: '', hud_oz_polygon: '', oz_agreement: '', county_fips: '', county_name: '', cbsa_code: '', cbsa_title: '', cbsa_type: '', msa_basis: '', geocoder_msa_current: '', place_geoid: '', place_name: '', place_pop_2020: '', place_kind: '', county_subdivision: '', county_subdivision_pop_2020: '', tract_2020: '', eb5_rural_class: '', oz_and_eb5_rural: '', class_reason: '', notes: '' };
    results.push(site);
    try {
      // Both halves of the coordinate must be present, finite and in range. Number('') is 0, so a row carrying only a
      // latitude used to be tested at longitude 0 in the Gulf of Guinea and come back as a confident answer.
      const latText = String(site.input_latitude ?? '').trim(), lonText = String(site.input_longitude ?? '').trim();
      const addressText = String(site.input_address ?? '').trim();
      let lon = Number(lonText), lat = Number(latText), g2020;
      const usableCoordinate = latText !== '' && lonText !== '' && Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const badCoordinate = (latText !== '' || lonText !== '') && !usableCoordinate;
      if (usableCoordinate) { site.point_basis = 'supplied coordinate'; g2020 = await geocodePoint(lon, lat, 'Census2020_Current'); }
      else if (addressText !== '') {
        if (badCoordinate) site.notes += `Supplied coordinates (latitude "${latText || '(empty)'}", longitude "${lonText || '(empty)'}") are incomplete or out of range; the address was used instead. `;
        const match = await geocodeAddress(addressText, 'Census2020_Current');
        if (!match) { site.eb5_rural_class = 'unknown'; site.oz_and_eb5_rural = 'unknown'; site.class_reason = 'Census Geocoder found no match for the address.'; continue; }
        site.matched_address = match.matchedAddress; lon = match.coordinates.x; lat = match.coordinates.y; g2020 = match.geographies; site.point_basis = 'geocoded address (street-range interpolation, not rooftop)';
      } else {
        site.eb5_rural_class = 'unknown'; site.oz_and_eb5_rural = 'unknown';
        site.class_reason = badCoordinate
          ? `No usable point: latitude "${latText || '(empty)'}" and longitude "${lonText || '(empty)'}" are not both finite numbers within [-90, 90] and [-180, 180], and the row carries no address.`
          : 'No usable point: the row carries neither a coordinate nor an address.';
        continue;
      }
      site.longitude = lon; site.latitude = lat;
      const g2010 = await geocodePoint(lon, lat, 'Census2010_Current');
      const current = await geocodePoint(lon, lat, 'Current_Current');
      const tract2010 = pick(g2010, 'Census Tracts')?.GEOID ?? '';
      site.tract_2010 = tract2010;
      const cdfiId = aliasToCdfi.get(tract2010) ?? tract2010;
      const isDesignated = designated.has(cdfiId);
      site.oz_designated_cdfi = tract2010 ? (isDesignated ? 'Y' : 'N') : '';
      const hud = await hudPolygonAt(lon, lat);
      site.hud_oz_polygon = hud.join('; ');
      site.oz_agreement = !tract2010 ? '' : (hud.length > 0) === isDesignated ? 'agree' : 'CONFLICT';
      const county2020 = pick(g2020, 'Counties'), countyCurrent = pick(current, 'Counties');
      site.county_fips = county2020?.GEOID ?? ''; site.county_name = county2020?.NAME ?? '';
      const ombKey = countyCurrent?.GEOID ?? site.county_fips;
      Object.assign(site, msaFromOmb(ombKey, omb));
      site.msa_basis = `OMB 2023 List 1 by ${ombKey.startsWith('09') ? 'planning region' : 'county'} ${ombKey}`;
      const geoMsa = msaFromGeocoder(current);
      site.geocoder_msa_current = geoMsa.cbsa_type === 'none' ? 'none' : `${geoMsa.cbsa_title} (${geoMsa.cbsa_type})`;
      if (geoMsa.cbsa_type !== site.cbsa_type) site.notes += `Geocoder current-vintage CBSA (${site.geocoder_msa_current}) differs from OMB 2023 by county. `;
      const place = pick(g2020, 'Incorporated Places'), cdp = pick(g2020, 'Census Designated Places'), cousub = pick(g2020, 'County Subdivisions');
      // POP100 absent is not POP100 zero: Number('') is 0, which used to let a place with no reported population
      // fall through to rural_clear as though the 20,000 test had been answered.
      if (place) { site.place_geoid = place.GEOID; site.place_name = place.NAME; site.place_pop_2020 = numOrBlank(place.POP100); site.place_kind = 'incorporated'; }
      else if (cdp) { site.place_geoid = cdp.GEOID; site.place_name = cdp.NAME; site.place_pop_2020 = numOrBlank(cdp.POP100); site.place_kind = 'cdp'; }
      else site.place_kind = 'none';
      if (cousub) { site.county_subdivision = cousub.NAME; site.county_subdivision_pop_2020 = numOrBlank(cousub.POP100); }
      site.tract_2020 = pick(g2020, 'Census Tracts')?.GEOID ?? '';
      const pop = site.place_pop_2020 === '' ? null : Number(site.place_pop_2020);
      const townPop = site.county_subdivision_pop_2020 === '' ? null : Number(site.county_subdivision_pop_2020);
      const inNewEngland = NEW_ENGLAND.has(site.county_fips.slice(0, 2));
      if (!site.tract_2010) { site.eb5_rural_class = 'unknown'; site.class_reason = 'The Census Geocoder returned no 2010 census tract at this point, so designated-OZ membership was not established and the EB-5 rural legs were not decided.'; }
      else if (site.cbsa_type === 'metropolitan') { site.eb5_rural_class = 'not_rural_msa'; site.class_reason = `Point is in ${site.county_name || ombKey}, part of ${site.cbsa_title} (OMB 2023 metropolitan statistical area).`; }
      else if (site.place_kind !== 'none' && pop === null) { site.eb5_rural_class = 'unknown'; site.class_reason = `Outside every MSA, but place population not returned by the geocoder for ${site.place_name || 'the place at this point'} (${site.place_kind}), so the 20,000 city-or-town test was not performed.`; }
      else if (site.place_kind === 'incorporated' && pop >= POP_THRESHOLD) { site.eb5_rural_class = 'not_rural_place'; site.class_reason = `Point is inside ${site.place_name}, 2020 population ${pop.toLocaleString('en-US')}.`; }
      else if (site.place_kind === 'cdp' && pop >= POP_THRESHOLD) { site.eb5_rural_class = 'rural_interpretation_dependent'; site.class_reason = `Outside every MSA; point is inside ${site.place_name}, a census designated place of ${pop.toLocaleString('en-US')}; USCIS treatment of CDPs as a city or town is not settled.`; }
      else if (inNewEngland && cousub && townPop === null) { site.eb5_rural_class = 'unknown'; site.class_reason = `Outside every MSA and outside any 20,000+ incorporated place, but town population not returned by the geocoder for New England town ${site.county_subdivision}, so the 20,000 town test was not performed.`; }
      else if (inNewEngland && townPop !== null && townPop >= POP_THRESHOLD) { site.eb5_rural_class = 'rural_interpretation_dependent'; site.class_reason = `Outside every MSA and outside any 20,000+ incorporated place, but inside New England town ${site.county_subdivision} (${townPop.toLocaleString('en-US')}); town treatment under the 20,000 test is unresolved.`; }
      else { site.eb5_rural_class = 'rural_clear'; site.class_reason = `Outside every 2023 OMB metropolitan area${site.cbsa_type === 'micropolitan' ? ` (${site.cbsa_title} micropolitan area does not exclude)` : ''}; ${site.place_kind === 'none' ? 'not inside any incorporated place or CDP' : `inside ${site.place_name}, 2020 population ${pop.toLocaleString('en-US')}, below 20,000`}.`; }
      // "N (not a designated OZ)" is a finding about the CDFI list. With no 2010 tract there is no such finding.
      site.oz_and_eb5_rural = site.oz_designated_cdfi === '' ? 'unknown'
        : site.oz_designated_cdfi !== 'Y' ? 'N (not a designated OZ)'
        : site.eb5_rural_class === 'rural_clear' ? 'Y'
        : site.eb5_rural_class === 'rural_interpretation_dependent' ? 'CHECK' : 'N';
      site.notes += 'Point test only: a parcel may straddle a tract, place or county boundary. ';
      await pause(PAUSE_MS);
    } catch (error) {
      site.eb5_rural_class = 'unknown'; site.oz_and_eb5_rural = 'unknown'; site.class_reason = `Lookup failed: ${error.message}`;
    }
    process.stdout.write(`${site.id}: OZ ${site.oz_designated_cdfi || '?'} / ${site.eb5_rural_class} / ${site.oz_and_eb5_rural}\n`);
  }
  const columns = Object.keys(results[0]);
  const counts = {};
  for (const r of results) counts[r.oz_and_eb5_rural || 'unknown'] = (counts[r.oz_and_eb5_rural || 'unknown'] ?? 0) + 1;
  await fs.mkdir(outDir, { recursive: true });
  const base = path.basename(inputPath).replace(/\.[^.]+$/, '');
  const csvPath = path.join(outDir, `${base}-eb5-oz-sites.csv`), xlsxPath = path.join(outDir, `${base}-eb5-oz-sites.xlsx`);
  const csvText = '﻿' + toCsv(objectsToRows(results, columns));
  await fs.writeFile(csvPath, csvText);
  const sourceRows = [['Key', 'URL', 'SHA-256', 'Fetched (UTC)', 'Note'], ['cdfi', cdfiReceipt.url, cdfiReceipt.sha256, cdfiReceipt.fetched_utc, cdfiReceipt.note], ['omb', ombReceipt.url, ombReceipt.sha256, ombReceipt.fetched_utc, ombReceipt.note], ['geocoder', GEOCODER, '', started, `Census Geocoder benchmark ${BENCHMARK}; vintages Census2010_Current (tract for OZ), Census2020_Current (county, place, CDP, county subdivision with 2020 POP100), Current_Current (2023 CBSA layers, Connecticut planning regions)`], ['hud', HUD_OZ, '', started, 'HUD Opportunity Zones FeatureServer layer 13 point intersection']];
  const xlsxBuf = writeXlsx([{ name: 'Sites', rows: objectsToRows(results, columns) }, { name: 'Sources', rows: sourceRows }]);
  await fs.writeFile(xlsxPath, xlsxBuf);
  const manifest = { mode: 'sites', input: path.resolve(inputPath), input_sha256: sha256(await fs.readFile(inputPath)), started_utc: started, finished_utc: new Date().toISOString(), script_sha256: SCRIPT_SHA256, sites: results.length, counts, sources: { cdfi: cdfiReceipt, omb: ombReceipt }, outputs: { csv: { file: path.basename(csvPath), sha256: sha256(Buffer.from(csvText)) }, xlsx: { file: path.basename(xlsxPath), sha256: sha256(xlsxBuf) } } };
  await fs.writeFile(path.join(outDir, `${base}-eb5-oz-sites.manifest.json`), JSON.stringify(manifest, null, 2));
  process.stdout.write(`${JSON.stringify(counts)}\nWrote ${csvPath}, ${xlsxPath}\n`);
}

// ---------- parcel mode: state cadastral services inside rural_clear designated tracts ----------
// Owner-name fields (OwnerName, ownname, OWNERNME1, OWNERNME2 and the like) exist on all three services and are
// deliberately never requested, never cached and never written. Only the fields listed below are asked for.
const PARCEL_POINT_CAP = 30;
const PARCEL_ACRE_BAND = [1, 200];
const EARTH_RADIUS_M = 6378137;
const SQUARE_METRES_PER_ACRE = 4046.8564224;
const WI_PROPCLASS = { 1: 'residential', 2: 'commercial', 3: 'manufacturing', 4: 'agricultural', 5: 'undeveloped', '5M': 'agricultural forest', 6: 'productive forest', 7: 'other' };
const WI_DEVELOPABLE_CLASSES = new Set(['2', '3', '4', '5', '5M', '6', '7']);
const NC_NO_STRUCTURE = new Set(['0', 'N', 'NO', 'NONE', 'FALSE']);

const textOf = (v) => (v === null || v === undefined ? '' : String(v).trim());
const numOrBlank = (v) => { if (v === null || v === undefined || v === '') return ''; const n = Number(v); return Number.isFinite(n) ? n : ''; };
// Esri date fields arrive as epoch milliseconds (North Carolina sourcedate); render them as a plain UTC date.
// A bare year (Montana TaxYear 2026) or an already-formatted string (Wisconsin LOADDATE "3/06/2025") is left alone.
const dateOf = (v) => { if (v === null || v === undefined || v === '') return ''; const n = Number(v); return typeof v !== 'string' && Number.isFinite(n) && Math.abs(n) > 1e10 ? new Date(n).toISOString().slice(0, 10) : textOf(v); };

function mapMontana(p) {
  const cityStateZip = textOf(p.CityStateZip);
  const parsed = cityStateZip.match(/^(.*?),?\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  const landUse = textOf(p.PropType), buildingValue = numOrBlank(p.TotalBuildingValue);
  const hits = ['VAC', 'EP', 'AG', 'FARM', 'GRAZ', 'COMM', 'IND'].filter((k) => landUse.toUpperCase().includes(k));
  const reasons = [];
  if (hits.length) reasons.push(`PropType "${landUse}" contains ${hits.join(', ')}`);
  if (buildingValue === 0) reasons.push('TotalBuildingValue = 0');
  return {
    parcel_id: textOf(p.PARCELID), alt_parcel_id: '', source_object_id: textOf(p.OBJECTID), parcel_county: textOf(p.CountyName),
    situs_address: textOf(p.AddressLine1), city: parsed ? parsed[1].trim() : cityStateZip, zip: parsed ? parsed[3] : '',
    source_acres: numOrBlank(p.TotalAcres), source_acres_field: 'TotalAcres', source_acres_alt: numOrBlank(p.GISAcres), source_acres_alt_field: 'GISAcres',
    land_use_raw: landUse, land_use_note: '', improved_flag_raw: buildingValue === '' ? '' : buildingValue > 0 ? 'TotalBuildingValue > 0' : 'TotalBuildingValue = 0',
    land_value: numOrBlank(p.TotalLandValue), building_value: buildingValue, total_value: '', assessment_vintage: textOf(p.TaxYear),
    developable_flag: reasons.length ? 'Y' : 'N',
    developable_reason: reasons.length ? reasons.join('; ') : `PropType "${landUse}" matches no developable keyword and TotalBuildingValue is ${buildingValue === '' ? 'unreported' : buildingValue}`,
  };
}
function mapNorthCarolina(p) {
  const landUse = textOf(p.parusedesc), struct = textOf(p.struct);
  const hits = ['VACANT', 'AGRI', 'FARM', 'WOOD', 'FOREST', 'COMM', 'IND'].filter((k) => landUse.toUpperCase().includes(k));
  const noStructure = NC_NO_STRUCTURE.has(struct.toUpperCase());
  const reasons = [];
  if (hits.length) reasons.push(`parusedesc "${landUse}" contains ${hits.join(', ')}`);
  if (noStructure) reasons.push(`struct "${struct}" reports no structure`);
  return {
    parcel_id: textOf(p.parno), alt_parcel_id: '', source_object_id: textOf(p.objectid), parcel_county: textOf(p.cntyname),
    situs_address: textOf(p.siteadd), city: textOf(p.scity), zip: textOf(p.szip),
    source_acres: numOrBlank(p.gisacres), source_acres_field: 'gisacres', source_acres_alt: '', source_acres_alt_field: '',
    land_use_raw: landUse, land_use_note: '', improved_flag_raw: struct === '' ? '' : `struct ${struct}`,
    land_value: numOrBlank(p.landval), building_value: '', total_value: numOrBlank(p.parval), assessment_vintage: dateOf(p.sourcedate),
    developable_flag: reasons.length ? 'Y' : 'N',
    developable_reason: reasons.length ? reasons.join('; ') : `parusedesc "${landUse}" matches no developable keyword and struct "${struct}" does not report an empty parcel`,
    county_fips_source: textOf(p.stcntyfips),
  };
}
function mapWisconsin(p) {
  const landUse = textOf(p.PROPCLASS), improved = textOf(p.IMPROVED).toUpperCase();
  const codes = landUse.split(/[,;/]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  const hits = codes.filter((c) => WI_DEVELOPABLE_CLASSES.has(c));
  const reasons = [];
  if (hits.length) reasons.push(`PROPCLASS ${landUse} includes class ${hits.join(', ')}`);
  if (improved === 'N') reasons.push('IMPROVED = N');
  return {
    parcel_id: textOf(p.PARCELID), alt_parcel_id: textOf(p.STATEID), source_object_id: textOf(p.OBJECTID), parcel_county: textOf(p.CONAME),
    situs_address: textOf(p.SITEADRESS), city: textOf(p.PLACENAME), zip: textOf(p.ZIPCODE),
    source_acres: numOrBlank(p.DEEDACRES), source_acres_field: 'DEEDACRES', source_acres_alt: numOrBlank(p.GISACRES), source_acres_alt_field: 'GISACRES',
    land_use_raw: landUse, land_use_note: codes.map((c) => `${c} ${WI_PROPCLASS[c] ?? 'unlisted code'}`).join('; '),
    improved_flag_raw: improved ? `IMPROVED ${improved}` : '',
    land_value: numOrBlank(p.LNDVALUE), building_value: numOrBlank(p.IMPVALUE), total_value: numOrBlank(p.CNTASSDVALUE), assessment_vintage: textOf(p.LOADDATE),
    developable_flag: reasons.length ? 'Y' : 'N',
    developable_reason: reasons.length ? reasons.join('; ') : `PROPCLASS ${landUse || '(blank)'} is residential-only and IMPROVED is ${improved || 'unreported'}`,
    county_fips_source: textOf(p.PARCELFIPS),
  };
}
const PARCEL_SERVICES = {
  MT: {
    state_name: 'Montana', url: 'https://gisservice.mt.gov/arcgis/rest/services/msdi_cadastral_map_v1/MapServer/1/query',
    out_fields: 'OBJECTID,PARCELID,CountyName,GISAcres,TotalAcres,TaxYear,AddressLine1,CityStateZip,PropType,TotalLandValue,TotalBuildingValue',
    id_field: 'PARCELID', county_field: 'CountyName', order_field: 'OBJECTID', page_cap: 2000, map: mapMontana,
    note: 'Montana State Library MSDI cadastral parcels, map service layer 1. Owner-name fields exist on the layer and are not requested.',
  },
  NC: {
    state_name: 'North Carolina', url: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query',
    out_fields: 'objectid,parno,cntyname,stcntyfips,siteadd,scity,szip,gisacres,parusedesc,struct,landval,parval,sourcedate',
    id_field: 'parno', county_field: 'cntyname', order_field: 'objectid', page_cap: 5000, map: mapNorthCarolina,
    note: 'NC OneMap statewide parcels, feature service layer 1. gisacres is frequently reported as 0, so geometry_acres_approx is computed for every parcel. Owner-name fields exist on the layer and are not requested.',
  },
  WI: {
    state_name: 'Wisconsin', url: 'https://dnrmaps.wi.gov/arcgis/rest/services/DW_Map_Dynamic/EN_County_Tax_Parcels_WTM_Ext_Dynamic_L16/MapServer/0/query',
    out_fields: 'OBJECTID,PARCELID,STATEID,SITEADRESS,PLACENAME,ZIPCODE,GISACRES,DEEDACRES,PROPCLASS,IMPROVED,CNTASSDVALUE,LNDVALUE,IMPVALUE,CONAME,PARCELFIPS,LOADDATE',
    id_field: 'PARCELID', county_field: 'CONAME', order_field: 'OBJECTID', page_cap: 1000, map: mapWisconsin,
    note: 'Wisconsin DOA statewide parcel map database served by WDNR, map service layer 0. PROPCLASS is coded and may be combined (for example "1,4"). Owner-name fields exist on the layer and are not requested.',
  },
};

// GeoJSON ring winding is the opposite of Esri's: outer rings clockwise, holes counter-clockwise.
const signedRingArea = (ring) => { let s = 0; for (let i = 0, n = ring.length; i < n; i++) { const j = (i + 1) % n; s += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]; } return s / 2; };
function esriRingsFromGeoJson(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const rings = [];
  for (const poly of polys) poly.forEach((ring, i) => { const r = ring.slice(); const area = signedRingArea(r); if (i === 0 ? area > 0 : area < 0) r.reverse(); rings.push(r); });
  return rings;
}
function geoJsonFromEsriRings(rings) {
  const polys = [];
  for (const ring of rings) {
    if (signedRingArea(ring) <= 0 || !polys.length) polys.push([ring]);
    else polys[polys.length - 1].push(ring);
  }
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
// Both output formats reduced to GeoJSON features. f=geojson is the request; f=json is the fallback.
function featuresFromResponse(json) {
  if (Array.isArray(json.features) && json.features.length && json.features[0].attributes !== undefined) {
    return json.features.map((f) => ({ type: 'Feature', properties: f.attributes ?? {}, geometry: f.geometry?.rings ? geoJsonFromEsriRings(f.geometry.rings) : null }));
  }
  return json.features ?? [];
}
function geometryVertices(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const poly of polys) for (const ring of poly) for (const c of ring) out.push(c);
  return out;
}
// Equirectangular projection at the polygon's own latitude, shoelace, square metres to acres. Holes subtract.
function geometryAcres(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let latSum = 0, latCount = 0;
  for (const poly of polys) for (const c of poly[0]) { latSum += c[1]; latCount++; }
  if (!latCount) return 0;
  const kx = Math.cos((latSum / latCount) * Math.PI / 180) * EARTH_RADIUS_M * Math.PI / 180, ky = EARTH_RADIUS_M * Math.PI / 180;
  let squareMetres = 0;
  for (const poly of polys) poly.forEach((ring, ri) => {
    let s = 0;
    for (let i = 0, n = ring.length; i < n; i++) { const j = (i + 1) % n; s += (ring[i][0] * kx) * (ring[j][1] * ky) - (ring[j][0] * kx) * (ring[i][1] * ky); }
    squareMetres += (ri === 0 ? 1 : -1) * Math.abs(s / 2);
  });
  return squareMetres / SQUARE_METRES_PER_ACRE;
}
// Point in polygon for one fixed polygon tested millions of times: turf rescans every ring per call, which is too slow
// for hundreds of thousands of parcel vertices. Same even-odd rule and same boundary-counts-as-inside behaviour,
// with the edges bucketed into horizontal bands so a test only looks at the edges that can cross its own latitude.
// runParcels cross-checks this index against turf on a sample of real parcels and records the agreement.
function buildPolygonIndex(feature) {
  const geometry = feature?.geometry ?? feature;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const ax = [], ay = [], bx = [], by = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const j = (i + 1) % n;
      if (ring[i][0] === ring[j][0] && ring[i][1] === ring[j][1]) continue;
      ax.push(ring[i][0]); ay.push(ring[i][1]); bx.push(ring[j][0]); by.push(ring[j][1]);
      if (ring[i][0] < minX) minX = ring[i][0];
      if (ring[i][0] > maxX) maxX = ring[i][0];
      if (ring[i][1] < minY) minY = ring[i][1];
      if (ring[i][1] > maxY) maxY = ring[i][1];
    }
  }
  const edges = ax.length;
  if (!edges) throw new Error('Polygon has no usable edges.');
  const bands = Math.min(2048, Math.max(8, Math.ceil(edges / 8)));
  const span = maxY - minY || 1e-12;
  const bucket = Array.from({ length: bands }, () => []);
  const bandOf = (y) => Math.min(bands - 1, Math.max(0, Math.floor((y - minY) / span * bands)));
  for (let e = 0; e < edges; e++) {
    const lo = bandOf(Math.min(ay[e], by[e])), hi = bandOf(Math.max(ay[e], by[e]));
    for (let b = lo; b <= hi; b++) bucket[b].push(e);
  }
  const EPS = 1e-12;
  return {
    edges, bands, bbox: [minX, minY, maxX, maxY],
    contains(px, py) {
      if (px < minX || px > maxX || py < minY || py > maxY) return false;
      const list = bucket[bandOf(py)];
      let inside = false;
      for (let k = 0; k < list.length; k++) {
        const e = list[k], x1 = ax[e], y1 = ay[e], x2 = bx[e], y2 = by[e];
        // On the edge counts as inside, matching turf's default ignoreBoundary = false.
        if (px >= Math.min(x1, x2) - EPS && px <= Math.max(x1, x2) + EPS && py >= Math.min(y1, y2) - EPS && py <= Math.max(y1, y2) + EPS
          && Math.abs((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) <= EPS) return true;
        if ((y1 > py) !== (y2 > py) && px < x1 + (py - y1) * (x2 - x1) / (y2 - y1)) inside = !inside;
      }
      return inside;
    },
  };
}

// One cached ArcGIS request with a receipt beside the body. Reused on rerun when the receipt matches the body and the parameters.
async function cachedQuery(url, params, file, method = 'POST') {
  const paramsHash = sha256(Buffer.from(JSON.stringify(params)));
  const receiptPath = file + '.receipt.json';
  try {
    const buf = await fs.readFile(file);
    const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
    if (receipt.params_sha256 === paramsHash && receipt.sha256 === sha256(buf)) return { json: JSON.parse(buf.toString('utf8')), receipt, cached: true };
  } catch {}
  const body = new URLSearchParams(params);
  let buf = null, lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = method === 'GET'
        ? await fetch(`${url}?${body}`, { signal: AbortSignal.timeout(180000) })
        : await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buf = Buffer.from(await response.arrayBuffer());
      break;
    } catch (error) { lastError = error; buf = null; if (attempt < 4) await pause(1000 * attempt * attempt); }
  }
  if (!buf) throw new Error(`${url}: ${lastError?.message ?? lastError}`);
  let json;
  try { json = JSON.parse(buf.toString('utf8')); } catch { throw new Error(`${url}: reply was not JSON (${buf.length} bytes, starts "${buf.toString('utf8', 0, 80)}").`); }
  const redacted = { ...params };
  if (redacted.geometry) redacted.geometry = `<Esri polygon, ${redacted.geometry.length} characters>`;
  const receipt = { url, method, params: redacted, params_sha256: paramsHash, sha256: sha256(buf), bytes: buf.length, fetched_utc: new Date().toISOString() };
  await fs.writeFile(file, buf);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  return { json, receipt, cached: false };
}

function parcelVerdict(row) {
  if (row.oz_containment === 'edge_only') return 'N';
  if (row.oz_containment === 'partial') return 'CHECK';
  if (row.eb5_point_class === 'not_checked') return 'tract_only';
  if (row.eb5_point_class === 'not_rural_place') return 'N';
  if (row.eb5_point_class === 'rural_clear') return 'Y';
  return 'CHECK';
}

const PARCEL_COLUMNS = ['state', 'geoid_2010', 'tract_county_name', 'cbsa_type', 'cbsa_title', 'parcel_id', 'alt_parcel_id', 'source_object_id', 'parcel_county',
  'situs_address', 'city', 'zip', 'source_acres', 'source_acres_field', 'source_acres_alt', 'source_acres_alt_field', 'geometry_acres_approx', 'acres_used', 'acres_basis',
  'land_use_raw', 'land_use_note', 'improved_flag_raw', 'land_value', 'building_value', 'total_value', 'assessment_vintage', 'county_fips_source',
  'developable_flag', 'developable_reason', 'oz_containment', 'parcel_vertices', 'vertices_outside_oz', 'interior_lat', 'interior_lon', 'geometry_note',
  'eb5_point_class', 'place_name', 'place_pop_2020', 'place_kind', 'eb5_point_basis', 'oz_and_eb5_rural', 'tract_reconciliation', 'source_url', 'source_page'];
const TRACT_COLUMNS = ['geoid_2010', 'county_name', 'cbsa_type', 'cbsa_title', 'server_count', 'fetched_count', 'pages', 'reconciliation',
  'whole_parcel_in_oz', 'partial', 'edge_only', 'developable', 'point_checked', 'verdict_Y', 'verdict_CHECK', 'verdict_N', 'notes'];

async function runParcels(stateCode, outDir) {
  const service = PARCEL_SERVICES[stateCode];
  if (!service) throw new Error(`Unknown parcel state "${stateCode}". Supported: ${Object.keys(PARCEL_SERVICES).join(', ')}.`);
  const started = new Date().toISOString();
  const tractsCsvPath = path.join(outDir, 'oz-eb5-tracts.csv');
  let tractBuf;
  try { tractBuf = await fs.readFile(tractsCsvPath); }
  catch { throw new Error(`${tractsCsvPath} not found. Build the tract table first: node scripts/oz-eb5-screen.mjs tracts ${outDir}`); }
  const tractTable = parseCsv(tractBuf.toString('utf8'));
  const header = tractTable[0];
  const col = (name) => { const i = header.indexOf(name); if (i < 0) throw new Error(`Tract table lacks column ${name}.`); return i; };
  const iGeoid = col('geoid_2010'), iState = col('state'), iCounty = col('county_name'), iClass = col('eb5_rural_class'), iType = col('cbsa_type'), iTitle = col('cbsa_title'), iAlias = col('geoid_2010_geometry_alias');
  const tracts = tractTable.slice(1)
    .filter((r) => r[iClass] === 'rural_clear' && r[iState] === service.state_name)
    .map((r) => ({ geoid_2010: r[iGeoid], county_name: r[iCounty], cbsa_type: r[iType], cbsa_title: r[iTitle], geometry_id: r[iAlias] || r[iGeoid] }));
  if (!tracts.length) throw new Error(`No rural_clear designated tracts for ${service.state_name} in ${tractsCsvPath}.`);
  // The MSA leg of the EB-5 rural test is carried on the tract row: rural_clear means the county is outside every 2023
  // OMB metropolitan area, so the point check below only has to answer the 20,000 city-or-town question. Assert it.
  const metropolitan = tracts.filter((t) => t.cbsa_type === 'metropolitan');
  if (metropolitan.length) throw new Error(`Tract table is inconsistent: rural_clear rows must never be metropolitan, but ${metropolitan.map((t) => t.geoid_2010).join(', ')} are.`);
  const pageDir = path.join(outDir, 'raw', 'parcels', stateCode);
  await fs.mkdir(pageDir, { recursive: true });
  process.stdout.write(`${stateCode} ${service.state_name}: ${tracts.length} rural_clear designated tracts from ${tractsCsvPath}\nParcel service ${service.url} (page cap ${service.page_cap}); owner-name fields are not requested.\n`);

  const parcels = [], tractRows = [];
  // Independent check of the banded point-in-polygon index against turf, on every vertex of the first 40 real parcels.
  const crosscheck = { tract: '', hud_polygon_edges: 0, bands: 0, parcels_compared: 0, points_tested: 0, disagreements: 0 };
  for (const tract of tracts) {
    const summary = { geoid_2010: tract.geoid_2010, county_name: tract.county_name, cbsa_type: tract.cbsa_type, cbsa_title: tract.cbsa_title,
      server_count: '', fetched_count: 0, pages: 0, reconciliation: '', whole_parcel_in_oz: 0, partial: 0, edge_only: 0, developable: 0, point_checked: 0, verdict_Y: 0, verdict_CHECK: 0, verdict_N: 0, notes: '' };
    tractRows.push(summary);
    const hudParams = { where: `GEOID10='${tract.geometry_id}'`, outFields: 'GEOID10', returnGeometry: 'true', outSR: '4326', f: 'geojson' };
    const hud = await cachedQuery(HUD_OZ, hudParams, path.join(pageDir, `${tract.geoid_2010}-hud.json`), 'GET');
    if (!hud.cached) await pause(PAUSE_MS);
    const hudFeature = hud.json.features?.[0];
    if (!hudFeature?.geometry) {
      summary.reconciliation = 'no_hud_polygon';
      summary.notes = `HUD layer returned no designated polygon for GEOID10 ${tract.geometry_id}; no parcels fetched.`;
      process.stdout.write(`${tract.geoid_2010} NO HUD POLYGON - skipped\n`);
      continue;
    }
    const hudIndex = buildPolygonIndex(hudFeature);
    const esriGeometry = JSON.stringify({ rings: esriRingsFromGeoJson(hudFeature.geometry), spatialReference: { wkid: 4326 } });
    const spatial = { geometry: esriGeometry, geometryType: 'esriGeometryPolygon', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };

    const countReply = await cachedQuery(service.url, { ...spatial, returnCountOnly: 'true', f: 'json' }, path.join(pageDir, `${tract.geoid_2010}-count.json`));
    if (!countReply.cached) await pause(PAUSE_MS);
    if (countReply.json.error) throw new Error(`${service.url} count query: ${JSON.stringify(countReply.json.error)}`);
    const serverCount = countReply.json.count ?? countReply.json.properties?.count;
    summary.server_count = typeof serverCount === 'number' ? serverCount : '';
    if (summary.server_count === '') summary.notes += `Count query returned no count field (${JSON.stringify(countReply.json).slice(0, 160)}). `;

    const tractParcels = [];
    // Keyset paging on the object ID. resultOffset paging returned overlapping pages on the NC and WI services even with
    // orderByFields set (NC Ashe: 9,512 rows for a server count of 4,974), so each page asks for IDs above the last one seen,
    // duplicates are dropped by ID, and paging stops when a page adds nothing new.
    const seenOids = new Set();
    let lastOid = null, page = 0, duplicates = 0;
    for (; page < 500; page++) {
      const where = lastOid === null ? '1=1' : `${service.order_field} > ${lastOid}`;
      const params = { ...spatial, where, outFields: service.out_fields, returnGeometry: 'true', outSR: '4326', orderByFields: `${service.order_field} ASC`, resultRecordCount: String(service.page_cap), f: 'geojson' };
      const file = path.join(pageDir, `${tract.geoid_2010}-page${page + 1}.json`);
      let reply = await cachedQuery(service.url, params, file);
      if (reply.json.error) {
        const fallback = { ...params, f: 'json' };
        summary.notes += `page ${page + 1}: f=geojson rejected (${JSON.stringify(reply.json.error)}), retried with f=json. `;
        reply = await cachedQuery(service.url, fallback, file);
        if (reply.json.error) throw new Error(`${service.url} page ${page + 1} for ${tract.geoid_2010}: ${JSON.stringify(reply.json.error)}`);
      }
      if (!reply.cached) await pause(PAUSE_MS);
      const allFeatures = featuresFromResponse(reply.json);
      const features = [];
      for (const feature of allFeatures) {
        const oid = Number(feature.properties?.[service.order_field]);
        if (!Number.isFinite(oid)) throw new Error(`${service.url} page ${page + 1} for ${tract.geoid_2010}: feature without numeric ${service.order_field}; keyset paging needs it.`);
        if (seenOids.has(oid)) { duplicates++; continue; }
        seenOids.add(oid);
        if (lastOid === null || oid > lastOid) lastOid = oid;
        features.push(feature);
      }
      if (features.length === 0) { summary.pages = page + 1; break; }
      for (const feature of features) {
        if (!feature.geometry) { summary.notes += `${textOf(feature.properties?.[service.id_field])} returned without geometry. `; continue; }
        const mapped = service.map(feature.properties ?? {});
        const vertices = geometryVertices(feature.geometry);
        let outside = 0;
        for (const v of vertices) if (!hudIndex.contains(v[0], v[1])) outside++;
        if (crosscheck.parcels_compared < 40 && (crosscheck.tract === '' || crosscheck.tract === tract.geoid_2010)) {
          crosscheck.tract = tract.geoid_2010; crosscheck.hud_polygon_edges = hudIndex.edges; crosscheck.bands = hudIndex.bands;
          for (const v of vertices) { if (hudIndex.contains(v[0], v[1]) !== pointInPolygon({ type: 'Point', coordinates: v }, hudFeature)) crosscheck.disagreements++; crosscheck.points_tested++; }
          crosscheck.parcels_compared++;
        }
        const interior = interiorPointOfFeature(feature);
        const interiorInside = interior ? hudIndex.contains(interior.lon, interior.lat) : false;
        const containment = outside === 0 ? 'whole_parcel_in_oz' : interiorInside ? 'partial' : 'edge_only';
        const approx = +geometryAcres(feature.geometry).toFixed(4);
        const sourceAcres = mapped.source_acres;
        const usable = typeof sourceAcres === 'number' && sourceAcres > 0;
        const row = {
          state: stateCode, geoid_2010: tract.geoid_2010, tract_county_name: tract.county_name, cbsa_type: tract.cbsa_type, cbsa_title: tract.cbsa_title,
          county_fips_source: '', ...mapped,
          geometry_acres_approx: approx, acres_used: usable ? sourceAcres : approx, acres_basis: usable ? `source field ${mapped.source_acres_field}` : 'geometry_acres_approx (source acreage 0 or absent)',
          oz_containment: containment, parcel_vertices: vertices.length, vertices_outside_oz: outside,
          interior_lat: interior ? +interior.lat.toFixed(7) : '', interior_lon: interior ? +interior.lon.toFixed(7) : '',
          geometry_note: interior ? '' : 'bbox mid-line scan found no interior point; containment decided on vertices alone',
          eb5_point_class: 'not_checked', place_name: '', place_pop_2020: '', place_kind: '',
          eb5_point_basis: `not point-checked; tract ${tract.geoid_2010} is rural_clear in the tract table (county outside every 2023 OMB metropolitan area)`,
          oz_and_eb5_rural: '', tract_reconciliation: '', source_url: service.url, source_page: page + 1,
        };
        tractParcels.push(row);
        summary[containment]++;
        if (row.developable_flag === 'Y') summary.developable++;
      }
      summary.pages = page + 1;
      summary.fetched_count += features.length;
    }
    if (page >= 500) summary.notes += 'Page guard of 500 reached. ';
    if (duplicates) summary.notes += `${duplicates} duplicate object IDs returned across pages were dropped. `;
    summary.reconciliation = summary.server_count === summary.fetched_count ? 'complete' : 'incomplete';
    if (summary.reconciliation === 'incomplete') summary.notes += `Server reported ${summary.server_count} intersecting parcels, ${summary.fetched_count} unique fetched. Rows kept. `;

    // One geocoder call per selected parcel: developable, wholly inside, 1 to 200 acres first, largest first, capped.
    const inBand = (r) => Number(r.acres_used) >= PARCEL_ACRE_BAND[0] && Number(r.acres_used) <= PARCEL_ACRE_BAND[1];
    const selected = tractParcels.filter((r) => r.developable_flag === 'Y' && r.oz_containment === 'whole_parcel_in_oz')
      .sort((a, b) => (inBand(b) ? 1 : 0) - (inBand(a) ? 1 : 0) || (Number(b.acres_used) || 0) - (Number(a.acres_used) || 0))
      .slice(0, PARCEL_POINT_CAP);
    for (const row of selected) {
      if (row.interior_lat === '' || row.interior_lon === '') { row.eb5_point_class = 'unknown'; row.eb5_point_basis = 'no interior point available for the geocoder call'; continue; }
      try {
        const g2020 = await geocodePoint(Number(row.interior_lon), Number(row.interior_lat), 'Census2020_Current');
        const place = pick(g2020, 'Incorporated Places'), cdp = pick(g2020, 'Census Designated Places'), cousub = pick(g2020, 'County Subdivisions');
        if (place) { row.place_name = place.NAME; row.place_pop_2020 = numOrBlank(place.POP100); row.place_kind = 'incorporated'; }
        else if (cdp) { row.place_name = cdp.NAME; row.place_pop_2020 = numOrBlank(cdp.POP100); row.place_kind = 'cdp'; }
        else row.place_kind = 'none';
        const pop = row.place_pop_2020 === '' ? null : Number(row.place_pop_2020);
        const townPopRaw = numOrBlank(cousub?.POP100);
        const townPop = townPopRaw === '' ? null : Number(townPopRaw);
        const inNewEngland = NEW_ENGLAND.has(tract.geoid_2010.slice(0, 2));
        // A place or town with no reported 2020 population must never fall through to rural_clear: the 20,000 test
        // was not answered, so the class is unknown and parcelVerdict turns that into CHECK.
        if (row.place_kind !== 'none' && pop === null) {
          row.eb5_point_class = 'unknown';
          row.eb5_point_basis = `place population not returned by the geocoder: Census2020 at the parcel interior point returned ${row.place_name || 'a place'} with no POP100, so the 20,000 city-or-town test was not performed`;
        } else if (inNewEngland && cousub && townPop === null) {
          row.eb5_point_class = 'unknown';
          row.eb5_point_basis = `town population not returned by the geocoder: Census2020 at the parcel interior point returned New England town ${textOf(cousub.NAME) || '(unnamed)'} with no POP100, so the 20,000 town test was not performed`;
        } else {
          if (row.place_kind === 'incorporated' && pop >= POP_THRESHOLD) row.eb5_point_class = 'not_rural_place';
          else if (row.place_kind === 'cdp' && pop >= POP_THRESHOLD) row.eb5_point_class = 'rural_interpretation_dependent';
          else if (inNewEngland && townPop !== null && townPop >= POP_THRESHOLD) row.eb5_point_class = 'rural_interpretation_dependent';
          else row.eb5_point_class = 'rural_clear';
          row.eb5_point_basis = 'geocoder Census2020 at parcel interior point; MSA from OMB 2023 by county';
        }
        summary.point_checked++;
      } catch (error) {
        row.eb5_point_class = 'unknown';
        row.eb5_point_basis = `geocoder Census2020 at parcel interior point failed: ${error.message}`;
      }
      await pause(PAUSE_MS);
    }
    for (const row of tractParcels) {
      row.oz_and_eb5_rural = parcelVerdict(row);
      row.tract_reconciliation = summary.reconciliation;
      if (row.oz_and_eb5_rural === 'Y') summary.verdict_Y++;
      else if (row.oz_and_eb5_rural === 'CHECK') summary.verdict_CHECK++;
      else if (row.oz_and_eb5_rural === 'N') summary.verdict_N++;
    }
    for (const row of tractParcels) parcels.push(row);
    process.stdout.write(`${tract.geoid_2010} ${tract.county_name}: server ${summary.server_count} fetched ${summary.fetched_count} (${summary.pages} pages, ${summary.reconciliation}) whole ${summary.whole_parcel_in_oz} partial ${summary.partial} edge ${summary.edge_only} developable ${summary.developable} checked ${summary.point_checked} Y ${summary.verdict_Y}\n`);
  }

  const totals = {
    tracts: tractRows.length, server_parcels: tractRows.reduce((s, t) => s + (Number(t.server_count) || 0), 0), fetched_parcels: parcels.length,
    tracts_incomplete: tractRows.filter((t) => t.reconciliation !== 'complete').length,
    whole_parcel_in_oz: parcels.filter((p) => p.oz_containment === 'whole_parcel_in_oz').length,
    partial: parcels.filter((p) => p.oz_containment === 'partial').length,
    edge_only: parcels.filter((p) => p.oz_containment === 'edge_only').length,
    developable: parcels.filter((p) => p.developable_flag === 'Y').length,
    point_checked: parcels.filter((p) => p.eb5_point_class !== 'not_checked').length,
    Y: parcels.filter((p) => p.oz_and_eb5_rural === 'Y').length,
    CHECK: parcels.filter((p) => p.oz_and_eb5_rural === 'CHECK').length,
    N: parcels.filter((p) => p.oz_and_eb5_rural === 'N').length,
    tract_only: parcels.filter((p) => p.oz_and_eb5_rural === 'tract_only').length,
  };
  const sourceRows = [['Key', 'Role', 'URL', 'Detail', 'Fetched (UTC)'],
    ['parcels', `${service.state_name} cadastral parcels (authority for parcel geometry and attributes)`, service.url, `outFields ${service.out_fields}; page cap ${service.page_cap}; POST form body with the tract polygon as Esri JSON; no owner-name field requested; ${service.note}`, started],
    ['hud', 'Designated 2010 Opportunity Zone polygons', HUD_OZ, "where GEOID10='<tract>', returnGeometry true, outSR 4326, f=geojson", started],
    ['geocoder', 'EB-5 place test at each selected parcel interior point', GEOCODER + 'coordinates', `benchmark ${BENCHMARK}, vintage Census2020_Current, layers=all; Incorporated Places, Census Designated Places and County Subdivisions with POP100`, started],
    ['tracts', 'rural_clear designated tract list', path.resolve(tractsCsvPath), `${tracts.length} rural_clear tracts for ${service.state_name}; file SHA-256 ${sha256(tractBuf)}`, started],
    ['omb', 'MSA leg of the EB-5 rural test', 'OMB Bulletin 23-01 by county, carried on the tract row (cbsa_type)', 'No rural_clear tract is metropolitan, so the MSA leg passes for every parcel here', started]];
  await fs.mkdir(outDir, { recursive: true });
  const base = `${stateCode}-oz-eb5-parcels`;
  const csvPath = path.join(outDir, `${base}.csv`), xlsxPath = path.join(outDir, `${base}.xlsx`);
  const parcelRows = objectsToRows(parcels, PARCEL_COLUMNS);
  const csvBuf = toCsvBuffer(parcelRows);
  await fs.writeFile(csvPath, csvBuf);
  const xlsxBuf = writeXlsx([{ name: 'Parcels', rows: parcelRows }, { name: 'Tracts', rows: objectsToRows(tractRows, TRACT_COLUMNS) }, { name: 'Sources', rows: sourceRows }]);
  await fs.writeFile(xlsxPath, xlsxBuf);
  const manifest = {
    mode: 'parcels', state: stateCode, state_name: service.state_name, started_utc: started, finished_utc: new Date().toISOString(),
    script_sha256: SCRIPT_SHA256,
    tract_source: { file: path.resolve(tractsCsvPath), sha256: sha256(tractBuf), rural_clear_tracts: tracts.length },
    parcel_service: { url: service.url, out_fields: service.out_fields, id_field: service.id_field, county_field: service.county_field, page_cap: service.page_cap, owner_name_fields_requested: false, note: service.note },
    hud_service: HUD_OZ, geocoder: GEOCODER + 'coordinates',
    point_check_cap_per_tract: PARCEL_POINT_CAP, point_check_acre_band: PARCEL_ACRE_BAND,
    point_in_polygon_crosscheck: crosscheck, totals, tracts: tractRows,
    outputs: { csv: { file: path.basename(csvPath), sha256: sha256(csvBuf), rows: parcels.length }, xlsx: { file: path.basename(xlsxPath), sha256: sha256(xlsxBuf) } },
    rule: 'A parcel is Y only when every vertex falls inside the designated 2010 HUD polygon and the Census2020 geocoder at its interior point reports no city or town of 20,000 or more. The tract table already establishes that the county is outside every 2023 OMB metropolitan area. Point-checked parcels are a capped sample per tract, not the whole tract.',
  };
  await fs.writeFile(path.join(outDir, `${base}.manifest.json`), JSON.stringify(manifest, null, 2));
  process.stdout.write(`${JSON.stringify(totals)}\nWrote ${csvPath}, ${xlsxPath}, ${base}.manifest.json\n`);
}

// ---------- assets mode: existing subsidized multifamily joined to the tract table by 2010 tract ID ----------
// Owner and management-agent identity fields exist on every one of these layers (MGMT_AGENT_NAME, MGMT_AGENT_PH_NBR,
// MGMT_AGENT_EMAIL, MGMT_CONTACT_*, PROPERTY_ON_SITE_PHONE_NUMBER, and CONTACT/COMPANY/CO_TEL on LIHTC). None of them
// is requested, so none is cached in raw/assets/ or written to an output. ASSET_FIELD_BAN enforces that at startup.
const ASSETS_AS_OF_YEAR = 2026;
const ASSET_HORIZON_YEAR = 2030;
const ASSET_FIELD_BAN = /owner|agent|phone|email|contact|tel$/i;
const MONTH_ABBR = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
// HUD serves EXPIRATION_DATE1/2 as "31-DEC-29" (DD-MON-YY). A two-digit year below 70 is this century.
function dmyYear(value) {
  const parts = textOf(value).toUpperCase().split('-');
  if (parts.length !== 3 || !(parts[1] in MONTH_ABBR) || !/^\d{1,2}$/.test(parts[2])) return '';
  const yy = Number(parts[2]);
  return yy < 70 ? 2000 + yy : 1900 + yy;
}
// USDA serves EFFECTIVE_DATE and RESTRICTIVE_CLAUSE_EXPIRATION as "20070605" (YYYYMMDD strings).
function ymdYear(value) {
  const s = textOf(value);
  if (!/^\d{4}(\d{4})?$/.test(s)) return '';
  const year = Number(s.slice(0, 4));
  // The LIHTC year fields carry 8888 and 9999 sentinels; a year outside a plausible range is not a date.
  return year >= 1900 && year <= 2200 ? year : '';
}
// LOAN_MATURITY_DATE is an Esri date field: epoch milliseconds.
function epochYear(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const year = new Date(n).getUTCFullYear();
  return Number.isFinite(year) ? year : '';
}
// Computed against ASSETS_AS_OF_YEAR: a contract or restriction whose year has already arrived is treated as
// expired, because the run happens inside that year. "none" means the source carried no parseable date at all,
// which is a gap in the source, not a statement that the property is unrestricted.
function expirationStatus(year) {
  if (year === '' || year === null || year === undefined) return 'none';
  if (year <= ASSETS_AS_OF_YEAR) return 'expired';
  if (year <= ASSET_HORIZON_YEAR) return `expires_by_${ASSET_HORIZON_YEAR}`;
  return 'later';
}

function mapHudAssisted(p) {
  const year1 = dmyYear(p.EXPIRATION_DATE1);
  return {
    source_property_id: textOf(p.PROPERTY_ID), property_name: textOf(p.PROPERTY_NAME_TEXT), address: textOf(p.ADDRESS_LINE1_TEXT),
    city: textOf(p.STD_CITY), state_abbr: textOf(p.STD_ST), zip: textOf(p.STD_ZIP5),
    latitude: numOrBlank(p.LAT), longitude: numOrBlank(p.LON),
    total_units: numOrBlank(p.TOTAL_UNIT_COUNT), assisted_units: numOrBlank(p.TOTAL_ASSISTED_UNIT_COUNT),
    program_or_designation: textOf(p.PROGRAM_TYPE1), program_2: textOf(p.PROGRAM_TYPE2),
    contract_or_restriction_expiration_raw: textOf(p.EXPIRATION_DATE1), contract_or_restriction_expiration_year: year1,
    expiration_status: expirationStatus(year1), second_expiration_raw: textOf(p.EXPIRATION_DATE2),
    loan_maturity_year: epochYear(p.LOAN_MATURITY_DATE), effective_year: '',
  };
}
function mapUsdaRural(p) {
  const expYear = ymdYear(p.RESTRICTIVE_CLAUSE_EXPIRATION);
  return {
    // The layer exposes no stable project identifier other than its object ID, so that is what the row carries.
    source_property_id: textOf(p.OBJECTID), property_name: textOf(p.PROJECT_NAME),
    address: textOf(p.STD_ADDR) || textOf(p.PRJ_ADDRESS_LINE1),
    city: textOf(p.STD_CITY), state_abbr: textOf(p.STD_ST), zip: textOf(p.STD_ZIP5),
    latitude: numOrBlank(p.LAT), longitude: numOrBlank(p.LON),
    total_units: numOrBlank(p.TOTAL_UNITS), assisted_units: numOrBlank(p.RA_UNITS),
    program_or_designation: textOf(p.RENTAL_DESIGNATION), program_2: '',
    contract_or_restriction_expiration_raw: textOf(p.RESTRICTIVE_CLAUSE_EXPIRATION), contract_or_restriction_expiration_year: expYear,
    expiration_status: expirationStatus(expYear), second_expiration_raw: '',
    loan_maturity_year: '', effective_year: ymdYear(p.EFFECTIVE_DATE),
  };
}
function mapHudLihtc(p) {
  // This layer carries no contract or use-restriction expiration date at all, so the expiration columns stay empty
  // and expiration_status reads "none". A 30-year compliance period inferred from YR_PIS would be a calculation,
  // not a source fact, and is deliberately not written here.
  return {
    source_property_id: textOf(p.HUD_ID), property_name: textOf(p.PROJECT),
    address: textOf(p.STD_ADDR) || textOf(p.PROJ_ADD),
    city: textOf(p.STD_CITY) || textOf(p.PROJ_CTY), state_abbr: textOf(p.STD_ST) || textOf(p.PROJ_ST), zip: textOf(p.STD_ZIP5) || textOf(p.PROJ_ZIP),
    latitude: numOrBlank(p.LAT), longitude: numOrBlank(p.LON),
    total_units: numOrBlank(p.N_UNITSR) === '' ? numOrBlank(p.N_UNITS) : numOrBlank(p.N_UNITSR),
    assisted_units: numOrBlank(p.LI_UNITR) === '' ? numOrBlank(p.LI_UNITS) : numOrBlank(p.LI_UNITR),
    program_or_designation: 'LIHTC', program_2: '',
    contract_or_restriction_expiration_raw: '', contract_or_restriction_expiration_year: '',
    expiration_status: expirationStatus(''), second_expiration_raw: '',
    loan_maturity_year: '', effective_year: ymdYear(p.YR_PIS),
  };
}

const ASSET_ORG = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services';
const ASSET_SOURCES = {
  hud_assisted: {
    key: 'hud_assisted', label: 'HUD-assisted multifamily properties', layer: `${ASSET_ORG}/MULTIFAMILY_PROPERTIES_ASSISTED/FeatureServer/0`,
    out_fields: 'OBJECTID,PROPERTY_ID,PROPERTY_NAME_TEXT,ADDRESS_LINE1_TEXT,STD_CITY,STD_ST,STD_ZIP5,STATE2KX,CNTY2KX,TRACT2KX,CNTY_NM2KX,TRACT_LEVEL,TOTAL_UNIT_COUNT,TOTAL_ASSISTED_UNIT_COUNT,PROGRAM_TYPE1,PROGRAM_TYPE2,EXPIRATION_DATE1,EXPIRATION_DATE2,LOAN_MATURITY_DATE,LAT,LON',
    page_cap: 2000, map: mapHudAssisted, unit_of_row: 'property',
    assisted_units_basis: 'TOTAL_ASSISTED_UNIT_COUNT: units under an active HUD assistance contract at the property',
    note: 'HUD Multifamily Properties - Assisted, anonymous FeatureServer layer 0, 23,783 points, maxRecordCount 2,000. EXPIRATION_DATE1/2 are DD-MON-YY strings; LOAN_MATURITY_DATE is epoch milliseconds. Management-agent name, address, phone and email fields exist on the layer and are not requested.',
  },
  usda_rural: {
    key: 'usda_rural', label: 'USDA rural housing assets (Section 515 family)', layer: `${ASSET_ORG}/USDA_Rural_Housing_Assets/FeatureServer/0`,
    out_fields: 'OBJECTID,PROJECT_NAME,PRJ_ADDRESS_LINE1,STD_ADDR,STD_CITY,STD_ST,STD_ZIP5,STATE2KX,CNTY2KX,TRACT2KX,CNTY_NM2KX,TRACT_LEVEL,EFFECTIVE_DATE,RESTRICTIVE_CLAUSE_EXPIRATION,HUD_UNITS,RA_UNITS,TOTAL_UNITS,RENTAL_DESIGNATION,LAT,LON',
    page_cap: 16000, map: mapUsdaRural, unit_of_row: 'property',
    assisted_units_basis: 'RA_UNITS: units carrying USDA rental assistance at the project',
    note: 'USDA Rural Housing Assets, anonymous FeatureServer layer 0, 13,262 points, maxRecordCount 16,000. EFFECTIVE_DATE and RESTRICTIVE_CLAUSE_EXPIRATION are YYYYMMDD strings. MGMT_AGENT_NAME, MGMT_AGENT_PH_NBR and MGMT_AGENT_EMAIL exist on the layer and are not requested.',
  },
  hud_lihtc: {
    key: 'hud_lihtc', label: 'HUD LIHTC properties (allocation records)', layer: `${ASSET_ORG}/LIHTC/FeatureServer/0`,
    out_fields: 'OBJECTID,HUD_ID,PROJECT,PROJ_ADD,PROJ_CTY,PROJ_ST,PROJ_ZIP,STD_ADDR,STD_CITY,STD_ST,STD_ZIP5,STATE2KX,CNTY2KX,TRACT2KX,CNTY_NM2KX,TRACT_LEVEL,N_UNITS,LI_UNITS,N_UNITSR,LI_UNITR,YR_PIS,LAT,LON',
    page_cap: 2000, map: mapHudLihtc, unit_of_row: 'allocation record',
    assisted_units_basis: 'LI_UNITR where reported, otherwise LI_UNITS: low-income qualifying units on the allocation record',
    note: 'HUD Low-Income Housing Tax Credit properties, anonymous FeatureServer layer 0, maxRecordCount 2,000. Included because its 2010 tract code is unambiguous: the constructed STATE2KX+CNTY2KX+TRACT2KX key equals the layer’s own TRACT_LEVEL field padded to 11 digits on every row carrying a tract. A row is an allocation record, not a property, and the same building can appear more than once; the layer carries no contract or use-restriction expiration, so the expiration columns are empty. CONTACT, COMPANY and CO_TEL exist on the layer and are not requested.',
  },
};
for (const source of Object.values(ASSET_SOURCES)) {
  const banned = source.out_fields.split(',').filter((f) => ASSET_FIELD_BAN.test(f.trim()));
  if (banned.length) throw new Error(`${source.key} outFields requests ${banned.join(', ')}; owner, management-agent, phone and email fields are never requested from a property service.`);
}

const ASSET_COLUMNS = ['source', 'source_property_id', 'property_name', 'address', 'city', 'state_abbr', 'zip', 'latitude', 'longitude',
  'geoid_2010', 'tract_state', 'tract_county_name', 'eb5_rural_class', 'cbsa_type', 'cbsa_title',
  'total_units', 'assisted_units', 'assisted_units_basis', 'program_or_designation', 'program_2',
  'contract_or_restriction_expiration_raw', 'contract_or_restriction_expiration_year', 'expiration_status',
  'second_expiration_raw', 'loan_maturity_year', 'effective_year', 'source_layer', 'source_object_id', 'retrieved_utc'];

// Keyset paging on OBJECTID, the same scheme the parcel mode uses: resultOffset paging returns overlapping windows
// on some services. Every page is cached with a receipt beside it and duplicate object IDs are dropped.
async function fetchAssetSource(source, outDir) {
  const dir = path.join(outDir, 'raw', 'assets', source.key);
  await fs.mkdir(dir, { recursive: true });
  const url = `${source.layer}/query`;
  const receipts = [];
  const countReply = await cachedQuery(url, { where: '1=1', returnCountOnly: 'true', f: 'json' }, path.join(dir, 'count.json'));
  if (!countReply.cached) await pause(PAUSE_MS);
  if (countReply.json.error) throw new Error(`${url} count query: ${JSON.stringify(countReply.json.error)}`);
  const serverCount = typeof countReply.json.count === 'number' ? countReply.json.count : '';
  receipts.push({ file: 'count.json', ...countReply.receipt });
  const seen = new Set(), records = [];
  let last = -1, pages = 0, duplicates = 0;
  for (let page = 0; page < 500; page++) {
    const params = { where: `OBJECTID > ${last}`, outFields: source.out_fields, orderByFields: 'OBJECTID ASC', resultRecordCount: String(source.page_cap), returnGeometry: 'false', f: 'json' };
    const file = path.join(dir, `page${page + 1}.json`);
    const reply = await cachedQuery(url, params, file);
    if (reply.json.error) throw new Error(`${url} page ${page + 1}: ${JSON.stringify(reply.json.error)}`);
    if (!reply.cached) await pause(PAUSE_MS);
    pages = page + 1;
    receipts.push({ file: path.basename(file), ...reply.receipt });
    let added = 0;
    for (const feature of reply.json.features ?? []) {
      const attributes = feature.attributes ?? {};
      const oid = Number(attributes.OBJECTID);
      if (!Number.isFinite(oid)) throw new Error(`${url} page ${page + 1}: feature without a numeric OBJECTID; keyset paging needs it.`);
      if (seen.has(oid)) { duplicates++; continue; }
      seen.add(oid);
      if (oid > last) last = oid;
      records.push({ attributes, retrieved_utc: reply.receipt.fetched_utc, page: page + 1 });
      added++;
    }
    if (added === 0) break;
  }
  const reconciliation = serverCount === '' ? 'no_server_count' : serverCount === records.length ? 'complete' : 'incomplete';
  process.stdout.write(`${source.key}: server ${serverCount} fetched ${records.length} across ${pages} pages (${reconciliation}${duplicates ? `, ${duplicates} duplicate object IDs dropped` : ''})\n`);
  return { records, pages, serverCount, duplicates, receipts, reconciliation };
}

async function runAssets(outDir) {
  const started = new Date().toISOString();
  const tractsCsvPath = path.join(outDir, 'oz-eb5-tracts.csv');
  let tractBuf;
  try { tractBuf = await fs.readFile(tractsCsvPath); }
  catch { throw new Error(`${tractsCsvPath} not found. Build the tract table first: node scripts/oz-eb5-screen.mjs tracts ${outDir}`); }
  const table = parseCsv(tractBuf.toString('utf8'));
  const header = table[0];
  const col = (name) => { const i = header.indexOf(name); if (i < 0) throw new Error(`Tract table lacks column ${name}.`); return i; };
  const iGeoid = col('geoid_2010'), iState = col('state'), iCounty = col('county_name'), iCountyFips = col('county_fips'), iClass = col('eb5_rural_class'), iType = col('cbsa_type'), iTitle = col('cbsa_title');
  const tracts = new Map();
  for (const r of table.slice(1)) tracts.set(r[iGeoid], { geoid_2010: r[iGeoid], state: r[iState], county_name: r[iCounty], county_fips: r[iCountyFips], eb5_rural_class: r[iClass], cbsa_type: r[iType], cbsa_title: r[iTitle] });
  if (!tracts.size) throw new Error(`${tractsCsvPath} has no data rows.`);
  // The property layers carry 2010-vintage geography, so Bedford appears under the retired city code 51515 while
  // the CDFI list carries the county code 51019. Without this the Bedford tract's properties would be dropped.
  const aliasToCdfi = new Map(Object.entries(CDFI_TO_2010_ALIAS).map(([cdfiId, id2010]) => [id2010, cdfiId]));
  const assetGeoid = (p) => {
    const tract = textOf(p.TRACT2KX);
    if (!tract) return '';
    const id = textOf(p.STATE2KX).padStart(2, '0') + textOf(p.CNTY2KX).padStart(3, '0') + tract.replace('.', '').padStart(6, '0');
    return aliasToCdfi.get(id) ?? id;
  };
  process.stdout.write(`Tract table ${tractsCsvPath}: ${tracts.size} designated tracts, ${[...tracts.values()].filter((t) => t.eb5_rural_class === 'rural_clear').length} rural_clear\n`);

  const rows = [], perSource = {}, pageReceipts = {};
  for (const source of Object.values(ASSET_SOURCES)) {
    const fetched = await fetchAssetSource(source, outDir);
    pageReceipts[source.key] = fetched.receipts;
    let withoutTractCode = 0, outsideDesignated = 0, aliasJoins = 0, keyChecked = 0, keyDisagreements = 0;
    const keyDisagreementExamples = [];
    const sourceRows = [];
    for (const record of fetched.records) {
      const p = record.attributes;
      const geoid = assetGeoid(p);
      // These layers carry their own concatenation of the same three fields in TRACT_LEVEL, with leading zeros
      // dropped. Comparing the constructed key against it on every row turns the join key from an assumption
      // into a recorded check. A disagreement is counted and reported, never silently joined or silently dropped.
      const own = textOf(p.TRACT_LEVEL);
      if (own) {
        keyChecked++;
        const raw = textOf(p.STATE2KX).padStart(2, '0') + textOf(p.CNTY2KX).padStart(3, '0') + textOf(p.TRACT2KX).replace('.', '').padStart(6, '0');
        if (pad11(own) !== raw) { keyDisagreements++; if (keyDisagreementExamples.length < 5) keyDisagreementExamples.push({ object_id: textOf(p.OBJECTID), constructed: raw, tract_level: own }); }
      }
      if (!geoid) { withoutTractCode++; continue; }
      const tract = tracts.get(geoid);
      if (!tract) { outsideDesignated++; continue; }
      if (CDFI_TO_2010_ALIAS[geoid] && textOf(p.CNTY2KX).padStart(3, '0') !== geoid.slice(2, 5)) aliasJoins++;
      sourceRows.push({
        source: source.key, ...source.map(p),
        assisted_units_basis: source.assisted_units_basis,
        geoid_2010: tract.geoid_2010, tract_state: tract.state, tract_county_name: tract.county_name,
        eb5_rural_class: tract.eb5_rural_class, cbsa_type: tract.cbsa_type, cbsa_title: tract.cbsa_title,
        source_layer: source.layer, source_object_id: textOf(p.OBJECTID), retrieved_utc: record.retrieved_utc,
        _county_fips: tract.county_fips,
      });
    }
    for (const row of sourceRows) rows.push(row);
    const sum = (list, field) => list.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    const ruralClear = sourceRows.filter((r) => r.eb5_rural_class === 'rural_clear');
    const byClass = {};
    for (const r of sourceRows) byClass[r.eb5_rural_class] = (byClass[r.eb5_rural_class] ?? 0) + 1;
    const statusCounts = {};
    for (const r of ruralClear) statusCounts[r.expiration_status] = (statusCounts[r.expiration_status] ?? 0) + 1;
    const top = (list, keyOf, n) => {
      const tallyMap = new Map();
      for (const r of list) { const k = keyOf(r); tallyMap.set(k, (tallyMap.get(k) ?? 0) + 1); }
      return [...tallyMap.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([k, v]) => ({ key: k, properties: v }));
    };
    perSource[source.key] = {
      label: source.label, layer: source.layer, out_fields: source.out_fields, page_cap: source.page_cap,
      unit_of_row: source.unit_of_row, assisted_units_basis: source.assisted_units_basis, note: source.note,
      owner_or_agent_fields_requested: false,
      pages: fetched.pages, server_count: fetched.serverCount, fetched_count: fetched.records.length,
      duplicate_object_ids_dropped: fetched.duplicates, reconciliation: fetched.reconciliation,
      rows_without_tract_code: withoutTractCode, rows_outside_designated_tracts: outsideDesignated,
      rows_joined_through_bedford_alias: aliasJoins,
      join_key_crosscheck: { field: 'TRACT_LEVEL', rows_compared: keyChecked, disagreements: keyDisagreements, examples: keyDisagreementExamples },
      unique_source_property_ids: new Set(sourceRows.map((r) => r.source_property_id)).size,
      // One physical building can carry more than one row: a second HUD contract, a second USDA loan, or on the
      // LIHTC layer a second allocation year. Counted rather than assumed, so a reader knows not to treat the row
      // count as a building count or to sum units across rows that describe the same property.
      rows_sharing_address_and_tract: (() => {
        const seenAddress = new Map();
        for (const r of sourceRows) { const k = `${textOf(r.address).toUpperCase()}|${r.geoid_2010}`; if (textOf(r.address)) seenAddress.set(k, (seenAddress.get(k) ?? 0) + 1); }
        const repeated = [...seenAddress.values()].filter((n) => n > 1);
        return { distinct_address_and_tract: seenAddress.size, repeated_keys: repeated.length, rows_involved: repeated.reduce((s, n) => s + n, 0) };
      })(),
      in_designated_tracts: { rows: sourceRows.length, units: sum(sourceRows, 'total_units'), assisted_units: sum(sourceRows, 'assisted_units'), by_eb5_rural_class: byClass },
      in_rural_clear_tracts: {
        rows: ruralClear.length, units: sum(ruralClear, 'total_units'), assisted_units: sum(ruralClear, 'assisted_units'),
        expiration_status: statusCounts,
        expired: statusCounts.expired ?? 0,
        [`expiring_by_end_${ASSET_HORIZON_YEAR}`]: (statusCounts.expired ?? 0) + (statusCounts[`expires_by_${ASSET_HORIZON_YEAR}`] ?? 0),
        top_states: top(ruralClear, (r) => r.tract_state, 10),
        top_counties: top(ruralClear, (r) => `${r.tract_state} / ${r.tract_county_name} (${r._county_fips})`, 10),
      },
    };
    process.stdout.write(`${source.key}: ${sourceRows.length} rows in designated tracts, ${ruralClear.length} in rural_clear (${sum(ruralClear, 'total_units')} units, ${sum(ruralClear, 'assisted_units')} assisted), expiration ${JSON.stringify(statusCounts)}\n`);
    process.stdout.write(`${source.key}: join key checked against TRACT_LEVEL on ${keyChecked} rows, ${keyDisagreements} disagreements; ${withoutTractCode} rows carry no 2010 tract code\n`);
  }

  // County roll-up for the Markets layer. Tract mode reads nothing from here; a later step joins this block
  // to oz-eb5-markets.csv on county_fips rather than the assets mode writing into the tract products.
  const byCounty = {};
  for (const row of rows) {
    if (row.eb5_rural_class !== 'rural_clear') continue;
    const fips = row._county_fips;
    byCounty[fips] ??= { county_fips: fips, state: row.tract_state, county_name: row.tract_county_name, cbsa_type: row.cbsa_type, cbsa_title: row.cbsa_title, rural_clear_tracts_with_assets: [], ...Object.fromEntries(Object.keys(ASSET_SOURCES).map((k) => [k, { rows: 0, units: 0, assisted_units: 0 }])) };
    const bucket = byCounty[fips][row.source];
    bucket.rows++; bucket.units += Number(row.total_units) || 0; bucket.assisted_units += Number(row.assisted_units) || 0;
    if (!byCounty[fips].rural_clear_tracts_with_assets.includes(row.geoid_2010)) byCounty[fips].rural_clear_tracts_with_assets.push(row.geoid_2010);
  }
  for (const county of Object.values(byCounty)) county.rural_clear_tracts_with_assets.sort();

  const outRows = rows.map(({ _county_fips, ...r }) => r);
  const ALL_CLASSES = ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'not_rural_msa', 'unknown'];
  const summaryRows = [['Source', 'Rows in designated tracts', 'Rows in rural_clear', 'Units in rural_clear', 'Assisted units in rural_clear', `Expired (year <= ${ASSETS_AS_OF_YEAR})`, `Expiring ${ASSETS_AS_OF_YEAR + 1} to ${ASSET_HORIZON_YEAR}`, 'No expiration date on the source', 'Row means'],
    ...Object.values(ASSET_SOURCES).map((s) => {
      const m = perSource[s.key];
      return [s.key, m.in_designated_tracts.rows, m.in_rural_clear_tracts.rows, m.in_rural_clear_tracts.units, m.in_rural_clear_tracts.assisted_units,
        m.in_rural_clear_tracts.expiration_status.expired ?? 0, m.in_rural_clear_tracts.expiration_status[`expires_by_${ASSET_HORIZON_YEAR}`] ?? 0,
        m.in_rural_clear_tracts.expiration_status.none ?? 0, s.unit_of_row];
    }),
    [], ['Source', 'Server count', 'Fetched', 'Pages', 'Reconciliation', 'Duplicate object IDs dropped', 'Rows with no 2010 tract code', 'Rows outside every designated tract', 'Join key rows compared to TRACT_LEVEL', 'Join key disagreements'],
    ...Object.values(ASSET_SOURCES).map((s) => { const m = perSource[s.key]; return [s.key, m.server_count, m.fetched_count, m.pages, m.reconciliation, m.duplicate_object_ids_dropped, m.rows_without_tract_code, m.rows_outside_designated_tracts, m.join_key_crosscheck.rows_compared, m.join_key_crosscheck.disagreements]; }),
    [], ['Every designated class is kept, not only rural_clear, so the application can filter later.'],
    ['Source', ...ALL_CLASSES],
    ...Object.values(ASSET_SOURCES).map((s) => [s.key, ...ALL_CLASSES.map((c) => perSource[s.key].in_designated_tracts.by_eb5_rural_class[c] ?? 0)]),
    [], [`Top 10 counties by rural_clear rows, all sources. ${Object.keys(byCounty).length} counties carry at least one.`], ['County', 'County FIPS', 'rural_clear tracts with assets', ...Object.keys(ASSET_SOURCES)],
    ...Object.values(byCounty).sort((a, b) => Object.keys(ASSET_SOURCES).reduce((s, k) => s + b[k].rows - a[k].rows, 0) || a.county_fips.localeCompare(b.county_fips)).slice(0, 10)
      .map((c) => [`${c.county_name}, ${c.state}`, c.county_fips, c.rural_clear_tracts_with_assets.length, ...Object.keys(ASSET_SOURCES).map((k) => c[k].rows)]),
    [], ['A row is a geographic and administrative observation about an existing subsidized property. It does not establish ownership, availability, a listing, an offer, condition, financeability or EB-5 eligibility, and the tract class on it is a screen that the statute settles at the site.'],
    ['Owner and management-agent names, addresses, phone numbers and email addresses exist on all three layers and are never requested, cached or written.']];
  const sourceRowsSheet = [['Key', 'Role', 'Layer', 'outFields', 'Page cap', 'Pages', 'Server count', 'Fetched', 'Reconciliation', 'Retrieved (UTC)', 'Note'],
    ...Object.values(ASSET_SOURCES).map((s) => { const m = perSource[s.key]; return [s.key, s.label, s.layer, s.out_fields, s.page_cap, m.pages, m.server_count, m.fetched_count, m.reconciliation, pageReceipts[s.key]?.[0]?.fetched_utc ?? started, s.note]; }),
    ['tracts', 'Designated tract table and EB-5 rural class (join target)', path.resolve(tractsCsvPath), `${tracts.size} designated tracts; file SHA-256 ${sha256(tractBuf)}`, '', '', '', '', '', started, `Join key STATE2KX+CNTY2KX+TRACT2KX padded to 11 digits, with the Bedford alias ${Object.entries(CDFI_TO_2010_ALIAS).map(([a, b]) => `${b} -> ${a}`).join(', ')}`]];

  await fs.mkdir(outDir, { recursive: true });
  const base = 'oz-eb5-assets';
  const csvPath = path.join(outDir, `${base}.csv`), xlsxPath = path.join(outDir, `${base}.xlsx`);
  const assetRows = objectsToRows(outRows, ASSET_COLUMNS);
  const csvBuf = toCsvBuffer(assetRows);
  await fs.writeFile(csvPath, csvBuf);
  const xlsxBuf = writeXlsx([{ name: 'Assets', rows: assetRows }, { name: 'Summary', rows: summaryRows }, { name: 'Sources', rows: sourceRowsSheet }]);
  await fs.writeFile(xlsxPath, xlsxBuf);
  const manifest = {
    mode: 'assets', started_utc: started, finished_utc: new Date().toISOString(), script_sha256: SCRIPT_SHA256,
    tract_source: { file: path.resolve(tractsCsvPath), sha256: sha256(tractBuf), designated_tracts: tracts.size, rural_clear_tracts: [...tracts.values()].filter((t) => t.eb5_rural_class === 'rural_clear').length },
    join: { key: 'STATE2KX.padStart(2) + CNTY2KX.padStart(3) + TRACT2KX without a decimal point, padStart(6); 2010 vintage', alias: CDFI_TO_2010_ALIAS, classes_kept: 'all designated classes, not only rural_clear' },
    expiration_rule: { as_of_year: ASSETS_AS_OF_YEAR, horizon_year: ASSET_HORIZON_YEAR, statuses: ['expired', `expires_by_${ASSET_HORIZON_YEAR}`, 'later', 'none'], note: `expired means the recorded year is ${ASSETS_AS_OF_YEAR} or earlier; none means the source carried no parseable date, not that the property is unrestricted.` },
    owner_or_agent_fields_requested: false,
    sources: perSource, page_receipts: pageReceipts,
    totals: { rows: outRows.length, rows_in_rural_clear: outRows.filter((r) => r.eb5_rural_class === 'rural_clear').length, counties_in_by_county: Object.keys(byCounty).length },
    by_county: byCounty,
    outputs: { csv: { file: path.basename(csvPath), sha256: sha256(csvBuf), rows: outRows.length }, xlsx: { file: path.basename(xlsxPath), sha256: sha256(xlsxBuf) } },
    rule: 'An asset row is an existing subsidized multifamily property inside a designated 2018 Opportunity Zone tract, carrying that tract’s EB-5 rural class. The class is a tract-level screen; the EB-5 statute tests the site, and no row here establishes ownership, availability, condition or eligibility.',
  };
  await fs.writeFile(path.join(outDir, `${base}.manifest.json`), JSON.stringify(manifest, null, 2));
  process.stdout.write(`${outRows.length} rows in designated tracts, ${manifest.totals.rows_in_rural_clear} in rural_clear across ${Object.keys(byCounty).length} counties\nWrote ${csvPath}, ${xlsxPath}, ${base}.manifest.json\n`);
}

// ---------- entry ----------
const [mode, ...rest] = process.argv.slice(2);
const defaultOut = path.join('.local', 'oz-eb5-screen');
if (mode === 'tracts') await runTracts(rest[0] ?? defaultOut);
else if (mode === 'sites') { if (!rest[0]) throw new Error('Supply the input CSV.'); await runSites(rest[0], rest[1] ?? defaultOut); }
else if (mode === 'parcels') { if (!rest[0]) throw new Error(`Supply the state: ${Object.keys(PARCEL_SERVICES).join(', ')}.`); await runParcels(rest[0].toUpperCase(), rest[1] ?? defaultOut); }
else if (mode === 'assets') await runAssets(rest[0] ?? defaultOut);
else { process.stderr.write('Usage: node scripts/oz-eb5-screen.mjs tracts [outdir] | sites <input.csv> [outdir] | parcels <MT|NC|WI> [outdir] | assets [outdir]\n'); process.exit(2); }
