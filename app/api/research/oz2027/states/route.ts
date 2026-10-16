import { researchResponse } from '../../../../../lib/research/http';
import { oz2027States } from '../../../../../lib/research/oz2027-service';
export const dynamic='force-dynamic';
export async function GET(){return researchResponse(()=>oz2027States());}
