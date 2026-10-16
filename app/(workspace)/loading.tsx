export default function LoadingWorkspace() {
  return <div role="status" className="loading-workspace"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-copy" /><div className="metric-grid">{[1, 2, 3, 4].map(item => <div key={item} className="skeleton skeleton-metric" />)}</div><div className="skeleton skeleton-panel" /><span className="sr-only">Loading workspace records…</span></div>;
}
