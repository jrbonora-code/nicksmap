'use client';
// OZ / EB-5 rural screen: the page shell. It owns the URL state and the data; the list, the map, the drawer and the
// About sheet are separate components. Full height, no page scroll: header 68px, filters 60px, workspace below.
// Two modes share the frame: "2018 zones" (the EB-5 screen of the designated 2010 tracts) and "2027 round" (Treasury's
// revised eligible list on 2020 tracts with each list's status). The 2027 round is a separate mode, never a layer over
// the 2018 map, because its tracts, universe and rural definition are different.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Columns2, Download, Filter, Info, Map as MapIcon, PanelLeftClose, PanelLeftOpen, Search, Table2, X } from 'lucide-react';
import { OZ_EB5_ASSET_SOURCES, OZ_EB5_ASSET_SOURCE_LABELS, OZ_EB5_CLASSES, OZ_EB5_STATE_NAMES, type OzEb5Asset, type OzEb5Class, type OzEb5Market, type OzEb5Run, type OzEb5TractRow, type OzEb5TractSummary } from '../../lib/research/oz-eb5';
import { OZ2027_TIERS, type Oz2027Source, type Oz2027State, type Oz2027Tier, type Oz2027TractRow } from '../../lib/research/oz2027';
import { DEFAULT_OZ_STATE, parseOzState, serialiseOzState, type OzIncentive, type OzState } from './oz-eb5-url';
import { OzEb5Map, type MapPoint, type MapView, type Overlay } from './oz-eb5-map';
import { OzEb5List, type ListRow } from './oz-eb5-list';
import { StateDrawer, Tract2018Drawer, Tract2027Drawer } from './oz-eb5-drawer';
import { OzEb5About } from './oz-eb5-about';
import { Oz2027States } from './oz2027-states';
import { ListDivider, ShowListHandle, useListWidth } from './oz-eb5-resize';
import { useUrlState } from './url-state';
import { CLASS_LABELS, ClassLabel, STATE_ABBR, TIER_LABELS, dateLabel, int, useJson } from './oz-eb5-parts';
import './oz-eb5.css';

type Summary2018 = { run: OzEb5Run; rows: OzEb5TractSummary[]; total: number } | null;
type Markets = { run: OzEb5Run; rows: OzEb5Market[] } | null;
type Assets = { rows: OzEb5Asset[]; total: number; truncated: boolean; limit: number } | null;
type Run2027 = { id: string; importedAt: string; treasurySha256: string; counts: Record<string, unknown> };
type States2027 = { run: Run2027; states: Oz2027State[]; sources: Oz2027Source[] } | null;
type Points2027 = { runId: string; tiers: Oz2027Tier[]; rows: Array<[string, number, number, number, number, number]> } | null;
type Tracts2027 = { run: Run2027; rows: Oz2027TractRow[]; total: number; truncated: boolean; limit: number } | null;
type SiteResult = {
  latitude: number; longitude: number; tract2010: string | null; tract2020: string | null; ozAgreement: string; countyFips: string; countyName: string; msaBasis: string;
  cbsa: { title: string; type: string }; geocoderCbsa: { title: string; type: string }; place: { name: string; pop: number | null; kind: string } | null;
  countySubdivision: { name: string; pop: number | null } | null; eb5RuralClass: string; classReason: string; ozDesignated: string; verdict: string; notes: string[];
  tract: OzEb5TractRow | null; lookupFailed: boolean;
};

const INCENTIVE_LABELS: Record<OzIncentive, string> = { '': 'Any or none', any: 'Any incentive', qct: 'QCT 2026', dda: 'DDA 2026', nmtc: 'NMTC', oz2027: '2027 eligible' };
const has = (row: OzEb5TractSummary, flag: string) => row.badges.some(b => b.flag === flag && b.text !== null);
const CLASS_ORDER: OzEb5Class[] = ['rural_clear', 'rural_interpretation_dependent', 'not_rural_place_per_iiusa', 'unknown', 'not_rural_msa'];
const inBox = (lon: number | null, lat: number | null, b: [number, number, number, number] | null) => !b || (lon !== null && lat !== null && lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]);

