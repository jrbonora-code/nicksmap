// The Florida research view's Opportunity Zone reading. When a national 2027 run is imported (migration 009), a mapped
// property's 2020 tract is read against Treasury's revised eligible list of September 23, 2026 and carries the run's 2027
// tier and, where the tract overlaps a 2018 zone, the IRS Notice 2026-40 label; the snapshot's April appendix flag is
// used only when no run exists. Unmapped and ambiguous points stay unresolved. Kept apart from service.ts so the database
// test can exercise it without the identity boundary.
import type { PoolClient } from 'pg';
import { currentOz2027Run, notice202640Label, oz2027ForTracts, OZ2027_LAND_SHARE_THRESHOLD_PCT } from './oz2027.ts';
import type { OzBasis, ResearchProperty } from './types.ts';

export const APPENDIX_BASIS:OzBasis={source:'irs_rev_proc_2026_14_appendix',runId:null,label:'IRS Rev. Proc. 2026-14 appendix (April 2026), as saved in this snapshot'};
export const treasuryBasis=(runId:string):OzBasis=>({source:'treasury_2026_09_23',runId,label:'Treasury revised eligible list (September 23, 2026) with the 2027 status tiers'});
export async function ozOverlay(client:PoolClient,properties:ResearchProperty[]):Promise<{basis:OzBasis;properties:ResearchProperty[]}>{
  const run=await currentOz2027Run(client);
  if(!run)return {basis:APPENDIX_BASIS,properties:properties.map(p=>({...p,oz2027:null}))};
  const map=await oz2027ForTracts(client,run.id,[...new Set(properties.map(p=>p.tractId).filter((t):t is string=>!!t))]);
  return {basis:treasuryBasis(run.id),properties:properties.map(p=>{
    if(!p.tractId)return {...p,oz2027:null};
    const z=map.get(p.tractId);
    if(!z)return {...p,oz:'not_in_list' as const,rural:false,oz2027:null};
    const in2018Zone=z.overlap2018LandPct>=OZ2027_LAND_SHARE_THRESHOLD_PCT;
    return {...p,oz:'eligible' as const,rural:z.rural,oz2027:{status:z.status,confidence:z.confidence,rural:z.rural,overlap2018LandPct:z.overlap2018LandPct,inAprilAppendix:z.inAprilAppendix,notice:in2018Zone?notice202640Label(p.tractId.slice(0,2)):null}};
  })};
}
