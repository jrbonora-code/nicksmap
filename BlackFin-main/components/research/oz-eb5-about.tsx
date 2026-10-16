'use client';
// "About this data": the one place on the page that carries caveats, sources, vintages, the runs and reload.
import { useEffect, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { OzEb5Run } from '../../lib/research/oz-eb5';
import type { Oz2027Source } from '../../lib/research/oz2027';
import { dateLabel, int } from './oz-eb5-parts';

type Run2027 = { id: string; importedAt: string; treasurySha256: string; counts: Record<string, unknown> } | null;
export function OzEb5About({ open, onClose, run2018, run2027, sources2027, onReload }: {
  open: boolean; onClose: () => void; run2018: OzEb5Run | null; run2027: Run2027; sources2027: Oz2027Source[]; onReload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  const withheld = sources2027.filter(s => !s.shipped);
  const shipped = sources2027.filter(s => s.shipped);
  const c = (run2027?.counts ?? {}) as Record<string, number>;
  return <dialog ref={dialog} className="oz-about" aria-label="About this data" onClose={onClose} onCancel={onClose}>
    <div className="oz-about-hd"><h2>About this data</h2><button type="button" className="oz-icon" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
    <div className="oz-about-body">
      <section><h3>What this screen is</h3><ul>
        <li>A tract screen, not eligibility. The EB-5 rural test applies to the project site; use Test a point for a site.</li>
        <li>EB-5 rural: outside every OMB metropolitan area and outside any city or town of 20,000 or more (INA 203(b)(5)(D)(ii)). Census designated places, New England towns and consolidated cities are flagged, not decided.</li>
        <li>The OZ 2.0 rural flag is Treasury&apos;s definition for the 2027 round. It never substitutes for EB-5 rural.</li>
        <li>2018 zones end 31 Dec 2028 (Puerto Rico 31 Dec 2027). Under IRS Notice 2026-40, new purchases after 31 Dec 2026 generally don&apos;t qualify for a 2018 zone. <a href="https://www.irs.gov/pub/irs-drop/n-26-40.pdf" target="_blank" rel="noreferrer">Notice 2026-40</a></li>
        <li>2027 eligibility is Treasury&apos;s revised list of 23 Sep 2026. Eligible is not nominated, and nominated is not designated.</li>
        <li>A partial flag under 1% of a tract&apos;s land is a sliver: no badge, shown in the drawer with its share.</li>
        <li>QCT, DDA and NMTC are programme eligibility, never an award. Properties are existing subsidized buildings, never available ones; one building described by several sources counts once.</li>
        <li>Lists that exist only on trackers or other third-party sites are not shipped as tract data (DECISIONS D06); their state-level claims are marked unverified.</li>
      </ul></section>
      <section><h3>2018 zones</h3><dl className="oz-fv">
        <dt>Run</dt><dd>{run2018 ? <code>{run2018.id.slice(0, 16)}</code> : 'Not imported'}</dd>
        <dt>Updated</dt><dd>{run2018 ? dateLabel(run2018.importedAt) : '—'}</dd>
        {run2018 && Object.entries(run2018.sources as Record<string, { url?: string; sha256?: string; fetched_utc?: string }>).map(([key, s]) => <div key={key} className="oz-fv-row"><dt>{key}</dt><dd>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{new URL(s.url).hostname.replace(/^www\./, '')}</a> : '—'} <span className="s">{s.fetched_utc ? dateLabel(s.fetched_utc) : ''} {s.sha256 ? <code>{s.sha256.slice(0, 12)}</code> : ''}</span></dd></div>)}
      </dl></section>
      <section><h3>2027 round</h3><dl className="oz-fv">
        <dt>Run</dt><dd>{run2027 ? <code>{run2027.id.slice(0, 16)}</code> : 'Not imported'}</dd>
        <dt>Updated</dt><dd>{run2027 ? dateLabel(run2027.importedAt) : '—'}</dd>
        <dt>Treasury file</dt><dd>{run2027 ? <><a href="https://home.treasury.gov/system/files/131/OZ2-Eligible-Tracts-Data-Transparency-09232026.xlsx" target="_blank" rel="noreferrer">23 Sep 2026</a> <code>{run2027.treasurySha256.slice(0, 12)}</code></> : '—'}</dd>
        <dt>Eligible tracts</dt><dd>{int(c.tracts)}</dd>
        <dt>Tracts on a list</dt><dd>{int(c.tractsWithSignals)}</dd>
        <dt>Lists shipped</dt><dd>{int(shipped.length)}</dd>
        <dt>Lists withheld</dt><dd>{withheld.length ? withheld.map(s => `${s.state}: ${s.publisher}`).join('; ') : 'None'}</dd>
        <dt>Geometry</dt><dd>Census 2024 cartographic tracts, simplified for display</dd>
      </dl></section>
      <section><h3>Use</h3><p>For internal research only. Third-party information may be incomplete or outdated. Calculations are illustrative and subject to stated assumptions; recorded financing and incentive eligibility require independent verification. Nothing herein constitutes an offer, solicitation, investment recommendation, or legal, tax or lending advice. Verify source records and transaction terms before acting.</p></section>
    </div>
    <div className="oz-about-ft"><button type="button" className="oz-btn" onClick={onReload}><RefreshCw size={16} aria-hidden="true" />Reload data</button></div>
  </dialog>;
}
