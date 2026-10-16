// Shared helpers for the loan-source pipeline (scripts/debt-refresh.mjs and scripts/debt-import-core.mjs): polite,
// cached downloads with receipts, address and name normalization, and the organization test that keeps individual
// names out of every stored field. Public sources only; no key.
import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './oz2027-lib.mjs';

export { sha256 };
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
export const CACHE = path.join(ROOT, '.local', 'debt');
/** The SEC asks automated tools to declare a company and a contact address; approved by Nick on October 16, 2026. */
export const SEC_USER_AGENT = 'BlackFin research nick@npsconsultingllc.com';
const DEFAULT_AGENT = 'BlackFin research (public records)';

// One queue per host: requests to a host start at least `interval` ms apart (the SEC gets 500 ms, two a second).
const hosts = new Map();
export function hostInterval(host) { return /(^|\.)sec\.gov$/.test(host) ? 500 : 250; }
async function turn(host) {
  const prev = hosts.get(host) ?? Promise.resolve(0);
  let release;
  const next = new Promise(resolve => { release = resolve; });
  hosts.set(host, prev.then(() => next));
  const last = await prev;
  const wait = Math.max(0, last + hostInterval(host) - Date.now());
  if (wait) await new Promise(r => setTimeout(r, wait));
  return () => release(Date.now());
}
export let requestCount = 0;
export async function politeFetch(url, { timeoutMs = 300000, attempts = 3, accept } = {}) {
  const host = new URL(url).hostname;
  const agent = /(^|\.)sec\.gov$/.test(host) ? SEC_USER_AGENT : DEFAULT_AGENT;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const done = await turn(host);
    try {
      requestCount++;
      const response = await fetch(url, { headers: { 'User-Agent': agent, 'Accept-Encoding': 'gzip, deflate', ...(accept ? { Accept: accept } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} ${url}`), { status: response.status });
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType: response.headers.get('content-type') ?? '', lastModified: response.headers.get('last-modified'), finalUrl: response.url };
    } catch (error) {
      lastError = error;
      // A 403 or 404 is an answer, not a fault; 429 and 5xx wait and retry.
      if (error?.status && error.status < 500 && error.status !== 429) break;
      if (attempt < attempts) await new Promise(r => setTimeout(r, (error?.status === 429 ? 10000 : 2000) * attempt));
    } finally { done(); }
  }
  throw lastError;
}
/**
 * A cached download with a receipt beside it. `immutable` files (an SEC accession, a dated clerk file) are never fetched
 * again once cached; others are refreshed when older than `maxAgeMs`.
 */
export async function cachedFetch(url, file, { immutable = false, maxAgeMs = 20 * 3600 * 1000, note = '' } = {}) {
  const receiptFile = `${file}.receipt.json`;
  try {
    const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
    const bytes = await fs.readFile(file);
    if (receipt.url === url && receipt.sha256 === sha256(bytes) && (immutable || Date.now() - Date.parse(receipt.fetched_utc) < maxAgeMs)) return { bytes, receipt, cached: true };
  } catch { /* not cached */ }
  const { bytes, lastModified } = await politeFetch(url);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  const receipt = { url, file: path.basename(file), sha256: sha256(bytes), bytes: bytes.length, fetched_utc: new Date().toISOString(), last_modified: lastModified, note };
  await fs.writeFile(receiptFile, JSON.stringify(receipt, null, 2));
  return { bytes, receipt, cached: false };
}

// ---------- normalization ----------
const SUFFIX = { AVENUE: 'AVE', AV: 'AVE', STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', BOULEVARD: 'BLVD', LANE: 'LN', COURT: 'CT', CIRCLE: 'CIR', PLACE: 'PL', PARKWAY: 'PKWY', HIGHWAY: 'HWY', TERRACE: 'TER', TRAIL: 'TRL', WAY: 'WAY', SQUARE: 'SQ', POINT: 'PT', PLAZA: 'PLZ', CROSSING: 'XING', CENTER: 'CTR', LOOP: 'LOOP', RUN: 'RUN', PIKE: 'PIKE', EXPRESSWAY: 'EXPY', FREEWAY: 'FWY', COVE: 'CV', BEND: 'BND' };
const DIRECTION = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW' };
const ORDINAL = { FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH' };
/** "3805 South Hopkins Avenue, Unit 4" -> { number: '3805', street: 'S HOPKINS AVE', key: '3805 S HOPKINS AVE' }. */
export function normalizeStreet(line) {
  const upper = String(line ?? '').toUpperCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = upper.replace(/\b(APT|UNIT|STE|SUITE|BLDG|BUILDING|LOT|SPC|SPACE|RM|ROOM|FL|FLOOR)\b.*$/, '').trim();
  const words = cut.split(' ').filter(Boolean).map(w => SUFFIX[w] ?? DIRECTION[w] ?? ORDINAL[w] ?? w);
  // A range "1400-1420 MAIN ST" keeps its first number.
  const first = words[0]?.match(/^(\d+)[A-Z]?(?:-\d+[A-Z]?)?$/);
  const number = first ? first[1] : null;
  const street = (number ? words.slice(1) : words).join(' ');
  return { number, street, key: number ? `${number} ${street}` : street };
}
export const zip5 = z => { const m = String(z ?? '').match(/\d{5}/); return m ? m[0] : null; };
const NAME_NOISE = /\b(THE|APARTMENTS?|APTS?|HOMES|RESIDENCES?|VILLAGE|VILLAS?|TOWNHOMES?|TOWERS?|MANOR|COMMONS|COMMUNITY|AT|OF|AND|ON|II|III|IV|PHASE|LLC|LP|LTD|INC|ASSOCIATES|PARTNERS|HOUSING|SENIOR|SENIORS|LUXURY|RENOVATION)\b/g;
// Lender names: words every bank shares, so only the distinctive part is compared.
export const LENDER_NOISE = /\b(BANK|BANKING|TRUST|TRUSTEE|COMPANY|CO|NATIONAL|ASSOCIATION|ASSN|N\s?A|NA|FSB|FEDERAL|SAVINGS|MORTGAGE|MTG|CAPITAL|FINANCIAL|FINANCE|FUNDING|LENDING|LENDER|CREDIT|UNION|CORPORATION|CORP|INC|LLC|LP|THE|OF|AND|AS|FOR|SUCCESSOR|INTEREST|BY|MERGER)\b/g;
const stem = t => (t.length > 3 && t.endsWith('S') && !t.endsWith('SS') ? t.slice(0, -1) : t);
const CITY_ALIAS = s => s.toUpperCase().replace(/\bST\.?\s/g, 'SAINT ').replace(/\bFT\.?\s/g, 'FORT ').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
export const sameCity = (a, b) => !!a && !!b && CITY_ALIAS(a) === CITY_ALIAS(b);
/** Name tokens for comparison: generic words, single letters and the place's own city words removed; plurals folded. */
export function nameTokens(name, { noise = NAME_NOISE, cities = [] } = {}) {
  const city = new Set(cities.flatMap(c => CITY_ALIAS(String(c ?? '')).split(' ')).filter(t => t.length > 1));
  return new Set(String(name ?? '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(noise, ' ').split(/\s+/).filter(t => t.length > 1 && !city.has(t)).map(stem));
}
/** Dice similarity of two names' distinctive tokens (0 to 1). */
export function nameSimilarity(a, b, options) {
  const x = nameTokens(a, options), y = nameTokens(b, options);
  if (!x.size || !y.size) return 0;
  let shared = 0; for (const t of x) if (y.has(t)) shared++;
  return (2 * shared) / (x.size + y.size);
}
// ---------- privacy ----------
const ORGANIZATION = /\b(BANK|BANCORP|BANCSHARES|TRUST|TRUSTEE|N\.?\s?A\.?|NATIONAL ASSOCIATION|ASSOCIATION|ASSN|ASSOC|FEDERAL|CREDIT UNION|SAVINGS|MORTGAGE|MTG|LENDING|LENDER|LOAN|FINANCE|FINANCIAL|FUNDING|CAPITAL|CREDIT|INVESTMENT|INVESTORS|INSURANCE|ASSURANCE|LIFE|SERVICING|SERVICER|SERVICES|HOLDINGS|PARTNERS|FUND|REIT|PROPERTIES|REALTY|EQUITY|LLC|L\.?L\.?C|LP|L\.?P|LLP|LTD|INC|INCORPORATED|CORP|CORPORATION|COMPANY|CO|GROUP|AUTHORITY|AGENCY|COUNTY|CITY|STATE|DEPARTMENT|SECRETARY|HOUSING|DEVELOPMENT|FOUNDATION|CHURCH|UNIVERSITY|COMMISSIONERS|BOARD|FNMA|FHLMC|HUD|FREDDIE|FANNIE)\b/i;
/** True for a business or public body. Anything else is treated as a person and is never stored. */
export function isOrganization(name) { return ORGANIZATION.test(String(name ?? '')); }
/** An organization's name, or null: no individual's name is ever written. */
export const organizationOrNull = name => { const n = String(name ?? '').replace(/\s+/g, ' ').trim(); return n && isOrganization(n) ? n : null; };
export const isoDate = v => {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};
export const cents = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 && Number.isSafeInteger(Math.round(n * 100)) ? Math.round(n * 100) : null; };
