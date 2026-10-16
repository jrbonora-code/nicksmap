import { researchResponse } from '../../../../../lib/research/http';
import { researchCmbsLoan } from '../../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>{const p=new URL(request.url).searchParams;return researchCmbsLoan(p.get('run')??'',Number(p.get('seq')??'-1'));});}
