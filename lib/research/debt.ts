import type { DebtRecord } from './types.ts';

/** Undefined metadata means an older parser discarded it; null means the provider did not report it. */
export function debtAmountWarnings(d:DebtRecord):string[] {
  const warnings:string[]=[];
  if(d.loanType===undefined) warnings.push('Loan qualification fields unavailable in this snapshot');
  if(/aggregate|multiple loan amounts/i.test(d.loanType??'')) warnings.push('Aggregate or multiple loan amount');
  if(/truncat|first (?:9|nine)[ -]digits|field length|multiply loan amount/i.test(d.loanType??'')) warnings.push('Truncated recorded amount');
  if(d.instrumentConflict) warnings.push('Conflicting instrument terms');
  if(d.possibleDuplicate) warnings.push('Possible duplicate facility across records');
  if(d.providerOpen===false) warnings.push('Provider history lists closed');
  return warnings;
}

export function usableRecordedAmount(d:DebtRecord):boolean {
  return debtAmountWarnings(d).length===0&&d.amountCents!==null&&Number.isSafeInteger(d.amountCents)&&d.amountCents>0&&d.amountCents<=1e12;
}

export function maturityLabel(maturity:string|null,asOf:string):string|null {
  return maturity&&maturity<asOf?'Reported maturity before scenario date':null;
}

export function debtBasisNotes(d:DebtRecord,asOf:string):string[] {
  return [...new Set([...debtAmountWarnings(d), ...(d.position?[`${d.position} lien (provider)`]:['Lien position not reported']),
    ...(d.loanType?[d.loanType]:[]), ...(maturityLabel(d.maturity,asOf)?[maturityLabel(d.maturity,asOf)!]:[]),
    d.providerOpen===true?'Provider history lists open':d.providerOpen===false?'Provider history lists closed':'Provider open status not reported'])];
}
