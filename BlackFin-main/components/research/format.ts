export const usd=(n:number|null|undefined,compact=false)=>n===null||n===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0,...(compact?{notation:'compact' as const}:{})}).format(n/100);
export const number=(n:number|null|undefined)=>n===null||n===undefined?'—':n.toLocaleString();
export const date=(d:string|null|undefined)=>d?d.slice(0,10):'—';
export const stamp=(d:string|null|undefined)=>d?d.replace('T',' ').slice(0,16)+' UTC':'—';
/** Short dollars for lists: $12.4M, $850K, $9,500. Never rounds a figure to zero. */
export const usdShort=(cents:number|null|undefined)=>{
  if(cents===null||cents===undefined)return '—';
  const d=cents/100,a=Math.abs(d);
  if(a>=1e9)return `$${(d/1e9).toFixed(a>=1e10?1:2)}B`;
  if(a>=1e6)return `$${(d/1e6).toFixed(a>=1e8?0:1)}M`;
  if(a>=1e4)return `$${Math.round(d/1e3)}K`;
  return `$${Math.round(d).toLocaleString('en-US')}`;
};
