// Explicit, free Census acquisition. Never invoked at app startup or on a schedule.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const output = process.argv[2];
if (!output) throw new Error('Supply a private output directory.');
const base = 'https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/6';
const counties = ['015','021','057','071','081','103','115'];
await fs.mkdir(output, {recursive:true});
const metadata = await (await fetch(base+'?f=json')).json();
if (!metadata.description?.includes('January 1, 2020')) throw new Error('Unexpected Census geometry vintage.');
const sources=[];
for (const county of counties) {
  const query = new URLSearchParams({f:'geojson',where:`STATE='12' AND COUNTY='${county}'`,outFields:'GEOID,STATE,COUNTY,NAME',returnGeometry:'true',outSR:'4326',orderByFields:'GEOID',resultRecordCount:'10000'});
  const url = base+'/query?'+query;
  const file=path.join(output,`tracts-2020-12${county}.geojson`);
  let raw;
  try {raw=await fs.readFile(file);} catch {const response=await fetch(url,{signal:AbortSignal.timeout(90000)}); if(!response.ok) throw new Error(`Census HTTP ${response.status}`); raw=Buffer.from(await response.arrayBuffer()); await fs.writeFile(file,raw);}
  const geo=JSON.parse(raw);
  if(geo.type!=='FeatureCollection'||!geo.features?.length||geo.exceededTransferLimit||geo.properties?.exceededTransferLimit) throw new Error('Incomplete Census response.');
  const countQuery=new URLSearchParams({f:'json',where:`STATE='12' AND COUNTY='${county}'`,returnCountOnly:'true'});
  const count=await(await fetch(base+'/query?'+countQuery,{signal:AbortSignal.timeout(30000)})).json();
  if(count.count!==geo.features.length)throw new Error('Census geometry does not reconcile to source count.');
  if(geo.features.some(f=>f.properties.GEOID.slice(0,5)!=='12'+county)) throw new Error('County mismatch.');
  sources.push({countyFips:'12'+county,file:path.basename(file),url,sha256:createHash('sha256').update(raw).digest('hex'),features:geo.features.length,expectedCount:count.count,retrievedAt:(await fs.stat(file)).mtime.toISOString()});
  console.log(`2020 Census ${county}: ${geo.features.length} tracts`);
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({vintage:'2020-01-01',crs:'EPSG:4326',service:base,sources},null,2));
