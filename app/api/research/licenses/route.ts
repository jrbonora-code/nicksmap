import { researchResponse } from '../../../../lib/research/http';
import { researchLicenses } from '../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>{const p=new URL(request.url).searchParams;return researchLicenses(p.get('snapshot')??'',p.get('text')??'',p.get('county')??'',p.get('unmatched')==='true');});}
