import type { Metadata } from 'next';
import { requireWorkspaceSession } from '../../../lib/auth/session';
import { ResearchWorkspace } from '../../../components/research/workspace';
export const metadata:Metadata={title:'Research'};
// The first render reads the URL so a shared link restores the view, filters, selected property and map position.
export default async function ResearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  await requireWorkspaceSession();
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams))if(typeof value==='string')params.set(key,value);
  return <ResearchWorkspace initialQuery={params.toString()}/>;
}
