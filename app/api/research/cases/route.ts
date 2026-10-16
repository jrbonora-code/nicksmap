import { researchResponse,jsonBody } from '../../../../lib/research/http';
import { identity } from '../../../../lib/research/service';
import { createStrategyCase,listStrategyCases } from '../../../../lib/research/case-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return researchResponse(()=>listStrategyCases(new URL(request.url).searchParams.get('property')??undefined));}
export async function POST(request:Request){return researchResponse(async()=>{await identity();return createStrategyCase(await jsonBody(request,120000));});}
