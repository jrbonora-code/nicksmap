import type { DebtRecord, PropertyDetail, ProviderEstimate } from './types.ts';
type Raw=Record<string,unknown>;
const object=(v:unknown):Raw=>v&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const text=(v:unknown):string|null=>typeof v==='string'&&v.trim()?v.trim():typeof v==='number'&&Number.isFinite(v)?String(v):null;
const date=(v:unknown):string|null=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)&&Number.isFinite(Date.parse(v))?v.slice(0,10):null;

export function loanMetadata(raw:Raw,history:unknown[]=[]) {
  // Only an exact, unique provider mortgage ID can supply the history open flag.
  const matches=raw.mortgageId==null?[]:history.map(object).filter(h=>h.mortgageId===raw.mortgageId);
  const open=typeof raw.open==='boolean'?raw.open:matches.length===1?matches[0].open:null;
  return {loanType:text(raw.loanType),position:text(raw.position),lenderType:text(raw.lenderType),lenderCode:text(raw.lenderCode),
    providerMortgageId:text(raw.mortgageId),providerOpen:typeof open==='boolean'?open:null,
    openSourcePath:typeof raw.open==='boolean'?'open':matches.length===1&&typeof open==='boolean'?`mortgageHistory[${history.indexOf(matches[0])}].open`:null,
    assumable:typeof raw.assumable==='boolean'?raw.assumable:null};
}

export function mortgageHistory(raw:Raw,propertyId:string,sourceId:string):DebtRecord[] {
  if(!Array.isArray(raw.mortgageHistory)) return [];
  return raw.mortgageHistory.map((entry,sequence)=>{
    const r=object(entry),amount=typeof r.amount==='number'&&r.amount>0&&Number.isSafeInteger(Math.round(r.amount*100))?Math.round(r.amount*100):null;
    return {id:`${propertyId}:history:${sequence}`,sourceId,sequence,instrumentKey:null,lender:text(r.lenderName),amountCents:amount,
      recordingDate:date(r.recordingDate),documentDate:date(r.documentDate),maturity:date(r.maturityDate),documentNumber:text(r.documentNumber),
      reportedRate:text(r.interestRate),sharedPropertyCount:1,instrumentConflict:false,...loanMetadata(r)};
  });
}

/** Preserve raw values and the provider's period fields together; no conversion into operating inputs. */
export function providerFields(raw:Raw,sourceId:string):PropertyDetail['fields'] {
  const groups:Record<string,string[]>={
    'Tax (provider)':['taxInfo.assessedValue','taxInfo.assessmentYear','taxInfo.taxAmount','taxInfo.year','taxInfo.taxDelinquentYear'],
    'Last sale (provider)':['lastSale.saleAmount','lastSale.saleDate','lastSale.recordingDate','lastSaleDate','lastSalePrice'],
    'Hazard / foreclosure indicators (provider)':['floodZone','floodZoneType','floodZoneDescription','preForeclosure'],
    'Mortgage and equity estimates (provider)':['estimatedMortgageBalance','openMortgageBalance','estimatedEquity','equityPercent','estimatedMortgagePayment'],
    'Owner portfolio estimates (provider)':['linkedProperties.totalOwned','linkedProperties.totalMortgageBalance','linkedProperties.totalValue','linkedProperties.purchasedLast12mos'],
    'Area rent / income benchmarks (provider)':['demographics.hudAreaCode','demographics.hudAreaName','demographics.fmrYear','demographics.fmrEfficiency','demographics.fmrOneBedroom','demographics.fmrTwoBedroom','demographics.fmrThreeBedroom','demographics.fmrFourBedroom','demographics.medianIncome'],
    'Property classification / area (provider)':['MFH2to4','MFH5plus','propertyInfo.buildingSquareFeet','propertyInfo.livingSquareFeet','lotInfo.lotSquareFeet'],
  };
  const labels:Record<string,string>={assessedValue:'Assessed value USD',assessmentYear:'Assessment year',taxAmount:'Tax amount USD',year:'Tax year',taxDelinquentYear:'Reported delinquent tax year',saleAmount:'Sale amount USD',saleDate:'Sale date',recordingDate:'Recording date',lastSaleDate:'Last sale date (summary)',lastSalePrice:'Last sale price USD (summary)',totalOwned:'Linked properties count',totalMortgageBalance:'Estimated portfolio mortgage balance USD',totalValue:'Estimated portfolio value USD',purchasedLast12mos:'Reported purchases in prior 12 months',fmrYear:'Rent benchmark year',fmrEfficiency:'Efficiency FMR USD',fmrOneBedroom:'One-bedroom FMR USD',fmrTwoBedroom:'Two-bedroom FMR USD',fmrThreeBedroom:'Three-bedroom FMR USD',fmrFourBedroom:'Four-bedroom FMR USD',medianIncome:'Area median income USD',estimatedMortgageBalance:'Estimated mortgage balance USD',openMortgageBalance:'Open mortgage total USD (recorded amounts)',estimatedEquity:'Estimated equity USD',equityPercent:'Estimated equity %',estimatedMortgagePayment:'Estimated monthly payment USD',MFH2to4:'Provider 2-to-4-unit flag',MFH5plus:'Provider 5-plus-unit flag'};
  return Object.entries(groups).flatMap(([group,paths])=>paths.map(path=>{
    const value=path.split('.').reduce<unknown>((v,k)=>object(v)[k],raw);
    const key=path.split('.').at(-1)!;
    return {label:labels[key]??key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()),path,value:typeof value==='boolean'?String(value):text(value),sourceId,group};
  }));
}

export function markPossibleDuplicates(debts:(DebtRecord&{propertyId:string})[]) {
  const groups=new Map<string,(DebtRecord&{propertyId:string})[]>();
  for(const d of debts) {
    if(!d.lenderCode||!d.recordingDate||!d.amountCents)continue;
    const key=JSON.stringify([d.lenderCode,d.recordingDate,d.amountCents]);
    const list=groups.get(key)??[];list.push(d);groups.set(key,list);
  }
  for(const list of groups.values()) if(new Set(list.map(d=>d.propertyId)).size>1&&new Set(list.map(d=>d.instrumentKey)).size>1)
    for(const d of list)d.possibleDuplicate=true;
}

/** A positive dollar amount the provider may send as a number or a numeric string; zero and anything else read as not reported. */
function dollars(v:unknown):number|null {
  const n=typeof v==='number'?v:typeof v==='string'&&/^\s*\d+(\.\d+)?\s*$/.test(v)?Number(v):NaN;
  return Number.isFinite(n)&&n>0&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):null;
}
/** The provider's own mortgage and equity estimates, kept apart from the recorded instruments. Display only. */
export function providerEstimate(raw:Raw,sourceId:string,retrievedAt:string):ProviderEstimate|null {
  const e:ProviderEstimate={mortgageBalanceCents:dollars(raw.estimatedMortgageBalance),openMortgageCents:dollars(raw.openMortgageBalance),equityCents:dollars(raw.estimatedEquity),
    equityPercent:typeof raw.equityPercent==='number'&&Number.isFinite(raw.equityPercent)&&raw.equityPercent>0?raw.equityPercent:null,mortgagePaymentCents:dollars(raw.estimatedMortgagePayment),sourceId,retrievedAt};
  return e.mortgageBalanceCents===null&&e.openMortgageCents===null&&e.equityCents===null&&e.mortgagePaymentCents===null?null:e;
}
