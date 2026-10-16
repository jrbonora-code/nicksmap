import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceSession } from '../../../../../lib/auth/session';
import { getStrategyCase } from '../../../../../lib/research/case-service';
import { WorkspaceUnavailableError } from '../../../../../lib/workspace/errors';
import { CaseDetail } from '../../../../../components/research/case-detail';
import { UnavailableState } from '../../../../../components/workspace/ui';
export const metadata:Metadata={title:'Strategy case'};
export default async function CasePage({params}:{params:Promise<{id:string}>}){
  await requireWorkspaceSession();
  const {id}=await params;
  let found;
  try{found=await getStrategyCase(id);}
  catch(error){if(error instanceof WorkspaceUnavailableError)return <div className="research-workspace"><UnavailableState/></div>;throw error;}
  if(!found)notFound();
  return <CaseDetail initial={found}/>;
}
