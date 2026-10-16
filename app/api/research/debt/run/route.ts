import { researchResponse } from '../../../../../lib/research/http';
import { researchDebtRun } from '../../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(){return researchResponse(()=>researchDebtRun());}
