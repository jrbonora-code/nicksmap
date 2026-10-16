import { researchResponse,jsonBody } from '../../../../../lib/research/http';
import { identity } from '../../../../../lib/research/service';
import { getStrategyCase,saveStrategyCaseVersion } from '../../../../../lib/research/case-service';
import { ResearchValidationError } from '../../../../../lib/research/finance';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){return researchResponse(async()=>{const found=await getStrategyCase((await params).id);if(!found)throw new ResearchValidationError('This case is unavailable in the current workspace.');return found;});}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return researchResponse(async()=>{await identity();return saveStrategyCaseVersion((await params).id,await jsonBody(request,120000));});}
