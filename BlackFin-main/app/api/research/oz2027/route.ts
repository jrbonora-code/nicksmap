import { researchResponse } from '../../../../lib/research/http';
import { oz2027Tracts } from '../../../../lib/research/oz2027-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>oz2027Tracts(new URL(request.url).searchParams));}
