import Link from 'next/link';
export default function CaseNotFound(){
  return <div className="research-workspace"><header className="case-heading"><div><h1>Case unavailable</h1><p className="case-trigger">This case is not in the current workspace. It may have been opened with a different identifier.</p><Link href="/research/cases" className="case-back">All strategy cases</Link></div></header></div>;
}
