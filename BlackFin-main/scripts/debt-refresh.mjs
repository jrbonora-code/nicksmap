// Loan sources: build the private import bundle, or run the weekly county-records check.
//   node scripts/debt-refresh.mjs <research-bundle.json.gz> [--out .local/debt/import]
//   node scripts/debt-refresh.mjs --check [--report debt-report.md]
// The build reads HUD's two workbooks, the latest EX-102 of every CMBS trust (SEC, two requests a second, cached by
// accession), and every Hillsborough and Pinellas daily index online now; links them to the research snapshot's
// properties; geocodes CMBS loans outside the property data; and writes a gzip bundle plus its manifest. It touches no
// database. The check lists the clerks' daily files against data/debt/clerk-baseline.json: exit 0 when nothing new is
// online, 1 when new days are waiting (the weekly workflow then opens or updates an issue), 2 on error.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ROOT, CACHE, requestCount, sha256 } from './debt-lib.mjs';
import { loadHud } from './debt-hud.mjs';
import { latestFilings, fetchExhibit, parseExhibit } from './debt-sec.mjs';
import { CLERKS, listDays, loadDay, storedRelease } from './debt-clerk.mjs';
import { matchCmbs, matchHud, matchReleases, propertiesOf } from './debt-match.mjs';
import { batchGeocode, zipCentroids } from './debt-geocode.mjs';

export const PARSER_VERSION = 'debt-sources-1';
const SCRIPTS = ['debt-lib.mjs', 'debt-hud.mjs', 'debt-sec.mjs', 'debt-clerk.mjs', 'debt-match.mjs', 'debt-geocode.mjs', 'debt-refresh.mjs'];
export const RULE = 'Links are confirmed only on an exact recorded instrument, ZIP plus street number and street, or ZIP plus city, name (0.75) and units within 10%; weaker agreement is probable; nothing weaker is linked. Servicer balances come from HUD amortized balances and CMBS period-end balances. Releases are satisfactions and releases recorded in Hillsborough and Pinellas since the first capture. No person\'s name is stored.';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };

