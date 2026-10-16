import { researchResponse } from '../../../../../lib/research/http';
import { ozEb5Assets } from '../../../../../lib/research/oz-eb5-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>ozEb5Assets(new URL(request.url).searchParams));}
