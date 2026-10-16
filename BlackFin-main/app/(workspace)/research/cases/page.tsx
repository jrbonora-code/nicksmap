import type { Metadata } from 'next';
import { requireWorkspaceSession } from '../../../../lib/auth/session';
import { listStrategyCases } from '../../../../lib/research/case-service';
import { WorkspaceUnavailableError } from '../../../../lib/workspace/errors';
import { CaseList } from '../../../../components/research/case-list';
import { UnavailableState } from '../../../../components/workspace/ui';
import type { StrategyCaseSummary } from '../../../../lib/research/case-model';
export const metadata:Metadata={title:'Strategy cases'};
export default async function CasesPage(){
  await requireWorkspaceSession();
  let cases:StrategyCaseSummary[]|null=null;
  try{cases=await listStrategyCases();}
  catch(error){if(!(error instanceof WorkspaceUnavailableError))throw error;}
  if(cases===null)return <div className="research-workspace"><UnavailableState/></div>;
  return <CaseList cases={cases}/>;
}
