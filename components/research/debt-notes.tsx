import type { DebtRecord } from '../../lib/research/types';
import { debtAmountWarnings, debtBasisNotes } from '../../lib/research/debt';
import { ContextBadge } from './context-note';

export function DebtNotes({debt,asOf}:{debt:DebtRecord;asOf:string}) {
  return <div className="inspector-context">{debtBasisNotes(debt,asOf).map(note=><ContextBadge key={note} label={note} tone="warning">Provider observation as of the saved source retrieval. Maturity and open status do not establish an outstanding obligation, default or release.</ContextBadge>)}
    {debtAmountWarnings(debt).length>0&&<span>Recorded amount excluded from financing thresholds and lender totals. An explicit analyst target remains separate.</span>}
  </div>;
}
