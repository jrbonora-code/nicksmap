import { debtAmountWarnings } from './debt.ts';
import { bestBalance } from './balance-estimate.ts';
import { addMonths, maturityWall } from './maturity-wall.ts';
import { inSpecialServicing, releasedVerified } from './debt-sources.ts';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { financingThreshold, isDate, ResearchValidationError, scenarioBase, validateScenario } from './finance.ts';
import type { ResearchProperty, ResearchQuery, ResearchResult, Scenario, ScreenRow, DebtRecord } from './types.ts';
export const emptyQuery:ResearchQuery={ids:null,text:'',county:'',lender:'',ownership:'',debt:'all',match:'all',oz:'all',maturityBefore:'',maturityAfter:'',beforeScenarioDate:false,minAmount:null,maxAmount:null,minUnits:null,maxUnits:null,bounds:null,area:null,within24:false,balanceSource:'',realBalance:false,specialServicing:false,releasedVerified:false,sort:'address',direction:'asc'};
export function validateQuery(input:unknown):ResearchQuery {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new ResearchValidationError('Invalid research query.');
  if(Object.keys(input).some(k=>!(k in emptyQuery))) throw new ResearchValidationError('Unknown query field.');
  const q={...emptyQuery,...input} as ResearchQuery;
  if([q.beforeScenarioDate,q.within24,q.realBalance,q.specialServicing,q.releasedVerified].some(v=>typeof v!=='boolean')) throw new ResearchValidationError('Invalid filter switch.');
  if(q.ids!==null&&(!Array.isArray(q.ids)||q.ids.length>500||Array.from(q.ids).some(id=>typeof id!=='string'||!/^reapi:[\w-]{1,80}$/.test(id))||new Set(q.ids).size!==q.ids.length)) throw new ResearchValidationError('Property IDs must be unique provider IDs, with at most 500 selected.');
  for(const k of ['text','county','lender','ownership','maturityBefore','maturityAfter'] as const) if(typeof q[k]!=='string'||q[k].length>180) throw new ResearchValidationError('Invalid filter text.');
  if(q.county&&!/^12\d{3}$/.test(q.county)) throw new ResearchValidationError('Invalid county.');
  for(const d of [q.maturityBefore,q.maturityAfter]) if(d&&!isDate(d)) throw new ResearchValidationError('Use a valid calendar date.');
  if(q.maturityBefore&&q.maturityAfter&&q.maturityAfter>q.maturityBefore) throw new ResearchValidationError('Maturity range is reversed.');
  for(const [k,options] of Object.entries({debt:['all','reported','missing'],match:['all','strict','review'],oz:['all','eligible','not_in_list','unmapped'],balanceSource:['','servicer','provider_estimate','estimate','recorded','none'],sort:['address','countyName','providerUnits','amount','maturity','requiredNoi','requiredValue','balance','lender'],direction:['asc','desc']})) if(!options.includes(q[k as keyof ResearchQuery] as string)) throw new ResearchValidationError('Invalid filter choice.');
  for(const k of ['minAmount','maxAmount','minUnits','maxUnits'] as const) if(q[k]!==null&&(typeof q[k]!=='number'||!Number.isFinite(q[k])||q[k]!<0||q[k]!>1e12)) throw new ResearchValidationError('Invalid numeric filter.');
  if(q.minAmount!==null&&q.maxAmount!==null&&q.minAmount>q.maxAmount || q.minUnits!==null&&q.maxUnits!==null&&q.minUnits>q.maxUnits) throw new ResearchValidationError('Numeric range is reversed.');
  if(q.bounds!==null && (!Array.isArray(q.bounds)||q.bounds.length!==4||q.bounds.some(n=>typeof n!=='number'||!Number.isFinite(n))||q.bounds[0]<-180||q.bounds[2]>180||q.bounds[1]<-90||q.bounds[3]>90||q.bounds[0]>=q.bounds[2]||q.bounds[1]>=q.bounds[3])) throw new ResearchValidationError('Invalid map bounds.');
  // First release draws rectangles; reject arbitrary polygon input rather than guessing topology.
  if(q.area!==null) throw new ResearchValidationError('Use rectangular area selection in this release.');
  return q;
}
const includes=(a:string|null,b:string)=>!b||(a??'').toLowerCase().includes(b.toLowerCase());
export function screenProperties(properties:ResearchProperty[],query:ResearchQuery,scenario:Scenario) {
  const q=validateQuery(query),s=validateScenario(scenario);
  const ids=q.ids===null?null:new Set(q.ids);
  const through24=addMonths(s.asOf,24);
  const rows:ScreenRow[]=properties.filter(p=>{
    if(ids&&!ids.has(p.id)) return false;
    if(!includes([p.address,p.providerId,p.apn,...p.flags].join(' '),q.text)||!includes(p.owner,q.ownership)||q.county&&p.countyFips!==q.county) return false;
    if(q.debt==='reported'&&!p.mortgages.length||q.debt==='missing'&&p.mortgages.length) return false;
    if(q.match==='strict'&&!p.strictAddress||q.match==='review'&&!p.needsReview) return false;
    if(q.oz!=='all'&&(q.oz==='unmapped'?!['unmapped','ambiguous'].includes(p.oz):p.oz!==q.oz)) return false;
    if(q.bounds) {
      if(p.longitude===null||p.latitude===null) return false;
      const [w,so,e,n]=q.bounds;
      const polygon={type:'Polygon' as const,coordinates:[[[w,so],[e,so],[e,n],[w,n],[w,so]]]};
      if(!booleanPointInPolygon([p.longitude,p.latitude],polygon)) return false;
    }
    if(q.minUnits!==null&&(p.providerUnits===null||p.providerUnits<q.minUnits)||q.maxUnits!==null&&(p.providerUnits===null||p.providerUnits>q.maxUnits)) return false;
    if(q.within24&&!p.mortgages.some(d=>d.maturity!==null&&d.maturity>=s.asOf&&d.maturity<=through24)) return false;
    if(q.balanceSource&&(bestBalance(p,s.asOf)?.source??'none')!==q.balanceSource) return false;
    if(q.realBalance&&bestBalance(p,s.asOf)?.source!=='servicer'||q.specialServicing&&!inSpecialServicing(p.servicer)||q.releasedVerified&&!releasedVerified(p.servicer)) return false;
    // All debt predicates must be satisfied by the SAME source record.
    if(q.beforeScenarioDate||q.lender||q.maturityAfter||q.maturityBefore||q.minAmount!==null||q.maxAmount!==null) return p.mortgages.some(d=>
      includes(d.lender,q.lender)&&(!q.beforeScenarioDate||d.maturity!==null&&d.maturity<s.asOf)&&(!q.maturityAfter||d.maturity!==null&&d.maturity>=q.maturityAfter)&&(!q.maturityBefore||d.maturity!==null&&d.maturity<=q.maturityBefore)&&
      (q.minAmount===null||d.amountCents!==null&&d.amountCents>=q.minAmount*100)&&(q.maxAmount===null||d.amountCents!==null&&d.amountCents<=q.maxAmount*100));
    return true;
  }).map(p=>{const base=scenarioBase(p.mortgages);return {...p,scenarioDebt:base,scenarioResult:base?financingThreshold(base.amountCents!,s):null,earliestMaturity:p.mortgages.map(d=>d.maturity).filter((d):d is string=>!!d).sort()[0]??null,balance:bestBalance(p,s.asOf,base)};});
  const sortValue=(p:ScreenRow)=>q.sort==='balance'?p.balance?.cents??null:q.sort==='lender'?p.scenarioDebt?.lender??p.mortgages.find(d=>d.lender)?.lender??null:q.sort==='amount'?p.scenarioDebt?.amountCents??null:q.sort==='maturity'?p.earliestMaturity:q.sort==='requiredNoi'?p.scenarioResult?.requiredNoiCents??null:q.sort==='requiredValue'?p.scenarioResult?.requiredValueCents??null:p[q.sort];
  rows.sort((a,b)=>{const av=sortValue(a),bv=sortValue(b);if(av===null)return bv===null?a.id.localeCompare(b.id):1;if(bv===null)return -1;const c=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv));return (q.direction==='asc'?c:-c)||a.id.localeCompare(b.id);});
  return rows;
}
export function summarize(rows:ScreenRow[],s:Scenario):Pick<ResearchResult,'coverage'|'lenders'|'maturityBuckets'|'maturityWall'|'balanceCoverage'|'debtCoverage'> {
  const entries=rows.flatMap(p=>p.mortgages.map(d=>({d,p:p.id})));
  const groups=new Map<string,{d:DebtRecord,properties:Set<string>}>();
  for(const {d,p} of entries) if(d.instrumentKey&&debtAmountWarnings(d).length===0) {const g=groups.get(d.instrumentKey)??{d,properties:new Set<string>()};g.properties.add(p);groups.set(d.instrumentKey,g);}
  const lenders=new Map<string,{name:string,instrumentGroups:number,properties:Set<string>,recordedAmountCents:number,datedMaturities:number}>();
  for(const {d,properties} of groups.values()) {const name=d.lender??'Lender not reported';const l=lenders.get(name)??{name,instrumentGroups:0,properties:new Set<string>(),recordedAmountCents:0,datedMaturities:0};l.instrumentGroups++;l.recordedAmountCents+=d.amountCents??0;l.datedMaturities+=d.maturity?1:0;for(const p of properties)l.properties.add(p);lenders.set(name,l);}
  const asOf=Date.parse(s.asOf),year=365.25*86400000;
  const bucket=(date:string|null)=>date===null?'Not reported':Date.parse(date)<asOf?'Before scenario date':Date.parse(date)<=asOf+year?'Next 12 months':Date.parse(date)<=asOf+3*year?'1–3 years':'Beyond 3 years';
  const labels=['Before scenario date','Next 12 months','1–3 years','Beyond 3 years','Not reported'];
  return {coverage:{mortgageProperties:rows.filter(r=>r.mortgages.length).length,mortgageEntries:entries.length,maturityEntries:entries.filter(x=>x.d.maturity).length,positiveRateEntries:entries.filter(x=>Number(x.d.reportedRate)>0).length,strictProperties:rows.filter(r=>r.strictAddress).length,eligibleProperties:rows.filter(r=>r.oz==='eligible').length,scenarioProperties:rows.filter(r=>r.scenarioResult).length,unresolvedInstrumentEntries:entries.filter(x=>!x.d.instrumentKey||debtAmountWarnings(x.d).length>0).length,sharedInstrumentGroups:[...groups.values()].filter(x=>x.d.sharedPropertyCount>1).length},
    lenders:[...lenders.values()].map(l=>({...l,properties:l.properties.size})).sort((a,b)=>b.instrumentGroups-a.instrumentGroups||a.name.localeCompare(b.name)),
    maturityBuckets:labels.map(label=>({label,entries:entries.filter(x=>bucket(x.d.maturity)===label).length,instrumentGroups:[...groups.values()].filter(x=>bucket(x.d.maturity)===label).length})),
    maturityWall:maturityWall(rows,s.asOf),
    balanceCoverage:balanceCoverage(rows),
    debtCoverage:{runId:rows.find(r=>r.servicer)?.servicer?.runId??null,hud:rows.filter(r=>r.servicer?.hud.length).length,cmbs:rows.filter(r=>r.servicer?.cmbs.length).length,release:rows.filter(r=>r.servicer?.releases.length).length,specialServicing:rows.filter(r=>inSpecialServicing(r.servicer)).length,released:rows.filter(r=>releasedVerified(r.servicer)).length}};
}
/** Properties by the source of their balance figure; 'none' counts only properties with mortgage entries. */
export function balanceCoverage(rows:ScreenRow[]):ResearchResult['balanceCoverage'] {
  const out:ResearchResult['balanceCoverage']={servicer:0,provider_estimate:0,estimate:0,recorded:0,none:0};
  for(const r of rows) if(r.balance) out[r.balance.source]++; else if(r.mortgages.length) out.none++;
  return out;
}
