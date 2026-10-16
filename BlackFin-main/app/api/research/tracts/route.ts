import { researchResponse } from '../../../../lib/research/http';
import { researchTracts } from '../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>researchTracts(new URL(request.url).searchParams.get('snapshot')??''));}
