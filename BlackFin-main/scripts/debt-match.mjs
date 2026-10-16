// Property links for the loan sources, made against one research snapshot. Conservative by design: a "confirmed" link
// needs independent agreement (an exact instrument number; ZIP, street number and street; or ZIP, name and units); a
// weaker but specific agreement is "probable" and shown with that label; anything weaker is not linked. Borrower and
// owner names are compared in memory only and never written.
import { LENDER_NOISE, nameSimilarity, normalizeStreet, sameCity, zip5 } from './debt-lib.mjs';

const unitsClose = (a, b, tolerance) => a > 0 && b > 0 && Math.abs(a - b) <= tolerance * Math.max(a, b);
export function parseAddress(address) {
  const parts = String(address ?? '').split(',').map(s => s.trim());
  return { street: normalizeStreet(parts[0]), city: (parts.length > 2 ? parts[1] : '').toUpperCase(), zip: zip5(parts.at(-1)) };
}
/** The research properties in a form the matchers need, from a prepared research bundle. */
export function propertiesOf(bundle) {
  return bundle.records.filter(r => r.inRegion).map(r => ({
    id: r.id, countyFips: r.record.countyFips, ...parseAddress(r.record.address),
    units: [r.record.providerUnits, ...r.record.licensedUnits].filter(n => n > 0),
    names: [...new Set(r.detail.licenses.map(l => l.name).filter(Boolean))],
    owner: r.record.owner, mortgages: r.record.mortgages,
  }));
}

// ---------- HUD: name, city, ZIP and units (HUD has no street address) ----------
export function matchHud(loans, properties) {
  const byZip = new Map();
  for (const p of properties) if (p.zip) byZip.set(p.zip, [...(byZip.get(p.zip) ?? []), p]);
  const links = [];
  loans.forEach((loan, seq) => {
    // Apartments only: nursing homes, assisted living and hospitals are other HUD programmes.
    if (loan.state !== 'FL' || loan.businessType !== 'MF Residential' || !loan.zip || !byZip.has(loan.zip)) return;
    const scored = byZip.get(loan.zip).map(p => {
      const name = Math.max(0, ...p.names.map(n => nameSimilarity(loan.propertyName, n, { cities: [loan.city, p.city] })));
      const units = !loan.units || !p.units.length ? 'unknown' : p.units.some(u => unitsClose(u, loan.units, 0.02)) ? 'same' : p.units.some(u => unitsClose(u, loan.units, 0.1)) ? 'within 10%' : p.units.some(u => unitsClose(u, loan.units, 0.25)) ? 'within 25%' : 'differs';
      const city = sameCity(loan.city, p.city);
      const near = units === 'same' || units === 'within 10%';
      const confirmed = name >= 0.6 && near && (city || name >= 0.9);
      const probable = !confirmed && ((name >= 0.6 && units !== 'differs') || (name >= 0.5 && city && units === 'same'));
      return { p, name, units, city, tier: confirmed ? 2 : probable ? 1 : 0 };
    }).filter(s => s.tier > 0).sort((a, b) => b.tier - a.tier || b.name - a.name);
    if (!scored.length) return;
    const best = scored.filter(s => s.tier === scored[0].tier && s.name === scored[0].name);
    for (const s of best) links.push({ propertyId: s.p.id, source: 'hud', sourceKey: `hud:${seq}`, debtId: null,
      confidence: s.tier === 2 && best.length === 1 ? 'confirmed' : 'probable',
      method: 'HUD name, city, ZIP and units', detail: { nameScore: Math.round(s.name * 100) / 100, units: s.units, city: s.city, candidates: best.length } });
  });
  return links;
}

// ---------- CMBS: normalized street address and ZIP ----------
function numberIn(range, n) {
  const m = String(range ?? '').match(/^(\d+)\s*-\s*(\d+)/);
  return m ? Number(n) >= Number(m[1]) && Number(n) <= Number(m[2]) : false;
}
const tokenSet = street => [...new Set(street.split(' ').filter(Boolean))].sort().join(' ');
export function matchCmbs(records, properties) {
  const byZip = new Map();
  for (const p of properties) if (p.zip && p.street.number) byZip.set(p.zip, [...(byZip.get(p.zip) ?? []), p]);
  const links = [];
  records.forEach((r, seq) => {
    if (!r.zip || !byZip.has(r.zip) || !r.address) return;
    const a = normalizeStreet(r.address);
    const hits = byZip.get(r.zip).map(p => {
      const sameNumber = a.number !== null && (p.street.number === a.number || numberIn(r.address, p.street.number));
      if (!sameNumber) return null;
      // The same words in any order ("S Lake Meadow Cir" and "Lake Meadow Cir S") are the same street.
      if (a.street === p.street.street || tokenSet(a.street) === tokenSet(p.street.street)) return { p, tier: 2, how: 'ZIP, number and street' };
      const core = s => s.split(' ').find(w => !/^(N|S|E|W|NE|NW|SE|SW)$/.test(w) && w.length > 1) ?? '';
      return core(a.street) && core(a.street) === core(p.street.street) ? { p, tier: 1, how: 'ZIP, number and street name' } : null;
    }).filter(Boolean).sort((x, y) => y.tier - x.tier);
    if (!hits.length) return;
    const best = hits.filter(h => h.tier === hits[0].tier);
    for (const h of best) links.push({ propertyId: h.p.id, source: 'cmbs', sourceKey: `cmbs:${seq}`, debtId: null,
      confidence: h.tier === 2 && best.length === 1 ? 'confirmed' : 'probable', method: `CMBS ${h.how}`, detail: { candidates: best.length } });
  });
  return links;
}

// ---------- releases ----------
/**
 * Hillsborough releases cite the original instrument ("CLK # 2020135527"), which must equal a recorded mortgage's
 * document number in the same county: confirmed. Pinellas releases rarely cite one, so a release is probable only when
 * exactly one recorded mortgage fits: its lender matches the releasing party, the property's owner matches the released
 * party (both compared in memory), and the release was recorded after the mortgage.
 */
export function matchReleases(releases, properties) {
  const links = [];
  const byDoc = new Map();
  for (const p of properties) for (const d of p.mortgages) if (d.documentNumber) byDoc.set(`${p.countyFips}:${d.documentNumber.replace(/\D/g, '')}`, { p, d });
  const pinellas = properties.filter(p => p.countyFips === '12103' && p.owner);
  for (const r of releases) {
    const key = `${r.county}:${r.instrument}`;
    if (r.citedInstrument) {
      const hit = byDoc.get(`${r.county}:${r.citedInstrument}`);
      if (hit) links.push({ propertyId: hit.p.id, source: 'release', sourceKey: key, debtId: hit.d.id, confidence: 'confirmed', method: 'Release cites the recorded instrument', detail: { cited: r.citedInstrument } });
      continue;
    }
    if (r.county !== '12103' || !r.parties?.from.length || !r.parties.to.length) continue;
    const fits = [];
    for (const p of pinellas) {
      if (!r.parties.to.some(n => nameSimilarity(n, p.owner) >= 0.75)) continue;
      for (const d of p.mortgages) {
        if (!d.lender || !d.recordingDate || !r.recorded || r.recorded <= d.recordingDate) continue;
        if (r.parties.from.some(n => nameSimilarity(n, d.lender, { noise: LENDER_NOISE }) >= 0.6)) fits.push({ p, d });
      }
    }
    if (fits.length === 1) links.push({ propertyId: fits[0].p.id, source: 'release', sourceKey: key, debtId: fits[0].d.id, confidence: 'probable', method: 'Releasing lender, released owner and date', detail: {} });
  }
  return links;
}
