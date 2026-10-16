import { debtAmountWarnings, usableRecordedAmount } from './debt.ts';
import { financingThreshold, ResearchValidationError } from './finance.ts';
import type { ResearchProperty, Scenario } from './types.ts';

export function prepareSelection(p:ResearchProperty,selected:{debtId:string|null;principalCents:number;amountBasis?:string},s:Scenario) {
  const d=p.mortgages.find(d=>d.id===selected.debtId);
  if(selected.debtId&&!d)throw new ResearchValidationError('Selected instrument is unavailable.');
  const amountBasis=selected.amountBasis??(d?.amountCents===selected.principalCents?'original_recorded_amount':'analyst_target');
  if(!['original_recorded_amount','analyst_target'].includes(amountBasis))throw new ResearchValidationError('Invalid scenario amount basis.');
  if(amountBasis==='original_recorded_amount'&&(!d||!usableRecordedAmount(d)||d.amountCents!==selected.principalCents))
    throw new ResearchValidationError('This recorded amount cannot supply a scenario. Enter an explicit analyst target or select a qualified instrument.');
  return {propertyId:p.id,debtId:d?.id??null,principalCents:selected.principalCents,amountBasis,sourceId:d?.sourceId??p.sourceId,
    basisVersion:'debt-basis-2',warnings:d?debtAmountWarnings(d):[],result:financingThreshold(selected.principalCents,s)};
}
