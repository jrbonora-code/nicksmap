// Shared helpers for the national 2027 Opportunity Zone pipeline: scripts/oz2027-refresh.mjs (offline bundle and the
// weekly --check) and scripts/oz2027-import-core.mjs (the explicit operator import). No dependency beyond Node and the
// already-locked @turf/simplify, which only the refresh uses.
//
// The minimal zip and xlsx reader mirrors scripts/prepare-oz-eb5-import.mjs, which in turn mirrors the offline
// screen; those files are reviewed and are not modified from here.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

// ---------- tiers ----------
// Best first. A tract's headline status is the best tier among its shipped signals, or `eligible` when none applies.
// lib/research/oz2027.ts carries the same list; tests/research/oz2027.test.ts proves the two agree.
export const OZ2027_TIERS = ['certified', 'nominated', 'state_recommended', 'draft_for_comment', 'local_recommended', 'eligible'];
export const OZ2027_SIGNAL_TIERS = OZ2027_TIERS.slice(0, -1);
export const OZ2027_CONFIDENCE = ['high', 'medium', 'low', 'unverified'];
export const OZ2027_STATE_STATUSES = ['certified', 'nominated', 'state_recommended', 'draft_for_comment', 'local_recommended', 'extension', 'unknown'];
export const OZ2027_ROUTES = ['poverty', 'median_income', 'poverty_and_median_income', 'median_income_upper_bound', 'temporary_displacement', 'other'];
// D06: only these publisher classes may ship a tract list. Trackers and other third parties stay state-level claims.
export const OZ2027_SHIPPABLE_PUBLISHERS = new Set(['government', 'government_mirror']);
export const tierRank = tier => { const i = OZ2027_TIERS.indexOf(tier); if (i < 0) throw new Error(`Unknown tier ${tier}.`); return i; };
const confidenceRank = c => OZ2027_CONFIDENCE.indexOf(c);
/** The best signal for one tract: lowest tier rank, then highest confidence, then source id for a stable answer. */
export function headlineOf(signals) {
  for (const s of signals) tierRank(s.status);
  const on = signals.filter(s => s.on_eligible_list);
  if (!on.length) return { status: 'eligible', confidence: null, sourceId: null };
  const best = [...on].sort((a, b) => tierRank(a.status) - tierRank(b.status) || confidenceRank(a.confidence) - confidenceRank(b.confidence) || a.source_id.localeCompare(b.source_id))[0];
  return { status: best.status, confidence: best.confidence, sourceId: best.source_id };
}

