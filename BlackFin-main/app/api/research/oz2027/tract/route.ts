import { researchResponse } from '../../../../../lib/research/http';
import { oz2027Tract } from '../../../../../lib/research/oz2027-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>oz2027Tract(new URL(request.url).searchParams.get('geoid')));}
