import { researchResponse,jsonBody } from '../../../../lib/research/http';
import { identity,savedAnalyses,saveAnalysis } from '../../../../lib/research/service';
export const dynamic='force-dynamic';
export async function GET(){return researchResponse(savedAnalyses);}
export async function POST(request:Request){return researchResponse(async()=>{await identity();return saveAnalysis(await jsonBody(request,20000));});}
