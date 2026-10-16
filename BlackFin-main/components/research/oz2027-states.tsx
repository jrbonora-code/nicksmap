'use client';
// The 2027 round by state: a tile map coloured by each state's furthest list, its legend counts, and the States table
// (State, Status, Cap, Nominated, Eligible). Choosing a state zooms the map, filters the tracts and opens its drawer.
import { OZ2027_TIERS, type Oz2027State, type Oz2027Tier } from '../../lib/research/oz2027';
import { STATE_ABBR, TIER_COLOURS, TIER_LABELS, int } from './oz-eb5-parts';

// [abbreviation, column, row] on an 11 x 9 tile grid.
const TILES: Array<[string, number, number]> = [
  ['AK', 0, 0], ['ME', 10, 0], ['VT', 9, 1], ['NH', 10, 1],
  ['WA', 0, 2], ['ID', 1, 2], ['MT', 2, 2], ['ND', 3, 2], ['MN', 4, 2], ['IL', 5, 2], ['WI', 6, 2], ['MI', 7, 2], ['NY', 8, 2], ['RI', 9, 2], ['MA', 10, 2],
  ['OR', 0, 3], ['NV', 1, 3], ['WY', 2, 3], ['SD', 3, 3], ['IA', 4, 3], ['IN', 5, 3], ['OH', 6, 3], ['PA', 7, 3], ['NJ', 8, 3], ['CT', 9, 3],
  ['CA', 0, 4], ['UT', 1, 4], ['CO', 2, 4], ['NE', 3, 4], ['MO', 4, 4], ['KY', 5, 4], ['WV', 6, 4], ['VA', 7, 4], ['MD', 8, 4], ['DE', 9, 4],
  ['AZ', 1, 5], ['NM', 2, 5], ['KS', 3, 5], ['AR', 4, 5], ['TN', 5, 5], ['NC', 6, 5], ['SC', 7, 5], ['DC', 8, 5],
  ['OK', 3, 6], ['LA', 4, 6], ['MS', 5, 6], ['AL', 6, 6], ['GA', 7, 6],
  ['HI', 0, 7], ['TX', 3, 7], ['FL', 8, 7],
  ['GU', 0, 8], ['MP', 1, 8], ['AS', 2, 8], ['PR', 8, 8], ['VI', 9, 8],
];
/** A state's furthest list: its own status, or the best tier any of its tracts reached, whichever is further along. */
export function progressOf(s: Oz2027State): Oz2027Tier | null {
  const own = (OZ2027_TIERS as readonly string[]).includes(s.status) ? s.status as Oz2027Tier : null;
  const best = OZ2027_TIERS.slice(0, -1).find(t => (s.tiers[t] ?? 0) > 0) ?? null;
  if (!own) return best;
  if (!best) return own;
  return OZ2027_TIERS.indexOf(own) <= OZ2027_TIERS.indexOf(best) ? own : best;
}
const STATUS: Record<string, string> = { ...TIER_LABELS, extension: 'No list yet', unknown: 'No list yet' };
const ORDER = ['certified', 'nominated', 'state_recommended', 'draft_for_comment', 'local_recommended', 'extension', 'unknown'];
const TILE = 30, GAP = 3;

export function Oz2027States({ states, selected, onSelect }: { states: Oz2027State[]; selected: string; onSelect: (state: string) => void }) {
  const byAbbr = new Map(states.map(s => [STATE_ABBR[s.state], s]));
  const legend = OZ2027_TIERS.slice(0, -1).map(t => ({ tier: t, n: states.filter(s => progressOf(s) === t).length }));
  const none = states.filter(s => !progressOf(s)).length;
  const sorted = [...states].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.state.localeCompare(b.state));
  return <div className="oz-states">
    <div className="oz-tilewrap">
      <div className="oz-tiles" style={{ width: 11 * (TILE + GAP), height: 9 * (TILE + GAP) }} role="group" aria-label="States by 2027 list">
        {TILES.map(([abbr, x, y]) => {
          const s = byAbbr.get(abbr);
          const p = s ? progressOf(s) : null;
          const dark = p === 'certified' || p === 'nominated' || p === 'state_recommended';
          return <button key={abbr} type="button" className={`oz-tile${s && s.state === selected ? ' sel' : ''}${p ? '' : ' none'}`} style={{ left: x * (TILE + GAP), top: y * (TILE + GAP), width: TILE, height: TILE, background: p ? TIER_COLOURS[p] : undefined, color: p ? (dark ? '#fff' : '#0b2a35') : undefined }}
            aria-label={s ? `${s.state}: ${p ? TIER_LABELS[p] : 'no list yet'}` : abbr} aria-pressed={!!s && s.state === selected} onClick={() => s && onSelect(s.state)}>{abbr}</button>;
        })}
      </div>
      <div className="oz-tlegend">
        {legend.map(({ tier, n }) => <div key={tier} className="oz-lrow"><span className="oz-sw" style={{ background: TIER_COLOURS[tier] }} aria-hidden="true" /><span>{TIER_LABELS[tier]}</span><span className="n">{n}</span></div>)}
        <div className="oz-lrow"><span className="oz-sw empty" aria-hidden="true" /><span>No list yet</span><span className="n">{none}</span></div>
      </div>
    </div>
    <div className="oz-stbl-wrap">
      <table className="oz-stbl">
        <thead><tr><th>State</th><th>Status</th><th className="r">Cap</th><th className="r">Nominated</th><th className="r">Eligible</th></tr></thead>
        <tbody>{sorted.map(s => {
          const tier = (OZ2027_TIERS as readonly string[]).includes(s.status) ? s.status as Oz2027Tier : null;
          return <tr key={s.state} className={s.state === selected ? 'sel' : ''} tabIndex={0} onClick={() => onSelect(s.state)} onKeyDown={e => { if (e.key === 'Enter') onSelect(s.state); }}>
            <td>{s.state}</td>
            <td><span className="oz-cl">{tier ? <span className="oz-sw" style={{ background: TIER_COLOURS[tier] }} aria-hidden="true" /> : <span className="oz-sw empty" aria-hidden="true" />}{STATUS[s.status] ?? s.status}{s.confidence === 'unverified' ? ' (unverified)' : ''}</span></td>
            <td className="r">{s.cap === null ? '—' : int(s.cap)}</td>
            <td className="r">{s.nominatedCount === null ? '—' : int(s.nominatedCount)}</td>
            <td className="r">{int(s.eligibleCount)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
