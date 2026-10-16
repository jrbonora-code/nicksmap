import 'server-only';
import { WorkspaceUnavailableError, WorkspaceValidationError } from '../workspace/errors';
import { ResearchValidationError } from './finance';
import { ResearchUnauthorized } from './service';
const NO_STORE={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
// A run's rows never change, so a response for an explicitly named current run may be cached by this browser only.
const IMMUTABLE={'Cache-Control':'private, max-age=31536000, immutable','Vary':'Cookie'};
function failure(e:unknown){
  const headers=NO_STORE;
  if(e instanceof ResearchUnauthorized)return Response.json({error:'Sign in to the private workspace.'},{status:401,headers});
  if(e instanceof ResearchValidationError)return Response.json({error:e.message},{status:400,headers});
  if(e instanceof WorkspaceValidationError)return Response.json({error:e.message,fields:e.fields},{status:400,headers});
  if(e instanceof WorkspaceUnavailableError)return Response.json({error:e.message},{status:503,headers});
  console.error('Research request unavailable.');return Response.json({error:'Research data is temporarily unavailable. Retry; your saved observations are retained.'},{status:503,headers});
}
export async function researchResponse(run:()=>Promise<unknown>){
  try{return Response.json(await run(),{headers:NO_STORE});}
  catch(e){return failure(e);}
}
/** As researchResponse, but the service decides whether the body is immutable (it names the current, append-only run). */
export async function researchCacheableResponse(run:()=>Promise<{body:unknown;immutable:boolean}>){
  try{const {body,immutable}=await run();return Response.json(body,{headers:immutable&&body!==null?IMMUTABLE:NO_STORE});}
  catch(e){return failure(e);}
}
export function jsonParameter(url:URL,key:string,fallback:unknown){const v=url.searchParams.get(key);if(!v)return fallback;if(v.length>16000)throw new ResearchValidationError('Query is too large.');try{return JSON.parse(v);}catch{throw new ResearchValidationError('Invalid query encoding.');}}
/** Same-origin JSON body for workspace writes; the configured auth origin is the only accepted origin. */
export async function jsonBody(request:Request,maxBytes:number){
  const origin=process.env.BETTER_AUTH_URL;
  if(!origin||request.headers.get('origin')!==new URL(origin).origin)throw new ResearchValidationError('A same-origin workspace request is required.');
  if(Number(request.headers.get('content-length')??0)>maxBytes)throw new ResearchValidationError('Request is too large.');
  const text=await request.text();if(text.length>maxBytes)throw new ResearchValidationError('Request is too large.');
  try{return JSON.parse(text) as unknown;}catch{throw new ResearchValidationError('Invalid request JSON.');}
}
