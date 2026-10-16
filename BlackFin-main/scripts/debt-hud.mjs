// HUD FHA-insured multifamily mortgages: the monthly active (FHA-BF90-RM-A) and terminated (FHA-BF90-RM-T) workbooks,
// stored nationally. Property names, cities and ZIPs identify the project; holder and servicer are institutions.
// No street address, no borrower and no person is in either file.
import path from 'node:path';
import { readFirstSheet } from './oz2027-lib.mjs';
import { CACHE, cachedFetch, cents, isoDate, organizationOrNull, zip5 } from './debt-lib.mjs';

export const HUD_SOURCES = {
  active: 'https://www.hud.gov/sites/default/files/Housing/documents/FHA-BF90-RM-A.xlsx',
  terminated: 'https://www.hud.gov/sites/default/files/Housing/documents/FHA-BF90-RM-T.xlsx',
};
const REQUIRED = ['HUD PROJECT NUMBER', 'PROPERTY NAME', 'PROPERTY CITY', 'PROPERTY STATE', 'PROPERTY ZIP', 'UNITS', 'ORIGINAL MORTGAGE AMOUNT', 'MATURITY DATE', 'INTEREST RATE', 'HOLDER NAME', 'SERVICER NAME', 'SECTION OF ACT CODE', 'BUSINESS_TYPE'];
const num = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
// Workbook dates arrive as ISO text or as Excel serial days.
const date = v => { const s = String(v ?? '').trim(); if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000).toISOString().slice(0, 10); return isoDate(s); };

export async function loadHud() {
  const out = { receipts: [], loans: [] };
  for (const [status, url] of Object.entries(HUD_SOURCES)) {
    const { bytes, receipt } = await cachedFetch(url, path.join(CACHE, 'hud', path.basename(url)), { note: `HUD FHA multifamily ${status}` });
    out.receipts.push({ ...receipt, status });
    const rows = readFirstSheet(bytes);
    const headerAt = rows.findIndex(r => r?.includes('HUD PROJECT NUMBER'));
    if (headerAt < 0) throw new Error(`HUD ${status}: no header row.`);
    const header = rows[headerAt].map(h => String(h ?? '').trim());
    const col = name => header.findIndex(h => h.toUpperCase() === name.toUpperCase());
    for (const name of REQUIRED) if (col(name) < 0) throw new Error(`HUD ${status}: missing column ${name}.`);
    const get = (r, name) => { const i = col(name); return i < 0 ? '' : (r[i] ?? ''); };
    for (const r of rows.slice(headerAt + 1)) {
      const project = String(get(r, 'HUD PROJECT NUMBER')).trim();
      if (!/^\d{8}$/.test(project.padStart(8, '0'))) continue;
      out.loans.push({
        status, project: project.padStart(8, '0'),
        propertyName: String(get(r, 'PROPERTY NAME')).trim() || null, city: String(get(r, 'PROPERTY CITY')).trim() || null,
        state: String(get(r, 'PROPERTY STATE')).trim() || null, zip: zip5(get(r, 'PROPERTY ZIP')),
        units: num(get(r, 'UNITS')) === null ? null : Math.round(num(get(r, 'UNITS'))),
        initialEndorsement: date(get(r, 'INITIAL ENDORSEMENT DATE')), finalEndorsement: date(get(r, 'FINAL ENDORSEMENT DATE')),
        originalAmountCents: cents(get(r, 'ORIGINAL MORTGAGE AMOUNT')), firstPayment: date(get(r, 'FIRST PAYMENT DATE')), maturity: date(get(r, 'MATURITY DATE')),
        termMonths: num(get(r, 'TERM IN MONTHS')) === null ? null : Math.round(num(get(r, 'TERM IN MONTHS'))), ratePct: num(get(r, 'INTEREST RATE')),
        monthlyPaymentCents: status === 'active' ? cents(get(r, 'CURRENT PRINCIPAL AND INTEREST')) : null,
        balanceCents: status === 'active' ? cents(get(r, 'AMORITIZED PRINCIPAL BALANCE')) : null,
        holder: organizationOrNull(get(r, 'HOLDER NAME')), servicer: organizationOrNull(get(r, 'SERVICER NAME')),
        sectionCode: String(get(r, 'SECTION OF ACT CODE')).trim() || null, sectionCategory: String(get(r, 'SOA CATEGORY/SUB CATEGORY') || get(r, 'SOA CATEGORY/Sub Category')).trim() || null,
        businessType: String(get(r, 'BUSINESS_TYPE')).trim() || null,
        terminationType: status === 'terminated' ? String(get(r, 'TERMINATION TYPE DESCRIPTION')).trim() || null : null,
        claim: status === 'terminated' ? (/^CLAIM$/i.test(String(get(r, 'TYPE (Claim/Non Claim)')).trim()) ? true : /NON/i.test(String(get(r, 'TYPE (Claim/Non Claim)'))) ? false : null) : null,
        terminated: status === 'terminated' ? date(get(r, 'TERM_DATE')) : null,
      });
    }
  }
  return out;
}