async function check() {
  const baselineFile = path.join(ROOT, 'data', 'debt', 'clerk-baseline.json');
  const baseline = JSON.parse(await fs.readFile(baselineFile, 'utf8').catch(() => '{}'));
  const lines = ['# County records waiting', '', `Checked ${new Date().toISOString().slice(0, 10)}. Pinellas keeps about one week of daily files online and Hillsborough about two months; run \`node scripts/debt-refresh.mjs\` and import the bundle before they roll off.`, ''];
  let waiting = 0;
  for (const [fips, clerk] of Object.entries(CLERKS)) {
    const days = await listDays(fips);
    const last = baseline[fips]?.lastDay ?? '';
    const fresh = days.filter(d => d.day > last);
    const oldest = days[0]?.day ?? 'none';
    const gap = last && oldest !== 'none' && oldest > nextDay(last);
    waiting += fresh.length;
    lines.push(`- **${clerk.name}**: ${fresh.length} new daily files since ${last || 'the first capture'}; ${days.length} online, oldest ${oldest}.${gap ? ' Some days after the last capture are no longer online.' : ''}`);
  }
  await fs.writeFile(arg('--report', 'debt-report.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  return waiting ? 1 : 0;
}
const nextDay = d => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

async function build(researchFile) {
  const started = Date.now();
  const research = JSON.parse(gunzipSync(await fs.readFile(researchFile), { maxOutputLength: 400e6 }));
  const properties = propertiesOf(research);
  // HUD, national.
  const hud = await loadHud();
  console.log(`HUD ${hud.loans.length} loans`);
  // CMBS, national multifamily property records from each trust's latest EX-102.
  const { filings, receipts: indexReceipts } = await latestFilings();
  const cmbs = [], exhibits = [];
  let notCmbs = 0, noExhibit = 0;
  for (const f of filings) {
    const ex = await fetchExhibit(f);
    if (!ex) { noExhibit++; continue; }
    const parsed = parseExhibit(ex.bytes, f);
    if (!parsed.cmbs) { notCmbs++; continue; }
    exhibits.push({ cik: f.cik, company: f.company, filed: f.filed, accession: f.accession, url: ex.receipt.url, sha256: ex.receipt.sha256, bytes: ex.receipt.bytes, loans: parsed.loans, multifamily: parsed.records.length });
    cmbs.push(...parsed.records);
  }
  console.log(`CMBS ${filings.length} trusts, ${cmbs.length} multifamily property records, ${requestCount} requests`);
  // County releases.
  // A document changed after recording reappears in a later day's file; the latest version of each instrument stands.
  const byInstrument = new Map(), clerkDays = [];
  for (const fips of Object.keys(CLERKS)) {
    for (const day of await listDays(fips)) {
      const d = await loadDay(fips, day);
      for (const r of d.releases) byInstrument.set(`${r.county}:${r.instrument}`, r);
      clerkDays.push({ county: fips, day: day.day, file: day.file, sha256: d.receipt.sha256, releases: d.releases.length, partySha256: d.partyReceipt?.sha256 ?? null });
    }
  }
  const releases = [...byInstrument.values()];
  console.log(`Releases ${releases.length} across ${clerkDays.length} daily files`);
  // Links, one per property, source and key.
  const seen = new Set();
  const links = [...matchHud(hud.loans, properties), ...matchCmbs(cmbs, properties), ...matchReleases(releases, properties)]
    .filter(l => { const k = `${l.propertyId}|${l.source}|${l.sourceKey}`; if (seen.has(k)) return false; seen.add(k); return true; });
  // Points for CMBS loans with no link.
  const linked = new Set(links.filter(l => l.source === 'cmbs').map(l => Number(l.sourceKey.slice(5))));
  const outside = cmbs.map((r, seq) => ({ r, seq })).filter(({ r, seq }) => !linked.has(seq) && r.address && r.state);
  const geo = await batchGeocode(outside.map(({ r, seq }) => ({ id: String(seq), address: r.address, city: r.city, state: r.state, zip: r.zip })));
  const zips = await zipCentroids();
  cmbs.forEach((r, seq) => {
    const point = geo.points.get(String(seq));
    const centroid = r.zip ? zips.map.get(r.zip) : null;
    if (linked.has(seq)) { r.lon = null; r.lat = null; r.geocode = 'none'; }
    else if (point) { [r.lon, r.lat] = point.map(n => Math.round(n * 1e6) / 1e6); r.geocode = 'census_address'; }
    else if (centroid) { [r.lon, r.lat] = centroid.map(n => Math.round(n * 1e6) / 1e6); r.geocode = 'zip_centroid'; }
    else { r.lon = null; r.lat = null; r.geocode = 'none'; }
  });
  // Coverage against the research properties with recorded mortgages.
  const mortgaged = new Set(properties.filter(p => p.mortgages.length).map(p => p.id));
  const cover = (source, confidence) => new Set(links.filter(l => l.source === source && (!confidence || l.confidence === confidence) && mortgaged.has(l.propertyId)).map(l => l.propertyId)).size;
  const counts = {
    hudLoans: hud.loans.length, hudActive: hud.loans.filter(l => l.status === 'active').length, hudTerminated: hud.loans.filter(l => l.status === 'terminated').length,
    cmbsTrusts: exhibits.length, cmbsRecords: cmbs.length, cmbsNotCmbs: notCmbs, cmbsNoExhibit: noExhibit,
    cmbsGeocoded: cmbs.filter(r => r.geocode === 'census_address').length, cmbsZipCentroid: cmbs.filter(r => r.geocode === 'zip_centroid').length,
    releases: releases.length, clerkDays: clerkDays.length, links: links.length,
    linksBySource: Object.fromEntries(['hud', 'cmbs', 'release'].map(s => [s, { confirmed: links.filter(l => l.source === s && l.confidence === 'confirmed').length, probable: links.filter(l => l.source === s && l.confidence === 'probable').length }])),
    mortgagedProperties: mortgaged.size,
    coverage: Object.fromEntries(['hud', 'cmbs', 'release'].map(s => [s, { confirmed: cover(s, 'confirmed'), any: cover(s) }])),
    anySource: new Set(links.filter(l => mortgaged.has(l.propertyId)).map(l => l.propertyId)).size,
  };
  const data = { hud: hud.loans, cmbs, releases: releases.map(storedRelease), clerkDays, links };
  const scriptSha256 = sha256(Buffer.concat(await Promise.all(SCRIPTS.map(f => fs.readFile(path.join(ROOT, 'scripts', f))))));
  const manifest = {
    parserVersion: PARSER_VERSION, researchSnapshotId: research.id, builtAt: new Date().toISOString(), scriptSha256, rule: RULE,
    sources: { hud: hud.receipts, secIndexes: indexReceipts, secExhibits: exhibits, clerkDays, census: { geocoder: geo.receipts, zcta: zips.receipt } },
    counts, dataSha256: sha256(JSON.stringify(data)),
  };
  const id = sha256(JSON.stringify(manifest));
  const out = arg('--out', path.join(CACHE, 'import'));
  await fs.mkdir(out, { recursive: true });
  const file = path.join(out, `debt-${id.slice(0, 16)}.json.gz`);
  await fs.writeFile(file, gzipSync(JSON.stringify({ id, manifest, ...data })));
  await fs.writeFile(`${file}.manifest.json`, JSON.stringify({ id, ...manifest, sources: { ...manifest.sources, secExhibits: `${exhibits.length} exhibits` } }, null, 2));
  // The weekly check compares against the last day captured here.
  const baseline = {};
  for (const fips of Object.keys(CLERKS)) { const days = clerkDays.filter(d => d.county === fips).map(d => d.day).sort(); baseline[fips] = { lastDay: days.at(-1) ?? null, firstDay: days[0] ?? null, files: days.length }; }
  await fs.mkdir(path.join(ROOT, 'data', 'debt'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'data', 'debt', 'clerk-baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
  console.log(JSON.stringify({ id, file, bytes: (await fs.stat(file)).size, seconds: Math.round((Date.now() - started) / 1000), requests: requestCount, counts }, null, 1));
}

const main = async () => {
  if (process.argv.includes('--check')) return check();
  const file = process.argv[2];
  if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/debt-refresh.mjs <research-bundle.json.gz> [--out dir] | --check [--report file]');
  await build(file);
  return 0;
};
main().then(code => { process.exitCode = code; }).catch(error => { console.error(error); process.exitCode = 2; });
