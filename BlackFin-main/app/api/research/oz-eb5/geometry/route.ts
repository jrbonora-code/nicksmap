import { researchCacheableResponse } from '../../../../../lib/research/http';
import { ozEb5GeometryCached } from '../../../../../lib/research/oz-eb5-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){const params=new URL(request.url).searchParams;return researchCacheableResponse(()=>ozEb5GeometryCached(params.get('state'),params.get('run')));}
