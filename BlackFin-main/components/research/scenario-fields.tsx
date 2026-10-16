'use client';
import { useEffect, useRef, useState } from 'react';
import type { Scenario } from '../../lib/research/types';
import { dollarsToCents } from '../../lib/workspace/money';
import { centsInput } from '../workspace/ui';

const FIELDS = [['annualRate','Rate %',100,.01],['minDscr','Min DSCR after reserves',1,.01],['minDebtYield','Min debt yield %',100,.1],['maxLtv','Max LTV %',100,1],['amortizationMonths','Amortization months',1,1],['termMonths','Term months',1,1]] as const;

/** One set of threshold-1 assumption inputs shared by the screener and the case editor.
 * Annual reserves are parsed as exact decimal dollars: dividing a float by 0.01 can produce
 * fractional cents (1234.56 / 0.01 = 123455.99999999999) that the scenario validator rejects. */
export function ScenarioFields({ value, onChange }: { value:Scenario; onChange:(next:Scenario)=>void }) {
  const [reserves, setReserves] = useState(centsInput(value.annualReserveCents));
  const [reserveError, setReserveError] = useState('');
  const seen = useRef(value.annualReserveCents);
  useEffect(() => {
    if (seen.current === value.annualReserveCents) return;
    seen.current = value.annualReserveCents; setReserves(centsInput(value.annualReserveCents)); setReserveError('');
  }, [value.annualReserveCents]);
  return <>
    <label><span>As of (Eastern time)</span><input type="date" required value={value.asOf} onChange={e => onChange({...value, asOf:e.target.value})} /></label>
    {FIELDS.map(([key, label, mult, step]) => <label key={key}><span>{label}</span><input type="number" step={step} min="0" required value={Number((value[key]*mult).toFixed(6))} onChange={e => onChange({...value, [key]: Number(e.target.value)/mult})} /></label>)}
    <label><span>Annual reserves USD</span><input inputMode="decimal" required value={reserves} aria-invalid={reserveError ? true : undefined} onChange={e => {
      setReserves(e.target.value);
      try {
        const cents = dollarsToCents(e.target.value);
        if (cents === null) throw new Error('Enter annual reserves in dollars, or 0.');
        seen.current = cents; setReserveError(''); onChange({...value, annualReserveCents:cents});
      } catch (error) { setReserveError(error instanceof Error ? error.message : 'Enter dollars with at most two decimals.'); }
    }} />{reserveError && <span className="field-error" role="alert">{reserveError}</span>}</label>
    <label><span>Payment basis</span><select value={value.interestOnly ? 'io' : 'amort'} onChange={e => onChange({...value, interestOnly: e.target.value === 'io'})}><option value="amort">Monthly amortizing</option><option value="io">Interest-only full term</option></select></label>
  </>;
}
