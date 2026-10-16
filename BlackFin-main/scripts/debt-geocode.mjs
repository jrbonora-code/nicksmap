// Points for CMBS loans outside the property data: the Census Bureau's batch geocoder for the property address (approved
// October 16, 2026; commercial property addresses only), and the Census ZCTA gazetteer's ZIP centroid when the
// geocoder finds no match. Results are cached by the address set's hash.
import fs from 'node:fs/promises';
import path from 'node:path';
import { unzip, parseCsv } from './oz2027-lib.mjs';
import { CACHE, cachedFetch, sha256 } from './debt-lib.mjs';

const BATCH = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
const ZCTA = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip';
const csvCell = v => `"${String(v ?? '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ')}"`;

export async function zipCentroids() {
  const { bytes, receipt } = await cachedFetch(ZCTA, path.join(CACHE, 'census', path.basename(ZCTA)), { immutable: true, note: 'Census 2024 ZCTA gazetteer' });
  const get = unzip(bytes);
  const name = get.names().find(n => n.endsWith('.txt'));
  const lines = get(name).toString('utf8').trim().split(/\r?\n/);
  const header = lines[0].split('\t').map(h => h.trim());
  const [g, lat, lon] = ['GEOID', 'INTPTLAT', 'INTPTLONG'].map(h => header.indexOf(h));
  const map = new Map(lines.slice(1).map(l => { const f = l.split('\t'); return [f[g].trim(), [Number(f[lon]), Number(f[lat])]]; }));
  return { map, receipt };
}
/** Geocode records ({id, address, city, state, zip}) in batches of 2,000; returns id -> [lon, lat] for matches. */
export async function batchGeocode(records) {
  const out = new Map(), receipts = [];
  for (let i = 0; i < records.length; i += 2000) {
    const chunk = records.slice(i, i + 2000);
    const csv = chunk.map(r => [r.id, r.address, r.city, r.state, r.zip].map(csvCell).join(',')).join('\n');
    const key = sha256(csv);
    const file = path.join(CACHE, 'census', 'geocode', `${key}.csv`);
    let text;
    try { text = await fs.readFile(file, 'utf8'); } catch {
      const form = new FormData();
      form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
      form.append('benchmark', 'Public_AR_Current');
      const response = await fetch(BATCH, { method: 'POST', body: form, headers: { 'User-Agent': 'BlackFin research (public records)' }, signal: AbortSignal.timeout(600000) });
      if (!response.ok) throw new Error(`Census geocoder: HTTP ${response.status}`);
      text = await response.text();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text);
    }
    receipts.push({ url: BATCH, addresses: chunk.length, sha256: sha256(text), inputSha256: key });
    for (const row of parseCsv(text)) {
      if (row[2] !== 'Match') continue;
      const [lon, lat] = (row[5] ?? '').split(',').map(Number);
      if (Number.isFinite(lon) && Number.isFinite(lat)) out.set(row[0], [lon, lat]);
    }
  }
  return { points: out, receipts };
}
