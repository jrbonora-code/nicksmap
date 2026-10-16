import type { Metadata } from 'next';
import { requireWorkspaceSession } from '../../../../lib/auth/session';
import { OzEb5Workspace } from '../../../../components/research/oz-eb5';
export const metadata:Metadata={title:'OZ / EB-5'};
// The first render reads the URL so a shared link restores the mode, filters, tract, view and map position.
export default async function OzEb5Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  await requireWorkspaceSession();
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams))if(typeof value==='string')params.set(key,value);
  return <OzEb5Workspace initialQuery={params.toString()}/>;
}
