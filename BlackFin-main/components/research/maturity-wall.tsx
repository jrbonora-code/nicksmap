'use client';
// The Maturities panel: loans by reported maturity quarter as a bar table, the next 24 months emphasised, then the
// next 24 months by lender and by size. Selecting a row filters the property list to that window.
import type { MaturityWall as Wall, MaturityWallBucket } from '../../lib/research/types';
import { dateLabel, int } from './oz-eb5-parts';
import { usdShort } from './format';

const estimate = (b: { estimateLowCents: number; estimateHighCents: number; estimatedLoans?: number }) =>
  b.estimateHighCents > 0 ? `${usdShort(b.estimateLowCents)}–${usdShort(b.estimateHighCents)}` : '—';

export function MaturityWallPanel({ wall, onPick }: { wall: Wall; onPick: (from: string | null, to: string | null) => void }) {
  // Bars share one scale across the quarters; the passed, later and undated rows are totals and carry no bar.
  const max = Math.max(1, ...wall.buckets.filter(b => b.kind === 'quarter').map(b => b.loans));
  const next24 = wall.buckets.filter(b => b.next24);
  const inWindow = wall.lenders24.reduce((n, l) => n + l.loans, 0);
  const shown = wall.buckets.filter(b => b.loans > 0 || b.kind === 'quarter');
  const pick = (b: MaturityWallBucket) => onPick(b.from, b.to);
  return <div className="oz-panel rs-wall">
    <dl className="rs-stats">
      <div><dt>Loans</dt><dd>{int(wall.loans)}</dd></div>
      <div><dt>With a maturity</dt><dd>{int(wall.dated)}</dd></div>
      <div><dt>Next 24 months</dt><dd>{int(inWindow)}</dd></div>
      <div><dt>Through</dt><dd>{dateLabel(wall.through24)}</dd></div>
    </dl>
    <table className="oz-stbl rs-bars" aria-label="Loans by maturity">
      <thead><tr><th>Maturity</th><th className="rs-barcol">Loans</th><th className="r">Recorded</th><th className="r">Estimate</th><th>Top lenders</th></tr></thead>
      <tbody>{shown.map(b => <tr key={b.key} tabIndex={b.kind === 'undated' ? undefined : 0} className={b.next24 ? 'rs-next' : b.kind === 'past' || b.kind === 'undated' ? 'rs-muted' : undefined}
        onClick={b.kind === 'undated' ? undefined : () => pick(b)} onKeyDown={b.kind === 'undated' ? undefined : e => { if (e.key === 'Enter') pick(b); }}
        title={`${b.label}: ${b.loans} loans${b.recordedLoans ? `, ${usdShort(b.recordedCents)} recorded` : ''}`}>
        <td>{b.label}</td>
        <td className="rs-barcol"><span className="rs-bar">{b.kind === 'quarter' && <i style={{ width: `${(100 * b.loans) / max}%` }} />}</span><span className="rs-barn">{int(b.loans)}</span></td>
        <td className="r">{b.recordedLoans ? usdShort(b.recordedCents) : '—'}</td>
        <td className="r">{estimate(b)}</td>
        <td className="rs-lenders">{b.lenders.map(l => l.loans > 1 ? `${l.name} (${l.loans})` : l.name).join(', ') || '—'}</td>
      </tr>)}</tbody>
    </table>
    {next24.length > 0 && <>
      <h3 className="rs-h3">Next 24 months by lender</h3>
      {wall.lenders24.length ? <table className="oz-stbl"><thead><tr><th>Lender</th><th className="r">Loans</th><th className="r">Recorded</th><th className="r">Estimate</th><th>First</th></tr></thead>
        <tbody>{wall.lenders24.map(l => <tr key={l.name}><td>{l.name}</td><td className="r">{int(l.loans)}</td><td className="r">{l.recordedCents ? usdShort(l.recordedCents) : '—'}</td><td className="r">{estimate(l)}</td><td>{dateLabel(l.earliest)}</td></tr>)}</tbody></table>
        : <p className="oz-dr-note rs-pad">None</p>}
      <h3 className="rs-h3">Next 24 months by recorded amount</h3>
      <table className="oz-stbl"><thead><tr><th>Size</th><th className="r">Loans</th></tr></thead>
        <tbody>{wall.sizes24.map(s => <tr key={s.label}><td>{s.label}</td><td className="r">{int(s.loans)}</td></tr>)}</tbody></table>
    </>}
  </div>;
}
