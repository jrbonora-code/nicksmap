'use client';
// Property intelligence: the page shell, on the OZ / EB-5 page's layout and parts. It owns the URL state, the query
// and the scenario; the list, the map, the drawer, the panels and the About sheet are separate components. Full
// height, no page scroll: header 68px, filters 60px, the list and the map below, the drawer on the right.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Calculator, ChevronDown, Columns2, Filter, Info, Map as MapIcon, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Table2, X } from 'lucide-react';
import { defaultScenario, financingThreshold } from '../../lib/research/finance';
import { BALANCE_SOURCE_LABELS } from '../../lib/research/balance-estimate';
import type { PropertyDetail, ResearchQuery, ResearchResult, Scenario } from '../../lib/research/types';
import { ResearchMap, type ResearchMapView } from './map';
import { ResearchList } from './research-list';
import { PropertyDrawer, type Selection } from './research-drawer';
import { MaturityWallPanel } from './maturity-wall';
import { CasesPanel, LendersPanel, SourcesPanel } from './research-panels';
import { ResearchAbout } from './research-about';
import { OutsideLoanDrawer } from './servicer-sections';
import { ScenarioFields } from './scenario-fields';
import { ListDivider, ShowListHandle, useListWidth } from './oz-eb5-resize';
import { useUrlState } from './url-state';
import { DEFAULT_RESEARCH_STATE, RESEARCH_TABS, advancedFilterCount, filtersOf, parseResearchState, queryOf, serialiseResearchState, type ResearchState } from './research-url';
import { dateLabel, int, useJson } from './oz-eb5-parts';
import './oz-eb5.css';
import './research.css';

type Saved = { id: string; label: string; snapshot_id: string; query: ResearchQuery; scenario: Scenario; created_at: string; selected_scenario: Selection | null };
const COUNTIES: [string, string][] = [['12015', 'Charlotte'], ['12021', 'Collier'], ['12057', 'Hillsborough'], ['12071', 'Lee'], ['12081', 'Manatee'], ['12103', 'Pinellas'], ['12115', 'Sarasota']];
const SORTS: [string, string, ResearchState['sort'], ResearchState['direction']][] = [
  ['maturity', 'Maturity', 'maturity', 'asc'], ['balance', 'Balance', 'balance', 'desc'], ['address', 'Property', 'address', 'asc'], ['county', 'County', 'countyName', 'asc'],
  ['units', 'Units', 'providerUnits', 'desc'], ['lender', 'Lender', 'lender', 'asc'], ['noi', 'Required NOI', 'requiredNoi', 'desc'],
];
const TAB_LABELS: Record<typeof RESEARCH_TABS[number], string> = { properties: 'Properties', maturities: 'Maturities', lenders: 'Lenders', cases: 'Cases', sources: 'Sources' };
const SOURCE_OPTIONS = ['', 'servicer', 'provider_estimate', 'estimate', 'recorded', 'none'] as const;
const numberOrNull = (v: string) => (v === '' ? null : Number(v));

