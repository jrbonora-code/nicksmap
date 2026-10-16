import { usableRecordedAmount } from './debt.ts';
import { monthlyPayment } from '../finance/screening.ts';
import type { Scenario, ThresholdResult, DebtRecord } from './types.ts';

export const MODEL_VERSION = 'threshold-1' as const;
export class ResearchValidationError extends Error {}
export const isDate = (v:unknown):v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const scenarioDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/** New defaults use the workspace's Eastern calendar date, independent of host timezone. */
export function defaultScenario(now:Date = new Date()):Scenario {
  const parts = scenarioDateFormatter.formatToParts(now);
  const asOf = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
  return {version:MODEL_VERSION,asOf,annualRate:.065,amortizationMonths:360,termMonths:60,minDscr:1.25,minDebtYield:.08,maxLtv:.65,annualReserveCents:0,interestOnly:false};
}
export function validateScenario(value:unknown):Scenario {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new ResearchValidationError('Supply scenario assumptions.');
  const s=value as Scenario;
  if (Object.keys(s).sort().join()!==Object.keys(defaultScenario()).sort().join() || s.version!==MODEL_VERSION || !isDate(s.asOf) || typeof s.interestOnly!=='boolean') throw new ResearchValidationError('Invalid scenario version, date or fields.');
  for (const [key,min,max,integer] of [
    ['annualRate',0,.5,false],['amortizationMonths',1,600,true],['termMonths',1,600,true],
    ['minDscr',.1,5,false],['minDebtYield',.001,1,false],['maxLtv',.01,1,false],['annualReserveCents',0,1e12,true]
  ] as const) {
    const n=s[key];
    if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n))) throw new ResearchValidationError(`Invalid ${key}.`);
  }
  if(!s.interestOnly && s.termMonths>s.amortizationMonths) throw new ResearchValidationError('Term cannot exceed amortization.');
  return s;
}

/** Monthly end-period P&I; nominal annual rate/12; reserves BELOW NOI. USD cents.
 * Thresholds are unrounded mathematical screen values, never observed operations or payoff.
 * Annual service is a 12-month run rate. IO is for the entire modeled term; no floating rates.
 */
export function financingThreshold(principalCents:number, input:Scenario):ThresholdResult {
  const s=validateScenario(input);
  if(!Number.isSafeInteger(principalCents)||principalCents<=0||principalCents>1e12) throw new ResearchValidationError('Scenario debt must be positive whole cents, at most USD 10 billion.');
  const payment=monthlyPayment({currency:'USD',principalCents,annualRate:s.annualRate,amortizationMonths:s.amortizationMonths});
  if(!payment.ok) throw new ResearchValidationError('Payment is outside the supported domain.');
  const monthly=s.interestOnly?principalCents*s.annualRate/12:payment.value.paymentCents;
  const annual=monthly*12;
  const dscr=annual*s.minDscr+s.annualReserveCents;
  const dy=principalCents*s.minDebtYield;
  // Reconstruct each monthly balance; no closed-form cancellation near zero rates.
  let balance=principalCents;
  if(!s.interestOnly) for(let i=0;i<s.termMonths;i++) balance=Math.max(0,balance+balance*s.annualRate/12-monthly);
  if(!s.interestOnly&&s.termMonths===s.amortizationMonths&&Math.abs(balance)<.01) balance=0;
  const result:ThresholdResult={modelVersion:MODEL_VERSION,principalCents,monthlyDebtServiceCents:monthly,annualDebtServiceCents:annual,
    requiredNoiDscrCents:dscr,requiredNoiDebtYieldCents:dy,requiredNoiCents:Math.max(dscr,dy),requiredValueCents:principalCents/s.maxLtv,
    balloonCents:balance,bindingIncomeConstraint:Math.abs(dscr-dy)<.000001?'Tied':dscr>dy?'DSCR after reserves':'Debt yield',
    actualNoi:null,actualPayoff:null,actualFundingGap:null};
  if(Object.values(result).some(v=>typeof v==='number'&&!Number.isFinite(v))) throw new ResearchValidationError('Nonfinite financial output.');
  return result;
}
export function scenarioBase(debts:DebtRecord[]):DebtRecord|null {
  // Never sum instruments, allocate shared collateral, or infer a current payoff.
  return debts.filter(d=>usableRecordedAmount(d)&&d.sharedPropertyCount===1)
    .sort((a,b)=>Number(b.position?.toLowerCase()==='first')-Number(a.position?.toLowerCase()==='first')||(b.recordingDate??'').localeCompare(a.recordingDate??'')||a.id.localeCompare(b.id))[0]??null;
}
