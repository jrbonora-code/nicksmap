// Payoff check: the Hillsborough and Pinellas clerks' daily official-records index files. Only satisfactions and
// releases are kept: instrument number, date, amount, the cited original instrument and the releasing lender's name
// when it is an organization. Party files are read in memory and never written as received; a person's name is never
// stored. Hillsborough keeps about two months online and Pinellas about one week, so coverage runs forward from the
// first capture. Public records (Fla. Stat. ch. 119 and s. 28.2221).
import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE, cachedFetch, cents, isOrganization, isoDate, politeFetch, sha256 } from './debt-lib.mjs';

export const CLERKS = {
  '12057': { name: 'Hillsborough', base: 'https://publicrec.hillsclerk.com/OfficialRecords/DailyIndexes/', doc: /^D(\d{8})(\d{2})id\.29$/, party: d => `P${d}id.29`, release: /^(SAT|REL|RELMTG|PSAT)$/ },
  '12103': { name: 'Pinellas', base: 'https://publicfiles.mypinellasclerk.gov/download/OFFICIAL_RECORDS/INDEXES_DAILY/', doc: /^d(\d{8})(\d{2})id\.52$/, party: d => `p${d}id.52`, release: /^(S|REL|PS|SM)$/ },
};
/** The daily document files a clerk has online now, oldest first. */
export async function listDays(fips) {
  const clerk = CLERKS[fips];
  const { bytes } = await politeFetch(clerk.base);
  const names = [...new Set([...bytes.toString('latin1').matchAll(/>\s*([A-Za-z]\d{10}[a-z]*\.\d{2})\s*</g)].map(m => m[1]))];
  return names.map(n => n.match(clerk.doc)).filter(Boolean).map(m => ({ file: m[0], day: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`, export: m[2], stamp: m[1] + m[2] })).sort((a, b) => a.stamp.localeCompare(b.stamp));
}
/** The instrument a release cites, when it names one ("CLK # 2020135527", "INSTR 2020135527"); book and page otherwise. */
export function citedInstrument(legal) {
  const s = String(legal ?? '').toUpperCase();
  const clk = s.match(/\b(?:CLK|CLERK|INSTR?(?:UMENT)?|INST|DOC)\s*(?:NO\.?|#)?\s*#?\s*(\d{8,13})\b/);
  if (clk) return { instrument: clk[1], book: null, page: null };
  const bp = s.match(/\bO\.?\s?R\.?\s*(?:BK|BOOK)\s*(\d+)\s*(?:PG|PAGE)\s*(\d+)/) ?? s.match(/\bBK\s*(\d+)\s*PG\s*(\d+)/);
  return bp ? { instrument: null, book: bp[1], page: bp[2] } : { instrument: null, book: null, page: null };
}
/**
 * One day's releases for a county: document rows joined to their parties. The returned `parties` (names of the
 * releasing and released sides) exist only in memory for matching; `lenders` keeps organizations only.
 */
export async function loadDay(fips, day) {
  const clerk = CLERKS[fips];
  const docUrl = clerk.base + day.file;
  const { bytes, receipt } = await cachedFetch(docUrl, path.join(CACHE, 'clerk', fips, day.file), { immutable: true, note: `${clerk.name} daily index` });
  const releases = new Map();
  for (const line of bytes.toString('latin1').split(/\r?\n/)) {
    const f = line.split('|');
    // Rows are adds (DDA); a delete (DDD) withdraws a document.
    if (f.length < 13 || /^DD?D$/i.test(f[0])) continue;
    const type = f[3].trim().toUpperCase();
    if (!clerk.release.test(type)) continue;
    // Court satisfactions (judgments, bonds) cite a case, not a mortgage.
    if (/\bCASE#/i.test(f[5])) continue;
    const cited = citedInstrument(f[5]);
    releases.set(f[2].trim(), { county: fips, instrument: f[2].trim(), type, description: f[4].trim(), recorded: isoDate(f[11]), amountCents: cents(f[13]), citedInstrument: cited.instrument, citedBook: cited.book, citedPage: cited.page, lenders: [], parties: { from: [], to: [] } });
  }
  // Party file: read in memory, joined by instrument, then dropped. FRM is the releasing side (the lender). Only the
  // organizations on each side are kept beside the cache, so a later run can re-match after the clerk removes the file.
  let partyReceipt = null;
  const partyUrl = clerk.base + clerk.party(day.stamp), orgFile = path.join(CACHE, 'clerk', fips, `${day.stamp}.organizations.json`);
  let party = null;
  try { party = (await politeFetch(partyUrl)).bytes; } catch (error) { if (error?.status !== 404) throw error; }
  if (party) {
    partyReceipt = { url: partyUrl, sha256: sha256(party), bytes: party.length, fetched_utc: new Date().toISOString(), note: 'read in memory; only organizations kept' };
    for (const line of party.toString('latin1').split(/\r?\n/)) {
      const f = line.split('|');
      const r = releases.get((f[2] ?? '').trim());
      if (!r) continue;
      const side = /^FR/i.test(f[4]) ? 'from' : /^TO/i.test(f[4]) ? 'to' : null;
      const name = (f[5] ?? '').replace(/\s+/g, ' ').trim();
      if (!side || !name) continue;
      r.parties[side].push(name);
      if (side === 'from' && isOrganization(name) && !r.lenders.includes(name)) r.lenders.push(name);
    }
    const organizations = Object.fromEntries([...releases.values()].map(r => [r.instrument, { from: r.parties.from.filter(isOrganization), to: r.parties.to.filter(isOrganization) }]));
    await fs.writeFile(orgFile, JSON.stringify({ partyReceipt, organizations }));
  } else {
    try {
      const cached = JSON.parse(await fs.readFile(orgFile, 'utf8'));
      partyReceipt = { ...cached.partyReceipt, note: 'party file no longer online; organizations from the earlier capture' };
      for (const r of releases.values()) {
        const o = cached.organizations[r.instrument];
        if (o) { r.parties = { from: [...o.from], to: [...o.to] }; r.lenders = [...new Set(o.from)]; }
      }
    } catch { /* never captured */ }
  }
  return { receipt, partyReceipt, releases: [...releases.values()] };
}
/** The stored form of a release: no party names except organization lenders. */
export const storedRelease = r => ({ county: r.county, instrument: r.instrument, type: r.type, recorded: r.recorded, amountCents: r.amountCents, citedInstrument: r.citedInstrument, citedBook: r.citedBook, citedPage: r.citedPage, lenders: r.lenders });
/** Days captured so far, per county, kept beside the cache so a later run (and the weekly check) knows the gap. */
export async function capturedDays() {
  try { return JSON.parse(await fs.readFile(path.join(CACHE, 'clerk', 'captured.json'), 'utf8')); } catch { return {}; }
}
export async function saveCaptured(captured) {
  await fs.mkdir(path.join(CACHE, 'clerk'), { recursive: true });
  await fs.writeFile(path.join(CACHE, 'clerk', 'captured.json'), JSON.stringify(captured, null, 2));
}
