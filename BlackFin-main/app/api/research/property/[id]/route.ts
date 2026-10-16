import { researchResponse } from '../../../../../lib/research/http';
import { researchDetail } from '../../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return researchResponse(async()=>researchDetail((await params).id,new URL(request.url).searchParams.get('snapshot')??''));}
