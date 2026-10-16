import { researchResponse } from '../../../../../lib/research/http';
import { ozEb5Site } from '../../../../../lib/research/oz-eb5-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  return researchResponse(()=>ozEb5Site(params.get('lat'),params.get('lon')));
}
