import { researchResponse } from '../../../../lib/research/http';
import { researchHistory } from '../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(){return researchResponse(researchHistory);}
