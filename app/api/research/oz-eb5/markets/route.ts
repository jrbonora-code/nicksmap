import { researchResponse } from '../../../../../lib/research/http';
import { ozEb5Markets } from '../../../../../lib/research/oz-eb5-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>ozEb5Markets(new URL(request.url).searchParams.get('state')));}
