"use client";

import { useEffect, useRef, useState } from "react";
import type { Idea } from "../../lib/ideas/catalog";
import { ContextBadge, InfoHint } from "../research/context-note";
import styles from "./ideas-view.module.css";

export function IdeasView({ ideas, marketNotes, practicalNotes }: { ideas: Idea[]; marketNotes: string[]; practicalNotes: string[] }) {
  const [selectedId, setSelectedId] = useState(1);
  const [lane, setLane] = useState('All lanes');
  const [search, setSearch] = useState('');
  const detail = useRef<HTMLElement>(null);
  const focusDetail = useRef(false);
  const lanes = ['All lanes', ...new Set(ideas.flatMap(idea => idea.lanes))];
  const visible = ideas.filter(idea => (lane === 'All lanes' || idea.lanes.includes(lane)) && [idea.title, idea.summary, idea.payer, idea.role, idea.approach, idea.tools, ...idea.lanes].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const selected = visible.find(idea => idea.id === selectedId) ?? visible[0];
  useEffect(() => {
    if (focusDetail.current) { detail.current?.focus(); focusDetail.current = false; }
  }, [selectedId]);

  return <div className={styles.page}>
    <header className={styles.heading}><h1>Ideas <InfoHint label="Using strategy ideas">Filter by lane or search. Open any card to review its research notes, proposed approach, available platform support and missing evidence. Potential payers and operator roles are hypotheses, not identified counterparties or agreed engagements. Compare alternatives on the same property, instrument and evidence before opening a strategy case.</InfoHint></h1>
      <ContextBadge label="Unverified research notes" tone="warning">September 12, 2026 notes. Market figures, forecasts, policy summaries and vendor claims are historical hypotheses pending source verification. Qualitative potential and effort estimates are not investment ratings, validated staffing estimates or implementation commitments.</ContextBadge>
    </header>
    <div className={styles.filters} aria-label="Filter ideas">
      <label>Lane<select aria-label="Lane" value={lane} onChange={event => setLane(event.target.value)}>{lanes.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className={styles.search}>Search ideas<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, payer or operator role" /></label>
      <span className={styles.count} aria-live="polite">{visible.length} / {ideas.length} ideas</span>
    </div>
    <nav className={styles.cards} aria-label="Strategy ideas">
      {visible.map(idea => <a key={idea.id} className={styles.card} href="#idea-detail" aria-label={`Read ${idea.title}`} aria-current={selected?.id === idea.id ? 'true' : undefined} onClick={() => { focusDetail.current = true; setSelectedId(idea.id); if (selectedId === idea.id) detail.current?.focus(); }}>
        <h2>{idea.title}</h2><p>{idea.summary}</p>
        <dl><div><dt>Potential payer</dt><dd>{idea.payer}</dd></div><div><dt>Operator role</dt><dd>{idea.role}</dd></div><div><dt>Evidence status</dt><dd>Unverified hypothesis</dd></div><div><dt>Next step</dt><dd>{idea.nextStep}</dd></div></dl>
      </a>)}
    </nav>
    {!visible.length && <p className={styles.empty}>No ideas match these filters. <button onClick={() => { setSearch(''); setLane('All lanes'); }}>Clear filters</button></p>}
    {selected && <section ref={detail} id="idea-detail" tabIndex={-1} className={styles.detail} aria-label="Selected idea details">
      <header><h2>{selected.title}</h2><ContextBadge label="Research context">Lanes: {selected.lanes.join(' / ')}. Original qualitative estimate: potential {selected.potential.toLowerCase()}, effort {selected.work.toLowerCase()}. Neither estimate has been validated.</ContextBadge></header>
      <div className={styles.detailColumns}>
        <div><h3>Supporting notes</h3><ul>{selected.thesis.map(note => <li key={note}>{note}</li>)}</ul><h3>Proposed approach</h3><p>{selected.approach}</p></div>
        <div><h3>Research tools</h3><p>{selected.tools}</p><h3>Available platform support</h3><p>{selected.overlap}</p><h3>Evidence still needed</h3><p>{selected.needs}</p></div>
      </div>
      {selected.id === 1 && <div className={styles.context}>
        <ContextBadge label="OZ source coverage">The saved IRS appendix contains 1,360 eligible Florida tracts, with 239 in the acquired seven counties, including 12 marked rural. The research map joins those 239 tracts to 2020 Census geometry. Existing designations use a separate vintage and are not loaded. Nomination, designation and property-level tax benefits remain unconfirmed. Vacant and redevelopment sites require a separate parcel inventory, zoning, achievable density and utility evidence.</ContextBadge>
        <InfoHint label="OZ site research decisions">Define target geography, vacant or redevelopment sites, acreage or buildable-unit ranges, and acquisition, option and carrying budgets. Compare entitlement and sale with long-term qualified-fund investment as separate scenarios. Verify the current Florida submission process and timing with FloridaCommerce and review any QOF or QROF structure with qualified tax counsel before committing capital. The historical notes describe an extension through October 28, 2026 and a January 1, 2027 effective date; those notes do not establish current process status.</InfoHint>
        <a href="https://www.irs.gov/pub/irs-drop/rp-26-14-appendix.xlsx" target="_blank" rel="noreferrer">IRS eligible-tract file</a>
        <a href="https://www.irs.gov/pub/irs-drop/rp-26-14.pdf" target="_blank" rel="noreferrer">Nomination rules</a>
        <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html" target="_blank" rel="noreferrer">Census boundaries</a>
        <a href="https://floridajobs.org/rural/opportunity-zones-program" target="_blank" rel="noreferrer">FloridaCommerce</a>
      </div>}
    </section>}
    <div className={styles.context}>
      <ContextBadge label="Historical market assumptions">September 12, 2026 notes, not live rates, verified forecasts or lending quotes.<ul>{marketNotes.map(note => <li key={note}>{note}</li>)}</ul></ContextBadge>
      <ContextBadge label="Staffing assumptions"><ul>{practicalNotes.map(note => <li key={note}>{note}</li>)}</ul></ContextBadge>
      <ContextBadge label="Strategy workflow scope">Research records can open saved strategy cases with a fixed origin, evidence register, alternative comparisons and append-only versions. Specialized workflows for all ten ideas are not implemented. A case does not establish a transaction, verified payer, agreed fee or authority to act.</ContextBadge>
    </div>
  </div>;
}