export function OzEb5Workspace({ initialQuery }: { initialQuery: string }) {
  // URL: selections and filters push a history entry; map moves replace it (debounced). Back and forward restore it.
  const [ui, update, restored] = useUrlState<OzState>(initialQuery, parseOzState, serialiseOzState);
  const [revision, setRevision] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hovered, setHovered] = useState('');
  const [view, setView] = useState<MapView | null>(null);
  const [pick, setPick] = useState(false);
  const [site, setSite] = useState<SiteResult | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [overlay, setOverlay] = useState<Overlay>('');
  const [assetSource, setAssetSource] = useState('');
  const [assetExpiring, setAssetExpiring] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [wide, setWide] = useState(true);
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('half');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState(ui.q);
  // Back and Forward reset the search box to the restored URL.
  const [seenRestore, setSeenRestore] = useState(restored);
  if (restored !== seenRestore) { setSeenRestore(restored); setQ(ui.q); }
  // The list panel's width: remembered when storage allows, live while dragging, the stylesheet default otherwise.
  const listWidth = useListWidth();
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  const listRef = useRef<HTMLElement>(null);
  const shownWidth = liveWidth ?? listWidth.width;

  // Viewport classes: a phone gets the sheet layout, below 1280px the drawer overlays the map instead of pushing it.
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 760px)'), desk = window.matchMedia('(min-width: 1280px)');
    const apply = () => { setMobile(phone.matches); setWide(desk.matches); };
    apply();
    phone.addEventListener('change', apply); desk.addEventListener('change', apply);
    return () => { phone.removeEventListener('change', apply); desk.removeEventListener('change', apply); };
  }, []);
  useEffect(() => { const t = setTimeout(() => { if (q !== ui.q) update({ q }, 'replace'); }, 250); return () => clearTimeout(t); }, [q, ui.q, update]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onView = useCallback((v: MapView) => {
    setView(v);
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => update({ at: [v.center[0], v.center[1], v.zoom] }, 'replace'), 300);
  }, [update]);

  // ---------- data ----------
  const is2027 = ui.mode === '2027';
  const summary = useJson<Summary2018>('/api/research/oz-eb5?summary=1', revision);
  const run2018 = summary.data?.run ?? null;
  const rows2018 = useMemo(() => summary.data?.rows ?? [], [summary.data]);
  const markets = useJson<Markets>(!is2027 && ui.tab === 'markets' ? `/api/research/oz-eb5/markets${ui.state ? `?state=${encodeURIComponent(ui.state)}` : ''}` : '', revision);
  const assetsUrl = useMemo(() => {
    if (is2027 || ui.tab !== 'assets') return '';
    const p = new URLSearchParams();
    if (ui.tract) p.set('geoid', ui.tract); else if (ui.state) p.set('state', ui.state);
    if (assetSource) p.set('source', assetSource);
    if (assetExpiring) p.set('expiring', '1');
    return `/api/research/oz-eb5/assets${p.size ? `?${p}` : ''}`;
  }, [is2027, ui.tab, ui.tract, ui.state, assetSource, assetExpiring]);
  const assets = useJson<Assets>(assetsUrl, revision);
  const states = useJson<States2027>(is2027 || aboutOpen ? '/api/research/oz2027/states' : '', revision);
  const run2027 = states.data?.run ?? null;
  const points = useJson<Points2027>(is2027 && run2027 ? `/api/research/oz2027/points?run=${run2027.id}` : '', revision, 'default');
  const list2027Url = useMemo(() => {
    if (!is2027) return '';
    const p = new URLSearchParams();
    if (ui.state) p.set('state', ui.state);
    if (ui.status) p.set('status', ui.status);
    if (ui.ozRural) p.set('rural', '1');
    if (ui.both) p.set('both', '1');
    if (ui.q) p.set('county', ui.q);
    return `/api/research/oz2027${p.size ? `?${p}` : ''}`;
  }, [is2027, ui.state, ui.status, ui.ozRural, ui.both, ui.q]);
  const list2027 = useJson<Tracts2027>(list2027Url, revision);

  // ---------- 2018 filtering, done here because the whole non-metropolitan list is 1,968 rows ----------
  const query = ui.q.trim().toLowerCase();
  const base2018 = useMemo(() => rows2018.filter(r =>
    (!ui.state || r.state === ui.state)
    && (!query || r.countyName.toLowerCase().includes(query) || r.geoid2010.startsWith(query))
    && (ui.inc === '' || (ui.inc === 'any' ? r.badges.some(b => b.text !== null) : has(r, ui.inc)))
    && (!ui.props || r.propertyCount > 0)), [rows2018, ui.state, query, ui.inc, ui.props]);
  const classCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of base2018) c[r.eb5RuralClass] = (c[r.eb5RuralClass] ?? 0) + 1; return c; }, [base2018]);
  const area = ui.area && view ? view.bounds : null;
  const filtered2018 = useMemo(() => {
    const out = base2018.filter(r => ui.cls.includes(r.eb5RuralClass) && (!area || inBox(r.labelLon, r.labelLat, area)));
    const key = (r: OzEb5TractSummary) => `${r.state}|${r.countyName}|${r.geoid2010}`;
    const nullLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a);
    return out.sort((a, b) => ui.sort === 'poverty' ? nullLast(a.acs2024PovertyRate, b.acs2024PovertyRate) || key(a).localeCompare(key(b))
      : ui.sort === 'properties' ? b.propertyCount - a.propertyCount || key(a).localeCompare(key(b))
        : ui.sort === 'class' ? CLASS_ORDER.indexOf(a.eb5RuralClass) - CLASS_ORDER.indexOf(b.eb5RuralClass) || key(a).localeCompare(key(b))
          : key(a).localeCompare(key(b)));
  }, [base2018, ui.cls, area, ui.sort]);
  const rows2027 = useMemo(() => {
    const rows = list2027.data?.rows ?? [];
    return area ? rows.filter(r => inBox(r.labelLon, r.labelLat, area)) : rows;
  }, [list2027.data, area]);

  // ---------- map inputs ----------
  const points2018 = useMemo<MapPoint[]>(() => filtered2018.filter(r => r.labelLon !== null && r.labelLat !== null).map(r => ({ geoid: r.geoid2010, lon: r.labelLon!, lat: r.labelLat!, cls: r.eb5RuralClass, county: r.countyName, state: r.state })),
    [filtered2018]);
  const rowsById2027 = useMemo(() => new Map((list2027.data?.rows ?? []).map(r => [r.geoid2020, r])), [list2027.data]);
  const points2027 = useMemo<MapPoint[]>(() => {
    const tiers = points.data?.tiers ?? [...OZ2027_TIERS];
    if (ui.both || ui.q) return (list2027.data?.rows ?? []).map(r => ({ geoid: r.geoid2020, lon: r.labelLon, lat: r.labelLat, tier: r.headlineStatus, county: r.county, state: r.state }));
    const stateFips = ui.state ? STATE_FIPS[ui.state] ?? '' : '';
    // County names label the tooltip where the bounded list carries them; the point itself needs only its tier.
    return (points.data?.rows ?? []).filter(([geoid, , , tier, rural]) => (!stateFips || geoid.startsWith(stateFips)) && (!ui.status || tiers[tier] === ui.status) && (!ui.ozRural || rural === 1))
      .map(([geoid, lon, lat, tier]) => ({ geoid, lon, lat, tier: tiers[tier], county: rowsById2027.get(geoid)?.county ?? `Tract ${geoid}`, state: STATE_BY_FIPS[geoid.slice(0, 2)] }));
  }, [points.data, ui.state, ui.status, ui.ozRural, ui.both, ui.q, list2027.data, rowsById2027]);
  const tierCounts = useMemo(() => { const c: Record<string, number> = {}; for (const p of points2027) if (p.tier) c[p.tier] = (c[p.tier] ?? 0) + 1; return c; }, [points2027]);
  const compare2018 = useMemo<MapPoint[]>(() => (is2027 && ui.compare ? rows2018.filter(r => r.labelLon !== null).map(r => ({ geoid: r.geoid2010, lon: r.labelLon!, lat: r.labelLat!, only2018: !r.oz2027 || r.oz2027.badge === 'not_eligible' || r.oz2027.badge === 'sliver_only' })) : []), [is2027, ui.compare, rows2018]);
  const overlayGeoids = useMemo(() => (overlay ? rows2018.filter(r => has(r, overlay)).map(r => r.geoid2010) : []), [overlay, rows2018]);

  // ---------- selection ----------
  const listRows: ListRow[] = is2027 ? rows2027 : filtered2018;
  const ids = useMemo(() => listRows.map(r => ('geoid2010' in r ? r.geoid2010 : r.geoid2020)), [listRows]);
  const position = ui.tract ? ids.indexOf(ui.tract) + 1 : 0;
  const select = useCallback((geoid: string) => { update({ tract: geoid }); if (mobile && geoid) setSheet('full'); }, [update, mobile]);
  const step = (delta: number) => { const i = ids.indexOf(ui.tract) + delta; if (i >= 0 && i < ids.length) select(ids[i]); };
  const drawerOpen = !!ui.tract || (is2027 && ui.tab === 'states' && !!ui.state);
  const padRight = drawerOpen && !wide && !mobile ? 440 : 0;
  const metroCount = Number(run2018?.counts?.not_rural_msa ?? 0);

  // ---------- site test ----------
  const runSiteTest = useCallback(async (lat: string, lon: string) => {
    setSiteBusy(true); setSiteError(''); setSite(null);
    try {
      const response = await fetch(`/api/research/oz-eb5/site?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'The point test failed. Retry.');
      setSite(body as SiteResult);
    } catch (error) { setSiteError(error instanceof Error ? error.message : 'The point test failed. Retry.'); } finally { setSiteBusy(false); }
  }, []);
  const startPick = () => { setPick(v => !v); if (mobile) setSheet('peek'); };
  const onPick = (lat: number, lon: number) => {
    setPick(false); setLatitude(lat.toFixed(5)); setLongitude(lon.toFixed(5));
    update({ mode: '2018', tab: 'site', tract: '' });
    if (mobile) setSheet('half');
    void runSiteTest(lat.toFixed(5), lon.toFixed(5));
  };
  const setMode = (mode: '2018' | '2027') => update({ ...DEFAULT_OZ_STATE, mode, view: ui.view, at: ui.at, state: ui.state, cls: ui.cls, tab: mode === '2027' ? 'states' : 'tracts' });

  const download = () => {
    const header = is2027 ? ['geoid_2020', 'state', 'county', 'status', 'oz_rural', 'overlap_2018_pct'] : ['geoid_2010', 'state', 'county', 'eb5_class', 'poverty_2024', 'properties'];
    const lines = is2027 ? rows2027.map(r => [r.geoid2020, r.state, r.county, r.headlineStatus, r.ruralStatus, r.overlap2018LandPct]) : filtered2018.map(r => [r.geoid2010, r.state, r.countyName, r.eb5RuralClass, r.acs2024PovertyRate ?? '', r.propertyCount]);
    const csv = [header, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `oz-${ui.mode}-tracts${ui.state ? `-${STATE_ABBR[ui.state] ?? ui.state}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const updated = is2027 ? run2027?.importedAt : run2018?.importedAt;
  const loadError = is2027 ? states.error || list2027.error : summary.error;
  const noRun = is2027 ? !states.loading && !states.error && states.data === null : !summary.loading && !summary.error && summary.data === null;
  const listCount = is2027 ? (ui.tab === 'states' ? states.data?.states.length ?? 0 : list2027.data?.total ?? 0) : filtered2018.length;
  const showList = ui.view !== 'map', showMap = ui.view !== 'table';
  const chrome = { position, total: ids.length, onPrev: () => step(-1), onNext: () => step(1), onClose: () => (ui.tract ? update({ tract: '' }) : update({ state: '' })), mobile };
  const selectedState = is2027 && ui.tab === 'states' && ui.state ? states.data?.states.find(s => s.state === ui.state) ?? null : null;

  const filtersFields = <>
    <label className="oz-field oz-select"><span className="sr-only">State or territory</span>
      <select aria-label="State or territory" value={ui.state} onChange={e => update({ state: e.target.value, tract: '' })}>
        <option value="">All states</option>{OZ_EB5_STATE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
      </select><ChevronDown size={18} aria-hidden="true" /></label>
    {!is2027 ? <>
      <label className="oz-field oz-select"><span className="sr-only">Incentive</span>
        <select aria-label="Incentive" value={ui.inc} onChange={e => update({ inc: e.target.value as OzIncentive })}>
          {(['', 'any', 'qct', 'dda', 'nmtc', 'oz2027'] as OzIncentive[]).map(v => <option key={v} value={v}>{v === '' ? 'Any incentive or none' : INCENTIVE_LABELS[v]}</option>)}
        </select><ChevronDown size={18} aria-hidden="true" /></label>
      <label className="oz-cbx"><input type="checkbox" checked={ui.props} onChange={e => update({ props: e.target.checked })} />Has properties</label>
    </> : <>
      <label className="oz-field oz-select"><span className="sr-only">2027 status</span>
        <select aria-label="2027 status" value={ui.status} onChange={e => update({ status: e.target.value as Oz2027Tier | '', tract: '' })}>
          <option value="">All statuses</option>{OZ2027_TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
        </select><ChevronDown size={18} aria-hidden="true" /></label>
      <label className="oz-cbx"><input type="checkbox" checked={ui.ozRural} onChange={e => update({ ozRural: e.target.checked })} />OZ-rural</label>
      <label className="oz-cbx"><input type="checkbox" checked={ui.both} onChange={e => update({ both: e.target.checked })} />OZ-rural and EB-5 rural</label>
      <label className="oz-cbx"><input type="checkbox" checked={ui.compare} onChange={e => update({ compare: e.target.checked })} />Compare with 2018</label>
    </>}
  </>;

  return <div className={`oz-page${mobile ? ' phone' : ''}`} data-view={ui.view} data-drawer={drawerOpen || undefined} data-wide={wide || undefined}
    style={shownWidth && !mobile ? ({ '--list-w': `${shownWidth}px` } as React.CSSProperties) : undefined}>
    <header className="oz-head">
      <h1>{mobile ? 'OZ / EB-5' : 'OZ / EB-5 rural screen'}</h1>
      {mobile
        ? <div className="oz-seg" role="tablist" aria-label="Round">{(['2018', '2027'] as const).map(m => <button key={m} type="button" role="tab" aria-selected={ui.mode === m} className={ui.mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}</div>
        : <nav className="oz-modes" role="tablist" aria-label="Round">{(['2018', '2027'] as const).map(m => <button key={m} type="button" role="tab" aria-selected={ui.mode === m} className={ui.mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === '2018' ? '2018 zones' : '2027 round'}</button>)}</nav>}
      {!mobile && <div className="oz-head-right">
        <span className="oz-stamp">{updated ? `Updated ${dateLabel(updated)}` : ''}</span>
        <button type="button" className="oz-textbtn" onClick={() => setAboutOpen(true)}><Info size={18} aria-hidden="true" />About this data</button>
      </div>}
    </header>
    <div className="oz-filters">
      <label className="oz-field oz-search"><Search size={18} aria-hidden="true" /><input aria-label="Search county or tract" placeholder={mobile ? 'County or tract' : 'Search county or tract'} value={q} onChange={e => setQ(e.target.value)} />{q && <button type="button" className="oz-clear" aria-label="Clear search" onClick={() => setQ('')}><X size={16} /></button>}</label>
      {mobile ? <button type="button" className="oz-fbtn" aria-label="Filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}><Filter size={20} /></button> : filtersFields}
      {!mobile && <div className="oz-seg oz-views" role="group" aria-label="View">
        {([['map', 'Map', MapIcon], ['split', 'Split', Columns2], ['table', 'Table', Table2]] as const).map(([v, label, Icon]) => <button key={v} type="button" aria-pressed={ui.view === v} className={ui.view === v ? 'on' : ''} onClick={() => update({ view: v })}><Icon size={17} aria-hidden="true" />{label}</button>)}
      </div>}
    </div>
    {mobile && filtersOpen && <div className="oz-sheet-filters" role="dialog" aria-label="Filters">
      <div className="oz-sheet-hd"><strong>Filters</strong><button type="button" className="oz-icon" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X size={20} /></button></div>
      <div className="oz-sheet-body">{filtersFields}<button type="button" className="oz-textbtn" onClick={() => { setFiltersOpen(false); setAboutOpen(true); }}><Info size={18} aria-hidden="true" />About this data</button></div>
    </div>}

    <div className="oz-ws">
      {showList && <section ref={listRef} className={`oz-list${mobile ? ` sheet ${sheet}` : ''}`} aria-label="Tracts">
        {mobile && <button type="button" className="oz-handle" aria-label="Resize the list" onClick={() => setSheet(s => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'))}><i /></button>}
        <div className="oz-tabs" role="tablist" aria-label="Panels">
          {(is2027 ? [['states', 'States', states.data?.states.length], ['tracts', 'Tracts', list2027.data?.total]] : [['tracts', 'Tracts', filtered2018.length], ['markets', 'Markets', markets.data?.rows.length], ['assets', 'Assets', assets.data?.total], ['site', 'Site test', undefined]] as Array<[string, string, number | undefined]>)
            .map(([tab, label, n]) => <button key={tab} type="button" role="tab" aria-selected={ui.tab === tab} className={ui.tab === tab ? 'on' : ''} onClick={() => update({ tab: tab as string })}>{label}{n !== undefined && <span className="n">{int(n as number)}</span>}</button>)}
          {!mobile && <span className="tail"><button type="button" className="oz-icon" aria-label={showMap ? 'Collapse the list into the map' : 'Show the map'} onClick={() => update({ view: ui.view === 'split' ? 'map' : 'split' })}>{ui.view === 'table' ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button></span>}
        </div>
        {loadError && <div className="oz-alert" role="alert">{loadError} <button type="button" className="oz-textbtn" onClick={() => setRevision(v => v + 1)}>Retry</button></div>}
        {noRun && <div className="oz-empty-state"><h2>No run imported</h2><p>{is2027 ? 'Apply migration 009 and run the 2027 import.' : 'Apply migrations 007 and 008 and run the import.'}</p></div>}

        {(ui.tab === 'tracts') && <>
          <div className="oz-toolbar">
            <span className="count">{area ? `${int(listRows.length)} in map area` : is2027 ? (list2027.data?.truncated ? `${int(list2027.data.limit)} of ${int(list2027.data.total)} tracts` : `${int(listCount)} tracts`) : `${int(listCount)} tracts`}</span>
            <span className="right">
              <label className="oz-cbx"><input type="checkbox" checked={ui.area} onChange={e => update({ area: e.target.checked })} />Map area only</label>
              {!is2027 && <label className="oz-sort"><span>Sort:</span><select aria-label="Sort" value={ui.sort} onChange={e => update({ sort: e.target.value as OzState['sort'] }, 'replace')}><option value="state">State</option><option value="poverty">Poverty</option><option value="properties">Properties</option><option value="class">Class</option></select></label>}
              <button type="button" className="oz-icon" aria-label="Download these tracts as CSV" onClick={download}><Download size={19} /></button>
            </span>
          </div>
          <OzEb5List mode={ui.mode} rows={listRows} table={ui.view === 'table'} compact={mobile} selected={ui.tract} hovered={hovered} onSelect={select} onHover={setHovered} />
        </>}

        {is2027 && ui.tab === 'states' && states.data && <Oz2027States states={states.data.states} selected={ui.state} onSelect={state => update({ state, tract: '' })} />}

        {!is2027 && ui.tab === 'markets' && <div className="oz-panel">
          <table className="oz-stbl"><thead><tr><th>County</th><th>CBSA</th><th className="r">Rural clear</th><th className="r">Designated</th></tr></thead>
            <tbody>{(markets.data?.rows ?? []).map(m => <tr key={m.countyFips} tabIndex={0} onClick={() => { setQ(m.countyName); update({ state: m.state, q: m.countyName, tab: 'tracts' }); }} onKeyDown={e => { if (e.key === 'Enter') { setQ(m.countyName); update({ state: m.state, q: m.countyName, tab: 'tracts' }); } }}>
              <td><div className="oz-t2"><span className="a">{m.countyName}, {STATE_ABBR[m.state] ?? m.state}</span><code className="b">{m.countyFips}</code></div></td>
              <td>{m.cbsaTitle || 'None'}</td><td className="r">{int(m.ruralClear)}</td><td className="r">{int(m.designated)}</td>
            </tr>)}</tbody></table>
        </div>}

        {!is2027 && ui.tab === 'assets' && <div className="oz-panel">
          <div className="oz-panel-filters">
            {ui.tract ? <span className="oz-cbx">Tract <code>{ui.tract}</code> <button type="button" className="oz-textbtn" onClick={() => update({ tract: '' })}>Clear</button></span> : null}
            <label className="oz-field oz-select"><span className="sr-only">Source</span><select aria-label="Source" value={assetSource} onChange={e => setAssetSource(e.target.value)}><option value="">All sources</option>{OZ_EB5_ASSET_SOURCES.map(s => <option key={s} value={s}>{OZ_EB5_ASSET_SOURCE_LABELS[s]}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label>
            <label className="oz-cbx"><input type="checkbox" checked={assetExpiring} onChange={e => setAssetExpiring(e.target.checked)} />Ends by 2030</label>
          </div>
          {assets.data?.truncated && <p className="oz-dr-note">First {int(assets.data.limit)} shown. Choose a state or a tract.</p>}
          <table className="oz-stbl"><thead><tr><th>Property</th><th>Source</th><th className="r">Units</th><th>Ends</th></tr></thead>
            <tbody>{(assets.data?.rows ?? []).map(a => <tr key={`${a.source}:${a.sourceObjectId}`} tabIndex={0} onClick={() => select(a.geoid2010)} onKeyDown={e => { if (e.key === 'Enter') select(a.geoid2010); }}>
              <td><div className="oz-t2"><span className="a">{a.propertyName || a.address}</span><span className="b">{a.city}, {a.stateAbbr}</span></div></td>
              <td>{OZ_EB5_ASSET_SOURCE_LABELS[a.source]}</td><td className="r">{a.totalUnits === null ? '—' : int(a.totalUnits)}</td>
              <td>{a.expirationYear ?? '—'}</td>
            </tr>)}</tbody></table>
        </div>}

        {!is2027 && ui.tab === 'site' && <div className="oz-panel oz-site">
          <form className="oz-site-form" onSubmit={e => { e.preventDefault(); void runSiteTest(latitude, longitude); }}>
            <label>Latitude<input inputMode="decimal" value={latitude} placeholder="45.71792" onChange={e => setLatitude(e.target.value)} /></label>
            <label>Longitude<input inputMode="decimal" value={longitude} placeholder="-107.57763" onChange={e => setLongitude(e.target.value)} /></label>
            <button type="submit" className="oz-btn primary" disabled={siteBusy || !latitude || !longitude}>{siteBusy ? 'Testing' : 'Test'}</button>
            <button type="button" className="oz-btn" aria-pressed={pick} onClick={startPick}>{pick ? 'Cancel' : 'Pick on map'}</button>
          </form>
          {siteError && <div className="oz-alert" role="alert">{siteError}</div>}
          {site && <dl className="oz-fv oz-site-result">
            <dt>Result</dt><dd><strong>{site.verdict}</strong></dd>
            <dt>Class</dt><dd>{(OZ_EB5_CLASSES as readonly string[]).includes(site.eb5RuralClass) ? <ClassLabel cls={site.eb5RuralClass as OzEb5Class} /> : site.eb5RuralClass.replace(/_/g, ' ')}</dd>
            <dt>Point</dt><dd>{site.latitude}, {site.longitude}</dd>
            <dt>2018 tract</dt><dd>{site.tract2010 ? <button type="button" className="oz-link" onClick={() => site.tract2010 && select(site.tract2010)}><code>{site.tract2010}</code></button> : '—'}</dd>
            <dt>Designated</dt><dd>{site.ozDesignated}</dd>
            <dt>Metro area</dt><dd>{site.cbsa.type === 'metropolitan' ? site.cbsa.title : 'None (OMB 2023)'}</dd>
            <dt>Place</dt><dd>{site.place ? `${site.place.name}, ${site.place.pop === null ? 'population not returned' : int(site.place.pop)}` : 'None'}</dd>
            {site.countySubdivision && <><dt>Town</dt><dd>{site.countySubdivision.name}, {site.countySubdivision.pop === null ? 'population not returned' : int(site.countySubdivision.pop)}</dd></>}
            <dt>Tract screen</dt><dd>{site.tract ? CLASS_LABELS[site.tract.eb5RuralClass] : 'None'}</dd>
            <dt>Reason</dt><dd>{site.classReason}</dd>
            {site.notes.map(n => <div key={n} className="oz-fv-row"><dt>Note</dt><dd>{n}</dd></div>)}
          </dl>}
        </div>}
      </section>}

      {showList && showMap && !mobile && <ListDivider listRef={listRef} onLive={setLiveWidth}
        onCommit={width => { listWidth.setWidth(width); setResizeTick(t => t + 1); }} onReset={() => { listWidth.setWidth(null); setResizeTick(t => t + 1); }} />}
      {showMap && <div className="oz-mapwrap">
        {!showList && !mobile && <ShowListHandle onOpen={width => { if (width) listWidth.setWidth(width); update({ view: 'split' }); setResizeTick(t => t + 1); }} />}
        <OzEb5Map mode={ui.mode} run={is2027 ? run2027?.id ?? null : run2018?.id ?? null} run2018={run2018?.id ?? null}
          points={is2027 ? points2027 : points2018} classes={ui.cls} classCounts={classCounts} metroCount={metroCount} tierCounts={tierCounts}
          overlay={overlay} overlayGeoids={overlayGeoids} compare={ui.compare} compare2018={compare2018}
          selected={ui.tract} hovered={hovered} focusState={ui.state}
          onSelect={select} onHover={setHovered} onView={onView}
          onToggleClass={cls => update({ cls: ui.cls.includes(cls) ? ui.cls.filter(c => c !== cls) : [...ui.cls, cls] })} onOverlay={setOverlay}
          pick={pick} onTogglePick={startPick} onPick={onPick} initialAt={ui.at} padRight={padRight} mobile={mobile} resizeTick={resizeTick} />
      </div>}

      {ui.tract && !is2027 && <Tract2018Drawer key={ui.tract} geoid={ui.tract} chrome={chrome} revision={revision} onTestPoint={startPick} onOpenProperties={() => update({ tab: 'assets' })} />}
      {ui.tract && is2027 && <Tract2027Drawer key={ui.tract} geoid={ui.tract} chrome={chrome} revision={revision} onTestPoint={startPick} onOpen2018={geoid => update({ ...DEFAULT_OZ_STATE, mode: '2018', tab: 'tracts', tract: geoid, view: ui.view, at: ui.at })} />}
      {!ui.tract && selectedState && <StateDrawer key={selectedState.state} state={selectedState} sources={states.data?.sources ?? []} chrome={{ ...chrome, position: 0, total: 0 }} onShowTracts={() => update({ tab: 'tracts' })} />}
    </div>
    <OzEb5About open={aboutOpen} onClose={() => setAboutOpen(false)} run2018={run2018} run2027={run2027} sources2027={states.data?.sources ?? []} onReload={() => { setRevision(v => v + 1); setAboutOpen(false); }} />
    <span className="sr-only" role="status">{summary.loading || list2027.loading ? 'Loading' : ''}</span>
  </div>;
}

// State FIPS codes for filtering and labelling the 2027 points, which carry only a GEOID.
const STATE_FIPS: Record<string, string> = {
  Alabama: '01', Alaska: '02', Arizona: '04', Arkansas: '05', California: '06', Colorado: '08', Connecticut: '09', Delaware: '10', 'District of Columbia': '11', Florida: '12', Georgia: '13',
  Hawaii: '15', Idaho: '16', Illinois: '17', Indiana: '18', Iowa: '19', Kansas: '20', Kentucky: '21', Louisiana: '22', Maine: '23', Maryland: '24', Massachusetts: '25', Michigan: '26',
  Minnesota: '27', Mississippi: '28', Missouri: '29', Montana: '30', Nebraska: '31', Nevada: '32', 'New Hampshire': '33', 'New Jersey': '34', 'New Mexico': '35', 'New York': '36',
  'North Carolina': '37', 'North Dakota': '38', Ohio: '39', Oklahoma: '40', Oregon: '41', Pennsylvania: '42', 'Rhode Island': '44', 'South Carolina': '45', 'South Dakota': '46',
  Tennessee: '47', Texas: '48', Utah: '49', Vermont: '50', Virginia: '51', Washington: '53', 'West Virginia': '54', Wisconsin: '55', Wyoming: '56', 'American Samoa': '60', Guam: '66',
  'Northern Mariana Islands': '69', 'Puerto Rico': '72', 'Virgin Islands': '78',
};
const STATE_BY_FIPS: Record<string, string> = Object.fromEntries(Object.entries(STATE_FIPS).map(([n, f]) => [f, n]));
