import { researchResponse,jsonParameter } from '../../../lib/research/http';
import { researchQuery } from '../../../lib/research/service';
import { defaultScenario } from '../../../lib/research/finance';
import { emptyQuery } from '../../../lib/research/query';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>{const url=new URL(request.url);return researchQuery(jsonParameter(url,'q',emptyQuery),jsonParameter(url,'s',defaultScenario()),url.searchParams.get('snapshot')??undefined);});}
