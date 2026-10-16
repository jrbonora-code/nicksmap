"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="panel error-state" role="alert"><AlertTriangle size={30} /><h1>These records could not be loaded</h1><p>The workspace connection may be temporarily unavailable. Try loading the page again.</p><button className="button button-primary" onClick={reset}><RefreshCw size={16} />Try again</button><a className="text-link" href="/settings">Workspace settings</a></div>;
}
