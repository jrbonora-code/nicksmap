import { researchResponse } from '../../../../../lib/research/http';
import { ozEb5Tract } from '../../../../../lib/research/oz-eb5-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>ozEb5Tract(new URL(request.url).searchParams.get('geoid')));}