export function ResearchWorkspace({ initialQuery }: { initialQuery: string }) {
  const [ui, update, restored] = useUrlState<ResearchState>(initialQuery, parseResearchState, serialiseResearchState);
  const [text, setText] = useState(ui.text);
  // Back and Forward reset the search box to the restored URL.
  const [seenRestore, setSeenRestore] = useState(restored);
  if (restored !== seenRestore) { setSeenRestore(restored); setText(ui.text); }
  const [ids, setIds] = useState<string[] | null>(null);
  const [scenario, setScenario] = useState<Scenario>(() => defaultScenario());
  const [snapshot, setSnapshot] = useState<string | undefined>();
  const [replay, setReplay] = useState<Selection | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [detail, setDetail] = useState<{ key: string; value: PropertyDetail } | null>(null), [detailError, setDetailError] = useState('');
  const [revision, setRevision] = useState(0), [savedRevision, setSavedRevision] = useState(0);
  const [mobile, setMobile] = useState(false), [wide, setWide] = useState(true), [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('half');
  const [panel, setPanel] = useState<'' | 'filters' | 'assumptions' | 'save'>(''), [sheetOpen, setSheetOpen] = useState(false), [aboutOpen, setAboutOpen] = useState(false);
  const [message, setMessage] = useState(''), [saveLabel, setSaveLabel] = useState('');
  const [outside, setOutside] = useState(false), [outsideLoan, setOutsideLoan] = useState<{ runId: string; seq: number } | null>(null);
  const listWidth = useListWidth('blackfin.research.list-width');
  const [liveWidth, setLiveWidth] = useState<number | null>(null), [resizeTick, setResizeTick] = useState(0);
  const listRef = useRef<HTMLElement>(null);
  const shownWidth = liveWidth ?? listWidth.width;
  const saved = useJson<Saved[]>('/api/research/saved', savedRevision);

  useEffect(() => {
    const phone = window.matchMedia('(max-width: 760px)'), desk = window.matchMedia('(min-width: 1280px)');
    const apply = () => { setMobile(phone.matches); setWide(desk.matches); };
    apply(); phone.addEventListener('change', apply); desk.addEventListener('change', apply);
    return () => { phone.removeEventListener('change', apply); desk.removeEventListener('change', apply); };
  }, []);
  useEffect(() => { const t = setTimeout(() => { if (text !== ui.text) update({ text }, 'replace'); }, 250); return () => clearTimeout(t); }, [text, ui.text, update]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onView = useCallback((v: ResearchMapView) => {
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => update({ at: [v.center[0], v.center[1], v.zoom] }, 'replace'), 300);
  }, [update]);

  // ---------- data ----------
  const queryJson = JSON.stringify(queryOf(ui, ids));
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      const p = new URLSearchParams({ q: queryJson, s: JSON.stringify(scenario) }); if (snapshot) p.set('snapshot', snapshot);
      void fetch('/api/research?' + p, { signal: controller.signal, cache: 'no-store' })
        .then(async r => { const body = await r.json(); if (!r.ok) throw Error(r.status === 401 ? 'Your session has expired. Sign in again.' : body.error ?? 'The request failed. Retry.'); return body as ResearchResult | null; })
        .then(body => { setResult(body); setLoading(false); })
        .catch(e => { if (e.name !== 'AbortError') { setError(e.message || 'The request failed. Retry.'); setLoading(false); } });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [queryJson, scenario, snapshot, revision]);
  const rows = useMemo(() => result?.rows ?? [], [result]);
  const selectedRow = ui.property ? rows.find(r => r.id === ui.property) ?? null : null;
  const detailKey = selectedRow && result ? `${result.snapshotId}:${selectedRow.id}` : '';
  useEffect(() => {
    if (!detailKey || !result) return;
    const controller = new AbortController(), [snapshotId, id] = [result.snapshotId, detailKey.slice(65)];
    void fetch(`/api/research/property/${encodeURIComponent(id)}?snapshot=${snapshotId}`, { signal: controller.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw Error('The property detail failed to load. Retry.'); return r.json(); })
      .then((d: PropertyDetail) => { if (!controller.signal.aborted) { setDetail({ key: detailKey, value: d }); setDetailError(''); } })
      .catch(e => { if (e.name !== 'AbortError') setDetailError(e.message); });
    return () => controller.abort();
  }, [detailKey, result]);

  // ---------- selection ----------
  const position = selectedRow ? rows.indexOf(selectedRow) + 1 : 0;
  const select = useCallback((id: string) => { setOutsideLoan(null); update({ property: id }); if (mobile && id) setSheet('full'); }, [update, mobile]);
  const openOutside = useCallback((runId: string, seq: number) => { update({ property: '' }); setOutsideLoan({ runId, seq }); }, [update]);
  const step = (delta: number) => { const i = position - 1 + delta; if (i >= 0 && i < rows.length) select(rows[i].id); };
  const drawerOpen = !!selectedRow || !!outsideLoan;
  const padRight = drawerOpen && !wide && !mobile ? 440 : 0;
  const showList = ui.view !== 'map', showMap = ui.view !== 'table';

  async function save(selection?: Selection) {
    if (!result || loading || error) { setMessage('Wait for the list to load, then save.'); return; }
    try {
      const label = selection ? `${(selectedRow?.address ?? 'Property').slice(0, 100)} (financing)` : saveLabel.trim();
      const r = await fetch('/api/research/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, query: result.query, scenario: result.scenario, snapshotId: result.snapshotId, selected: selection }) });
      const body = await r.json(); if (!r.ok) throw Error(body.error);
      setMessage(`Saved: ${body.label}`); setSavedRevision(v => v + 1); setPanel(''); setSaveLabel('');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Save failed.'); }
  }
  const openSaved = (id: string) => {
    const v = saved.data?.find(s => s.id === id); if (!v) return;
    setScenario(v.scenario); setSnapshot(v.snapshot_id); setReplay(v.selected_scenario); setIds(null);
    setText(v.query.text ?? '');
    update({ ...filtersOf(v.query), property: v.selected_scenario?.propertyId ?? '', tab: 'properties' });
    setMessage(`Saved view: ${v.label}`);
  };
  const resetFilters = () => { const keep = { view: ui.view, tab: ui.tab, colour: ui.colour, at: ui.at }; setText(''); setIds(null); setSnapshot(undefined); update({ ...DEFAULT_RESEARCH_STATE, ...keep }); };
  const sortKey = SORTS.find(s => s[2] === ui.sort)?.[0] ?? 'maturity';
  const adv = advancedFilterCount(ui);

  const filterFields = <>
    <label className="oz-field oz-select"><span className="sr-only">County</span><select aria-label="County" value={ui.county} onChange={e => update({ county: e.target.value, property: '' })}><option value="">All seven counties</option>{COUNTIES.map(([f, n]) => <option key={f} value={f}>{n}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label>
    <label className="oz-field oz-select rs-src"><span className="sr-only">Balance source</span><select aria-label="Balance source" value={ui.balanceSource} onChange={e => update({ balanceSource: e.target.value as ResearchState['balanceSource'] })}>{SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s === '' ? 'Any balance source' : BALANCE_SOURCE_LABELS[s]}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label>
    <label className="oz-cbx"><input type="checkbox" checked={ui.within24} onChange={e => update({ within24: e.target.checked })} />Matures within 24 months</label>
    <button type="button" className={`oz-btn rs-fbtn${panel === 'filters' ? ' on' : ''}`} aria-expanded={panel === 'filters'} onClick={() => setPanel(p => (p === 'filters' ? '' : 'filters'))}><SlidersHorizontal size={17} aria-hidden="true" />{mobile ? 'More filters' : 'Filters'}{adv > 0 && <span className="rs-count">{adv}</span>}</button>
    <button type="button" className={`oz-btn rs-fbtn${panel === 'assumptions' ? ' on' : ''}`} aria-expanded={panel === 'assumptions'} onClick={() => setPanel(p => (p === 'assumptions' ? '' : 'assumptions'))}><Calculator size={17} aria-hidden="true" /><span className="rs-lbl">{mobile ? 'Financing assumptions' : 'Assumptions'}</span></button>
  </>;
  const advanced = <div className="rs-grid">
    <div className="rs-checks">
      <label className="oz-cbx"><input type="checkbox" checked={ui.realBalance} onChange={e => update({ realBalance: e.target.checked })} />Real balance available</label>
      <label className="oz-cbx"><input type="checkbox" checked={ui.specialServicing} onChange={e => update({ specialServicing: e.target.checked })} />Special servicing</label>
      <label className="oz-cbx"><input type="checkbox" checked={ui.releasedVerified} onChange={e => update({ releasedVerified: e.target.checked })} />Released (verified)</label>
    </div>
    <label><span>Mortgages</span><select value={ui.debt} onChange={e => update({ debt: e.target.value as ResearchState['debt'] })}><option value="all">All properties</option><option value="reported">With mortgage entries</option><option value="missing">Without mortgage entries</option></select></label>
    <label><span>OZ 2027</span><select value={ui.oz} onChange={e => update({ oz: e.target.value as ResearchState['oz'] })}><option value="all">Any</option><option value="eligible">Eligible tract</option><option value="not_in_list">Not eligible</option><option value="unmapped">Unresolved</option></select></label>
    <label><span>Lender contains</span><input value={ui.lender} onChange={e => update({ lender: e.target.value }, 'replace')} /></label>
    <label><span>Owner contains</span><input value={ui.ownership} onChange={e => update({ ownership: e.target.value }, 'replace')} /></label>
    <label><span>Maturity from</span><input type="date" value={ui.maturityAfter} onChange={e => update({ maturityAfter: e.target.value })} /></label>
    <label><span>Maturity through</span><input type="date" value={ui.maturityBefore} onChange={e => update({ maturityBefore: e.target.value })} /></label>
    <label><span>Recorded min USD</span><input type="number" min="0" value={ui.minAmount ?? ''} onChange={e => update({ minAmount: numberOrNull(e.target.value) }, 'replace')} /></label>
    <label><span>Recorded max USD</span><input type="number" min="0" value={ui.maxAmount ?? ''} onChange={e => update({ maxAmount: numberOrNull(e.target.value) }, 'replace')} /></label>
    <label><span>Units min</span><input type="number" min="0" value={ui.minUnits ?? ''} onChange={e => update({ minUnits: numberOrNull(e.target.value) }, 'replace')} /></label>
    <label><span>Units max</span><input type="number" min="0" value={ui.maxUnits ?? ''} onChange={e => update({ maxUnits: numberOrNull(e.target.value) }, 'replace')} /></label>
    <label><span>License link</span><select value={ui.match} onChange={e => update({ match: e.target.value as ResearchState['match'] })}><option value="all">Any</option><option value="strict">Address consistent</option><option value="review">Needs review</option></select></label>
    <label className="oz-cbx"><input type="checkbox" checked={ui.beforeScenarioDate} onChange={e => update({ beforeScenarioDate: e.target.checked })} />Maturity passed</label>
    <div className="rs-grid-foot"><button type="button" className="oz-btn" onClick={resetFilters}>Reset filters</button></div>
  </div>;
  const assumptions = <ScenarioPanel value={scenario} onApply={s => { setScenario(s); setPanel(''); }} />;
  const saveForm = <form className="rs-save" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label><span>Name</span><input autoFocus maxLength={120} required value={saveLabel} onChange={e => setSaveLabel(e.target.value)} /></label>
    <button type="submit" className="oz-btn primary">Save</button><button type="button" className="oz-btn" onClick={() => setPanel('')}>Cancel</button>
  </form>;
  const savedSelect = <label className="oz-field oz-select rs-saved"><span className="sr-only">Saved views</span><select aria-label="Saved views" value="" disabled={!saved.data?.length} onChange={e => openSaved(e.target.value)}><option value="">{saved.data?.length ? `Saved views (${saved.data.length})` : 'No saved views'}</option>{(saved.data ?? []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label>;

  return <div className={`oz-page rs-page${mobile ? ' phone' : ''}`} data-view={ui.view} data-drawer={drawerOpen || undefined} data-wide={wide || undefined}
    style={shownWidth && !mobile ? ({ '--list-w': `${shownWidth}px` } as React.CSSProperties) : undefined}>
    <header className="oz-head">
      <h1>{mobile ? 'Properties' : 'Property intelligence'}</h1>
      {mobile ? <button type="button" className="oz-icon rs-about-icon" aria-label="About this data" onClick={() => setAboutOpen(true)}><Info size={20} /></button>
        : <div className="oz-head-right">
          <span className="oz-stamp">{result ? `Acquired ${dateLabel(result.sourceDate)}` : ''}</span>
          {savedSelect}
          <button type="button" className="oz-textbtn" aria-expanded={panel === 'save'} onClick={() => setPanel(p => (p === 'save' ? '' : 'save'))}><Bookmark size={18} aria-hidden="true" />Save view</button>
          <button type="button" className="oz-textbtn" onClick={() => setAboutOpen(true)}><Info size={18} aria-hidden="true" />About this data</button>
        </div>}
    </header>
    <div className="oz-filters rs-filters">
      <label className="oz-field oz-search"><Search size={18} aria-hidden="true" /><input aria-label="Search address, parcel or provider ID" placeholder={mobile ? 'Address or parcel' : 'Search address or parcel'} value={text} onChange={e => setText(e.target.value)} />{text && <button type="button" className="oz-clear" aria-label="Clear search" onClick={() => setText('')}><X size={16} /></button>}</label>
      {mobile ? <button type="button" className="oz-fbtn" aria-label="Filters" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}><Filter size={20} /></button> : filterFields}
      {!mobile && <div className="oz-seg oz-views" role="group" aria-label="View">
        {([['map', 'Map', MapIcon], ['split', 'Split', Columns2], ['table', 'Table', Table2]] as const).map(([v, label, Icon]) => <button key={v} type="button" aria-pressed={ui.view === v} className={ui.view === v ? 'on' : ''} onClick={() => update({ view: v })}><Icon size={17} aria-hidden="true" /><span className="rs-lbl">{label}</span></button>)}
      </div>}
      {!mobile && panel && <div className={`rs-pop rs-pop-${panel}`} role="dialog" onKeyDown={e => { if (e.key === 'Escape') setPanel(''); }} aria-label={panel === 'filters' ? 'Filters' : panel === 'save' ? 'Save view' : 'Financing assumptions'}>
        <div className="rs-pop-hd"><strong>{panel === 'filters' ? 'Filters' : panel === 'save' ? 'Save view' : 'Financing assumptions'}</strong><button type="button" className="oz-icon" aria-label="Close" onClick={() => setPanel('')}><X size={18} /></button></div>
        {panel === 'filters' ? advanced : panel === 'save' ? saveForm : assumptions}
      </div>}
    </div>
    {mobile && sheetOpen && <div className="oz-sheet-filters" role="dialog" aria-label="Filters">
      <div className="oz-sheet-hd"><strong>Filters</strong><button type="button" className="oz-icon" aria-label="Close filters" onClick={() => setSheetOpen(false)}><X size={20} /></button></div>
      <div className="oz-sheet-body">{filterFields}{panel === 'filters' && advanced}{panel === 'assumptions' && assumptions}{savedSelect}{panel === 'save' ? saveForm : <button type="button" className="oz-btn" onClick={() => setPanel('save')}><Bookmark size={18} aria-hidden="true" />Save view</button>}</div>
    </div>}

    <div className="oz-ws">
      {showList && <section ref={listRef} className={`oz-list${mobile ? ` sheet ${sheet}` : ''}`} aria-label="Properties">
        {mobile && <button type="button" className="oz-handle" aria-label="Resize the list" onClick={() => setSheet(s => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'))}><i /></button>}
        <div className="oz-tabs" role="tablist" aria-label="Panels">
          {RESEARCH_TABS.map(tab => <button key={tab} type="button" role="tab" aria-selected={ui.tab === tab} className={ui.tab === tab ? 'on' : ''} onClick={() => update({ tab })}>{TAB_LABELS[tab]}{tab === 'properties' && result && <span className="n">{int(result.total)}</span>}</button>)}
          {!mobile && <span className="tail"><button type="button" className="oz-icon" aria-label={showMap ? 'Collapse the list into the map' : 'Show the map'} onClick={() => update({ view: ui.view === 'split' ? 'map' : 'split' })}>{ui.view === 'table' ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button></span>}
        </div>
        {error && <div className="oz-alert" role="alert">{error} <button type="button" className="oz-textbtn" onClick={() => setRevision(v => v + 1)}>Retry</button></div>}
        {message && <div className="rs-msg" role="status"><span>{message}</span>{snapshot && <button type="button" className="oz-textbtn" onClick={() => { setSnapshot(undefined); setReplay(null); setMessage(''); }}>Current data</button>}<button type="button" className="oz-icon" aria-label="Dismiss" onClick={() => setMessage('')}><X size={16} /></button></div>}
        {!result && !loading && !error && <div className="oz-empty-state"><h2>No research snapshot</h2><p>Run the private research import.</p></div>}
        {result && ui.tab === 'properties' && <>
          <div className="oz-toolbar">
            <span className="count">{`${int(result.total)} ${result.total === 1 ? 'property' : 'properties'}`}</span>
            {ids && <button type="button" className="rs-chip" onClick={() => setIds(null)}>Cluster {int(ids.length)}<X size={14} aria-label="Clear" /></button>}
            {ui.bounds && <button type="button" className="rs-chip" onClick={() => update({ bounds: null })}>Map area<X size={14} aria-label="Clear" /></button>}
            <span className="right"><label className="oz-sort"><span>Sort:</span><select aria-label="Sort" value={sortKey} onChange={e => { const s = SORTS.find(x => x[0] === e.target.value)!; update({ sort: s[2], direction: s[3] }, 'replace'); }}>{SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label></span>
          </div>
          <ResearchList rows={rows} table={ui.view === 'table'} compact={mobile} asOf={result.scenario.asOf} selected={ui.property} onSelect={select} />
        </>}
        {result && ui.tab === 'maturities' && <MaturityWallPanel wall={result.maturityWall} onPick={(from, to) => update({ tab: 'properties', maturityAfter: from ?? '', maturityBefore: to ?? '', within24: false, debt: 'reported' })} />}
        {result && ui.tab === 'lenders' && <LendersPanel result={result} onLender={name => update({ lender: name, tab: 'properties' })} />}
        {result && ui.tab === 'cases' && <CasesPanel result={result} revision={revision} selected={ui.property} onSelect={id => update({ property: id, tab: 'properties' })} />}
        {result && ui.tab === 'sources' && <SourcesPanel result={result} revision={revision} />}
      </section>}
      {showList && showMap && !mobile && <ListDivider listRef={listRef} onLive={setLiveWidth}
        onCommit={width => { listWidth.setWidth(width); setResizeTick(t => t + 1); }} onReset={() => { listWidth.setWidth(null); setResizeTick(t => t + 1); }} />}
      {showMap && <div className="oz-mapwrap">
        {!showList && !mobile && <ShowListHandle onOpen={width => { if (width) listWidth.setWidth(width); update({ view: 'split' }); setResizeTick(t => t + 1); }} />}
        {result && <ResearchMap rows={rows} selectedId={ui.property} onSelect={select} onCluster={setIds} onArea={bounds => update({ bounds })} snapshotId={result.snapshotId}
          bounds={ui.bounds} queryKey={queryJson + result.snapshotId} colour={ui.colour} onColour={colour => update({ colour })} asOf={result.scenario.asOf}
          initialAt={ui.at} onView={onView} resizeTick={resizeTick} padRight={padRight} mobile={mobile}
          outside={outside} onToggleOutside={on => { setOutside(on); if (!on) setOutsideLoan(null); }} onOutside={openOutside} outsideSelected={outsideLoan?.seq ?? null} />}
      </div>}
      {outsideLoan && !selectedRow && <OutsideLoanDrawer key={outsideLoan.seq} runId={outsideLoan.runId} seq={outsideLoan.seq} chrome={{ position: 0, total: 0, onPrev: () => {}, onNext: () => {}, onClose: () => setOutsideLoan(null), mobile, noun: 'loan' }} />}
      {selectedRow && result && <PropertyDrawer key={selectedRow.id + result.snapshotId} row={selectedRow} detail={detail?.key === detailKey ? detail.value : null} detailError={detailError}
        scenario={result.scenario} query={result.query} snapshotId={result.snapshotId} replay={replay}
        chrome={{ position, total: rows.length, onPrev: () => step(-1), onNext: () => step(1), onClose: () => update({ property: '' }), mobile, noun: 'property' }}
        onSave={s => void save(s)} onMessage={setMessage} />}
    </div>
    <ResearchAbout open={aboutOpen} onClose={() => setAboutOpen(false)} result={result} onReload={() => { setRevision(v => v + 1); setAboutOpen(false); }} />
    <span className="sr-only" role="status">{loading ? 'Loading' : ''}</span>
  </div>;
}

function ScenarioPanel({ value, onApply }: { value: Scenario; onApply: (value: Scenario) => void }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  return <form className="rs-grid rs-scenario" onSubmit={e => { e.preventDefault(); try { financingThreshold(10000, draft); onApply(draft); } catch (err) { setError(err instanceof Error ? err.message : 'Check the assumptions.'); } }}>
    <ScenarioFields value={draft} onChange={setDraft} />
    {error && <p className="oz-dr-note" role="alert">{error}</p>}
    <div className="rs-grid-foot"><button type="submit" className="oz-btn primary">Apply</button><button type="button" className="oz-btn" onClick={() => setDraft(defaultScenario())}>Defaults</button></div>
  </form>;
}
