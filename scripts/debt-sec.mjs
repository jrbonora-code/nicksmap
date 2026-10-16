// CMBS loans from SEC EDGAR Form ABS-EE, Exhibit EX-102 (Reg AB Schedule AL asset data). For each CMBS trust, the
// latest monthly filing in the last two quarterly form indexes; from it, every multifamily property record with its
// loan's servicer-reported balance, rate, maturity, DSCR, occupancy, delinquency, special servicing, modification
// and payoff code. Requests carry the declared User-Agent, run at most two a second, and every accession is cached
// and never fetched again. sec.gov content is public; cite the SEC.
import path from 'node:path';
import { CACHE, cachedFetch, isoDate, organizationOrNull, zip5 } from './debt-lib.mjs';

/** CMBS trust names. Depositors (LLC, Inc., Corp.) repeat their trusts' data and are skipped. */
const CMBS = /COMMERCIAL MORTGAGE|^BANK5? 20|^BANK5 TRUST|BBCMS|BENCHMARK 20|^BMO 20|^CD 20|^CF 20|CFCRE|^COMM 20|CSAIL|GS MORTGAGE SECURITIES TRUST|JPMBB|JPMCC|JPMDB|MSBAM|MORGAN STANLEY CAPITAL I TRUST|MORGAN STANLEY BANK OF AMERICA|WFRBS|DBJPM|DBGS|^UBS 20|3650R|BBSG|^MSC 20|MULTIFAMILY MORTGAGE TRUST|^FIVE 20/i;
export const isCmbsTrust = name => CMBS.test(name) && !/\b(LLC|INC\.?|CORP\.?|CORPORATION)$/i.test(name.trim());
export function quartersBack(now = new Date(), n = 2) {
  const out = []; let y = now.getUTCFullYear(), q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < n; i++) { out.unshift({ year: y, q, current: i === 0 }); q--; if (!q) { q = 4; y--; } }
  return out;
}
/** One ABS-EE row of an EDGAR form index. Columns are padded to widths the header does not show, so the row is read by its shape. */
export function formIndexRow(line) {
  const m = String(line).match(/^ABS-EE\s+(.+?)\s+(\d{1,10})\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s*$/);
  return m ? { company: m[1], cik: m[2], filed: m[3], file: m[4] } : null;
}
/** The latest ABS-EE filing per CMBS trust, from EDGAR's quarterly form indexes. */
export async function latestFilings(now = new Date()) {
  const latest = new Map(), receipts = [];
  for (const { year, q, current } of quartersBack(now)) {
    const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${q}/form.idx`;
    const { bytes, receipt } = await cachedFetch(url, path.join(CACHE, 'sec', 'full-index', `${year}-QTR${q}-form.idx`), { immutable: !current });
    receipts.push(receipt);
    for (const line of bytes.toString('latin1').split('\n')) {
      const row = formIndexRow(line);
      if (!row) continue;
      const { company, cik, filed, file } = row;
      if (!isCmbsTrust(company)) continue;
      const accession = file.match(/(\d{10}-\d{2}-\d{6})\.txt$/)?.[1];
      if (!accession) continue;
      const prev = latest.get(cik);
      if (!prev || filed > prev.filed || (filed === prev.filed && accession > prev.accession)) latest.set(cik, { cik, company, filed, accession });
    }
  }
  return { filings: [...latest.values()].sort((a, b) => a.company.localeCompare(b.company)), receipts };
}
/** The EX-102 document of one filing, found through the filing's index; cached forever by accession. */
export async function fetchExhibit(filing) {
  const dir = `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accession.replace(/-/g, '')}`;
  const index = await cachedFetch(`${dir}/index.json`, path.join(CACHE, 'sec', 'filings', filing.accession, 'index.json'), { immutable: true });
  const items = JSON.parse(index.bytes.toString('utf8')).directory?.item ?? [];
  const exhibit = items.find(i => /ex[-_]?102.*\.xml$/i.test(i.name)) ?? items.find(i => /102.*\.xml$/i.test(i.name));
  if (!exhibit) return null;
  const size = Number(exhibit.size);
  if (Number.isFinite(size) && size > 80e6) throw new Error(`${filing.accession}: EX-102 is ${size} bytes; refusing an unexpected size.`);
  const { bytes, receipt } = await cachedFetch(`${dir}/${exhibit.name}`, path.join(CACHE, 'sec', 'filings', filing.accession, exhibit.name), { immutable: true });
  return { bytes, receipt: { ...receipt, cik: filing.cik, company: filing.company, filed: filing.filed, accession: filing.accession } };
}

// ---------- EX-102 parsing ----------
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
/** Leaf elements of one block as a lower-cased map; namespace prefixes are dropped. */
function leaves(xml) {
  const out = {};
  for (const m of xml.matchAll(/<(?:[\w-]+:)?([A-Za-z][\w]*)>([^<]*)<\/(?:[\w-]+:)?\1>/g)) { const k = m[1].toLowerCase(); if (!(k in out)) out[k] = decode(m[2]); }
  return out;
}
const num = v => { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const money = v => { const n = num(v); return n !== null && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? Math.round(n * 100) : null; };
const pct = v => { const n = num(v); return n === null ? null : n <= 1.5 ? Math.round(n * 1e6) / 1e4 : n; };
const date = v => (v ? isoDate(String(v).replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$1-$2')) : null);
const bool = v => (v === undefined || v === '' ? null : /^(true|1|y)$/i.test(v));
/** Every multifamily property record in one EX-102 file. A portfolio loan yields one record per property, each carrying the loan total. */
export function parseExhibit(xml, filing) {
  const text = typeof xml === 'string' ? xml : xml.toString('utf8');
  if (!/absee\/cmbs/i.test(text.slice(0, 4000))) return { cmbs: false, loans: 0, records: [] };
  const records = [];
  let loans = 0;
  for (const block of text.matchAll(/<(?:[\w-]+:)?assets>([\s\S]*?)<\/(?:[\w-]+:)?assets>/g)) {
    loans++;
    const body = block[1];
    const properties = [...body.matchAll(/<(?:[\w-]+:)?property>([\s\S]*?)<\/(?:[\w-]+:)?property>/g)].map(m => leaves(m[1]));
    const loanXml = body.replace(/<(?:[\w-]+:)?property>[\s\S]*?<\/(?:[\w-]+:)?property>/g, '');
    const l = leaves(loanXml);
    const transfer = date(l.mostrecentspecialservicertransferdate), back = date(l.mostrecentmasterservicerreturndate);
    const loan = {
      trust: filing.company, cik: filing.cik, accession: filing.accession, filed: filing.filed, asset: l.assetnumber ?? null,
      periodEnd: date(l.reportingperiodenddate), originator: organizationOrNull(l.originatorname), originated: date(l.originationdate),
      originalAmountCents: money(l.originalloanamount), maturity: date(l.maturitydate),
      ratePct: pct(l.reportperiodinterestratepercentage ?? l.originalinterestratepercentage),
      balanceCents: money(l.reportperiodendactualbalanceamount ?? l.reportperiodendscheduledloanbalanceamount),
      paidThrough: date(l.paidthroughdate), paymentStatus: l.paymentstatusloancode ?? null,
      specialServicing: !!transfer && (!back || back < transfer), specialServicerTransfer: transfer, masterServicerReturn: back,
      workoutStrategy: l.workoutstrategycode || null, modified: bool(l.modifiedindicator) === true || !!l.modificationcode, modificationCode: l.modificationcode || null,
      lastModification: date(l.lastmodificationdate), payoffCode: l.liquidationprepaymentcode || null, payoffDate: date(l.liquidationprepaymentdate),
      interestOnly: bool(l.interestonlyindicator), amortizationMonths: num(l.originalamortizationtermnumber), servicer: organizationOrNull(l.primaryservicername),
      propertyCount: Math.max(properties.length, num(l.numberproperties) ?? 0),
    };
    properties.forEach((p, i) => {
      if (String(p.propertytypecode ?? '').toUpperCase() !== 'MF') return;
      records.push({
        ...loan, propertyIndex: i, propertyName: p.propertyname || null, address: p.propertyaddress || null, city: p.propertycity || null,
        state: (p.propertystate || '').toUpperCase() || null, zip: zip5(p.propertyzip), county: p.propertycounty || null,
        units: num(p.unitsbedsroomsnumber), yearBuilt: num(p.yearbuiltnumber),
        occupancyPct: pct(p.mostrecentphysicaloccupancypercentage), occupancyDate: date(p.mostrecentfinancialsenddate),
        dscrNcf: num(p.mostrecentdebtservicecoveragenetcashflowpercentage), dscrNoi: num(p.mostrecentdebtservicecoveragenetoperatingincomepercentage),
        valuationCents: money(p.mostrecentvaluationamount ?? p.valuationsecuritizationamount), valuationDate: date(p.mostrecentvaluationdate ?? p.valuationsecuritizationdate),
      });
    });
  }
  return { cmbs: true, loans, records };
}
/** Reg AB Schedule AL payment status codes. */
export const PAYMENT_STATUS = { 0: 'Current', 1: '30 to 59 days late', 2: '60 to 89 days late', 3: '90 days or more late', 4: 'Matured balloon, performing', 5: 'Matured balloon, not performing', A: 'In grace period', B: 'Late, under 30 days' };
export const PAYOFF_CODE = { 1: 'Partial liquidation', 2: 'Payoff before maturity', 3: 'Disposition', 4: 'Repurchase or substitution', 5: 'Full payoff at maturity', 6: 'Discounted payoff', 7: 'Liquidation', 8: 'Payoff with penalty', 9: 'Payoff with yield maintenance', 10: 'Curtailment with penalty', 11: 'Curtailment with yield maintenance' };