// ---------- csv ----------
export function parseCsv(text) {
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
export function csvObjects(text) {
  const [header, ...body] = parseCsv(text);
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- zip and xlsx ----------
export function unzip(buf) {
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
  const get = name => {
    const entry = entries.get(name);
    if (!entry) return null;
    const n = buf.readUInt16LE(entry.local + 26), e = buf.readUInt16LE(entry.local + 28);
    const data = buf.subarray(entry.local + 30 + n + e, entry.local + 30 + n + e + entry.csize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Unsupported zip method ${entry.method}.`);
  };
  get.names = () => [...entries.keys()];
  return get;
}
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
/** Rows of the first worksheet as arrays of trimmed strings, in row order. */
export function readFirstSheet(zipBuf) {
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

// ---------- shapefile ----------
/** dBASE III records as objects of trimmed strings. */
export function readDbf(buf) {
  const records = buf.readUInt32LE(4), headerLength = buf.readUInt16LE(8), recordLength = buf.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; buf[offset] !== 0x0d; offset += 32) {
    fields.push({ name: buf.toString('latin1', offset, offset + 11).replace(/\0.*$/s, ''), length: buf[offset + 16] });
  }
  const out = [];
  for (let r = 0; r < records; r++) {
    let offset = headerLength + r * recordLength + 1;
    const row = {};
    for (const f of fields) { row[f.name] = buf.toString('latin1', offset, offset + f.length).trim(); offset += f.length; }
    out.push(row);
  }
  return out;
}
// Shoelace sum over edges (x2 - x1)(y2 + y1): positive for a clockwise ring, which is a shapefile outer ring.
const clockwiseArea = ring => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]); return a / 2; };
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/**
 * Polygon records (shape type 5) as GeoJSON geometries, in record order. Shapefile outer rings run clockwise and holes
 * counter-clockwise; each hole is placed in the outer ring that contains it, never just the previous one.
 */
export function readShpPolygons(buf) {
  const out = [];
  for (let offset = 100; offset < buf.length;) {
    const contentBytes = buf.readInt32BE(offset + 4) * 2;
    const start = offset + 8;
    const type = buf.readInt32LE(start);
    if (type === 0) { out.push(null); offset = start + contentBytes; continue; }
    if (type !== 5) throw new Error(`Unsupported shape type ${type}.`);
    const numParts = buf.readInt32LE(start + 36), numPoints = buf.readInt32LE(start + 40);
    const parts = [];
    for (let i = 0; i < numParts; i++) parts.push(buf.readInt32LE(start + 44 + i * 4));
    const pointsAt = start + 44 + numParts * 4;
    const rings = parts.map((first, i) => {
      const last = i + 1 < numParts ? parts[i + 1] : numPoints;
      const ring = [];
      for (let p = first; p < last; p++) ring.push([buf.readDoubleLE(pointsAt + p * 16), buf.readDoubleLE(pointsAt + p * 16 + 8)]);
      return ring;
    });
    const outers = [], holes = [];
    for (const ring of rings) (clockwiseArea(ring) > 0 ? outers : holes).push(ring);
    // GeoJSON (RFC 7946) winds exterior rings counter-clockwise and holes clockwise, the reverse of the shapefile.
    const polygons = outers.map(o => [o.slice().reverse()]);
    for (const hole of holes) {
      const host = outers.findIndex(o => pointInRing(hole[0], o));
      if (host >= 0) polygons[host].push(hole.slice().reverse());
    }
    out.push(polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons });
    offset = start + contentBytes;
  }
  return out;
}
export function bboxOf(geometry) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) {
    if (x < minLon) minLon = x; if (x > maxLon) maxLon = x; if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
  }
  return [minLon, minLat, maxLon, maxLat];
}
/**
 * A point inside the largest polygon of a GeoJSON geometry: the midpoint of the widest interior run of the horizontal
 * line through the exterior ring's vertical middle, holes included. Unlike a centroid it never falls outside a C-shaped
 * or holed tract.
 */
export function labelPoint(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const area = ring => Math.abs(clockwiseArea(ring));
  const polygon = polygons.reduce((best, p) => (area(p[0]) > area(best[0]) ? p : best), polygons[0]);
  const ys = polygon[0].map(p => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  let best = null;
  for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = lo + (hi - lo) * fraction;
    const xs = [];
    for (const ring of polygon) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best.width) best = { width: xs[k + 1] - xs[k], x: (xs[k] + xs[k + 1]) / 2, y };
    if (best && best.width > 0) break;
  }
  const [x, y] = best ? [best.x, best.y] : polygon[0][0];
  return [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5];
}
export function pointInGeometry(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(p => pointInRing(point, p[0]) && !p.slice(1).some(hole => pointInRing(point, hole)));
}
export function roundGeometry(geometry, places = 5) {
  const f = 10 ** places;
  const r = ring => {
    const out = [];
    for (const [x, y] of ring) { const p = [Math.round(x * f) / f, Math.round(y * f) / f]; const last = out[out.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p); }
    return out;
  };
  // A polygon whose exterior collapses below four positions is dropped whole, so a hole can never become an exterior.
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map(polygon => polygon.map(r)).filter(polygon => polygon[0].length >= 4).map(polygon => [polygon[0], ...polygon.slice(1).filter(ring => ring.length >= 4)]);
  if (!polygons.length) return null;
  return polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
}

// ---------- fetching with receipts ----------
const USER_AGENT = 'Mozilla/5.0 (compatible; oz2027-refresh; public-records research)';
export async function fetchBytes(url, { timeoutMs = 90000, attempts = 3, accept } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? '', finalUrl: response.url };
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500 && error.status !== 429) break;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw lastError;
}
/** A cached download with a receipt beside it. A cached file is reused unless `refresh` is set; its hash is always recomputed. */
export async function cachedDownload(url, file, { refresh = false, note = '' } = {}) {
  const receiptFile = `${file}.receipt.json`;
  if (!refresh) {
    try {
      const bytes = await fs.readFile(file);
      const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
      if (receipt.sha256 === sha256(bytes) && receipt.url === url) return { bytes, receipt };
    } catch { /* not cached */ }
  }
  const { bytes } = await fetchBytes(url, { timeoutMs: 300000 });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  const receipt = { url, file: path.basename(file), sha256: sha256(bytes), bytes: bytes.length, fetched_utc: new Date().toISOString(), note };
  await fs.writeFile(receiptFile, JSON.stringify(receipt, null, 2));
  return { bytes, receipt };
}

// ---------- text normalization for page hashing ----------
/** Visible text of an HTML page, so the weekly check compares content rather than markup, tokens or script bundles. */
export function pageText(html) {
  return html
    .replace(/<!--.*?-->/gs, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>.*?<\/\1>/gis, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
export const isHtml = (contentType, bytes) => /html/i.test(contentType) || /^\s*<(!doctype html|html)/i.test(bytes.subarray(0, 200).toString('utf8'));

// ---------- privacy ----------
// No person, company or contact field is ever requested or written. A list may name one jurisdiction field (a government
// body or municipality) and, for an aggregated public-submission layer, one organization field that is read only to
// count distinct submitters and drop test entries.
const PERSONAL = /name|e-?mail|phone|telephone|(^|_)(ph|tel|addr)(_|$)|contact|address|agent|owner|mobile|(^|_)cell(_|$)/i;
export function assertNoPersonalFields(fields, allowed = []) {
  for (const field of fields) if (PERSONAL.test(field) && !allowed.includes(field)) throw new Error(`Refusing to request field ${field}: it may hold personal or contact data.`);
}
