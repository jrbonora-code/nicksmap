'use client';
// The property map, full height beside the list. Points cluster below zoom 12; a click on a point opens its drawer, a
// click on a cluster narrows the list to its members. Points are coloured by OZ eligibility or by maturity year.
// Draw area and Search this view set a rectangle filter. The Layers card holds the colouring, the OZ tracts and the
// base map, with counts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Maximize, Minus, Plus, SquareDashed, ScanSearch } from 'lucide-react';
import type { Map as MapType, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { ScreenRow } from '../../lib/research/types';
import { int } from './oz-eb5-parts';
import { balanceText, splitAddress } from './research-list';
import { usdShort } from './format';

export type MapColour = 'oz' | 'maturity';
const POINT_LAYERS = ['property-points', 'property-points-flat'];
// Checked against the two property colours (normal vision 18.5; CVD 7.5, so the diamond shape carries it too).
const OUTSIDE_COLOUR = '#d0527f';
/** [seq, lon, lat, name, city, state, balanceCents, maturity, specialServicing, zipCentroid] */
export type OutsideLoans = { runId: string; rows: [number, number, number, string, string, string, number | null, string | null, number, number][] };
/** A 28px canvas diamond for the outside-loan layer (drawn at pixel ratio 2, so 14px on screen). */
function diamond() {
  const size = 28, c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d')!;
  g.beginPath(); g.moveTo(size / 2, 2); g.lineTo(size - 2, size / 2); g.lineTo(size / 2, size - 2); g.lineTo(2, size / 2); g.closePath();
  g.fillStyle = OUTSIDE_COLOUR; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
  return g.getImageData(0, 0, size, size);
}
const REGION: [[number, number], [number, number]] = [[-82.95, 25.85], [-81.3, 28.22]];
// Ordinal ramp, one hue, nearest maturity darkest; validated (light end 2.14:1 on the map surface).
const RAMP = ['#0b3445', '#1b5a72', '#2a7896', '#4f93ad', '#79aec2'];
const OZ_COLOURS = { eligible: '#a57817', other: '#285c70' };
export type MaturityBand = 'b0' | 'b1' | 'b2' | 'b3' | 'b4' | 'passed' | 'none';
/** The maturity-year band of a property's earliest reported maturity, relative to the as-of year. */
export function maturityBand(earliest: string | null, asOf: string): MaturityBand {
  if (!earliest) return 'none';
  if (earliest < asOf) return 'passed';
  const years = Number(earliest.slice(0, 4)) - Number(asOf.slice(0, 4));
  return years <= 0 ? 'b0' : years === 1 ? 'b1' : years === 2 ? 'b2' : years <= 4 ? 'b3' : 'b4';
}
export function maturityBandLabels(asOf: string): Record<MaturityBand, string> {
  const y = Number(asOf.slice(0, 4));
  return { b0: String(y), b1: String(y + 1), b2: String(y + 2), b3: `${y + 3} to ${y + 4}`, b4: `${y + 5} or later`, passed: 'Passed', none: 'No reported maturity' };
}
const BANDS: MaturityBand[] = ['b0', 'b1', 'b2', 'b3', 'b4', 'passed', 'none'];

export type ResearchMapView = { center: [number, number]; zoom: number };
export function ResearchMap({ rows, selectedId, onSelect, onCluster, onArea, snapshotId, bounds, queryKey, colour, onColour, asOf, initialAt, onView, resizeTick, padRight = 0, mobile = false, outside = false, onToggleOutside, onOutside, outsideSelected = null }: {
  rows: ScreenRow[]; selectedId: string; onSelect: (id: string) => void; onCluster: (ids: string[]) => void; onArea: (bounds: [number, number, number, number] | null) => void;
  snapshotId: string; bounds: [number, number, number, number] | null; queryKey: string; colour: MapColour; onColour: (c: MapColour) => void; asOf: string;
  initialAt: [number, number, number] | null; onView: (v: ResearchMapView) => void; resizeTick?: number; padRight?: number; mobile?: boolean;
  /** The national layer of CMBS loans outside the property data. */
  outside?: boolean; onToggleOutside?: (on: boolean) => void; onOutside?: (runId: string, seq: number) => void; outsideSelected?: number | null;
}) {
  const container = useRef<HTMLDivElement>(null), map = useRef<MapType | null>(null);
  const callbacks = useRef({ onSelect, onArea, onCluster, onView, onOutside });
  const fitted = useRef<{ query: string; points: string } | null>(initialAt ? { query: queryKey, points: '' } : null);
  const populationVersion = useRef(0);
  const data = useRef(rows);
  const [outsideData, setOutsideData] = useState<OutsideLoans | null>(null);
  const outsideRun = useRef<string | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [basemap, setBasemap] = useState<'light' | 'aerial'>('light'), [oz, setOz] = useState(true);
  const [draw, setDraw] = useState(false), [firstCorner, setFirstCorner] = useState(false), [layersPref, setLayersPref] = useState<boolean | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; id: string } | null>(null);
  const drawing = useRef(false), corner = useRef<[number, number] | null>(null);
  const layersOpen = layersPref ?? !mobile;
  useEffect(() => { callbacks.current = { onSelect, onArea, onCluster, onView, onOutside }; data.current = rows; }, [onSelect, onArea, onCluster, onView, onOutside, rows]);
  const features = useMemo(() => points(rows, asOf), [rows, asOf]);

  useEffect(() => {
    let cancelled = false; let resize: ResizeObserver | undefined;
    void import('maplibre-gl').then(gl => {
      if (cancelled || !container.current) return;
      gl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const m = new gl.Map({
        container: container.current, cooperativeGestures: window.matchMedia('(pointer: coarse)').matches, minZoom: 3, maxZoom: 19, attributionControl: { compact: true },
        ...(initialAt ? { center: [initialAt[0], initialAt[1]] as [number, number], zoom: initialAt[2] } : { center: [-82.28, 27.25] as [number, number], zoom: 7.4 }),
        style: { version: 8, sources: {
          streets: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' },
          aerial: { type: 'raster', tiles: ['https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?f=image&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng'], tileSize: 256, minzoom: 10, maxzoom: 19, attribution: 'USGS / USDA NAIP' } },
        layers: [{ id: 'streets', type: 'raster', source: 'streets', paint: { 'raster-saturation': -0.85, 'raster-opacity': 0.9, 'raster-brightness-min': 0.08 } }, { id: 'aerial', type: 'raster', source: 'aerial', layout: { visibility: 'none' } }] },
      });
      map.current = m;
      m.addControl(new gl.ScaleControl({ unit: 'imperial' }), 'bottom-right');
      resize = new ResizeObserver(() => m.resize()); resize.observe(container.current);
      const narrowCluster = async (id: number) => {
        const version = populationVersion.current;
        try {
          const leaves = await (m.getSource('properties') as GeoJSONSource).getClusterLeaves(id, 501, 0);
          if (cancelled || version !== populationVersion.current) return;
          if (leaves.length > 500) { setError('This cluster has more than 500 records. Zoom in first.'); return; }
          const ids = leaves.map(f => String(f.properties?.id));
          const members = data.current.filter(row => ids.includes(row.id));
          if (!ids.length || members.length !== ids.length) throw Error();
          setError(''); fitRows(m, members); callbacks.current.onCluster(ids);
        } catch { if (!cancelled) setError('Cluster selection failed. Retry.'); }
      };
      m.on('load', () => {
        if (cancelled) return;
        m.addSource('oz', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'oz-fill', type: 'fill', source: 'oz', paint: { 'fill-color': '#bc942c', 'fill-opacity': 0.14 } });
        m.addLayer({ id: 'oz-line', type: 'line', source: 'oz', paint: { 'line-color': '#aa8727', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 13, 1.4] } });
        m.addSource('properties', { type: 'geojson', data: points(data.current, asOf), cluster: true, clusterRadius: 32, clusterMaxZoom: 11 });
        m.addLayer({ id: 'clusters', type: 'circle', source: 'properties', filter: ['has', 'point_count'], paint: { 'circle-color': '#365969', 'circle-radius': ['step', ['get', 'point_count'], 16, 20, 20, 100, 25], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
        m.addLayer({ id: 'property-points', type: 'circle', source: 'properties', filter: ['!', ['has', 'point_count']], paint: pointPaint('oz') as never });
        // Coloured by maturity year, every point is drawn: a cluster would hide the colours.
        m.addSource('properties-flat', { type: 'geojson', data: points(data.current, asOf) });
        m.addLayer({ id: 'property-points-flat', type: 'circle', source: 'properties-flat', layout: { visibility: 'none' }, paint: pointPaint('maturity') as never });
        m.addSource('selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        // CMBS loans outside the property data: a diamond, so the layer never depends on colour alone.
        m.addImage('loan-diamond', diamond(), { pixelRatio: 2 });
        m.addSource('outside', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'outside-points', type: 'symbol', source: 'outside', layout: { visibility: 'none', 'icon-image': 'loan-diamond', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 10, 1, 15, 1.3] } });
        m.addLayer({ id: 'outside-selected', type: 'circle', source: 'outside', filter: ['==', ['get', 'seq'], -1], paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111f27', 'circle-stroke-width': 3 } });
        m.addLayer({ id: 'selected-point', type: 'circle', source: 'selection', paint: { 'circle-radius': 11, 'circle-color': '#fff', 'circle-opacity': 0.25, 'circle-stroke-color': '#111f27', 'circle-stroke-width': 3 } });
        m.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#236789', 'fill-opacity': 0.08 } });
        m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#236789', 'line-width': 2, 'line-dasharray': [3, 2] } });
        // DOM cluster labels avoid a font dependency and give each cluster a keyboard target.
        const labels = new Map<number, InstanceType<typeof gl.Marker>>();
        const updateLabels = () => {
          if (!m.getSource('properties')) return;
          const visible = new Set<number>();
          for (const f of m.querySourceFeatures('properties')) {
            const id = f.properties?.cluster_id;
            if (id === undefined || f.geometry.type !== 'Point' || visible.has(id)) continue;
            visible.add(id);
            if (!labels.has(id)) {
              const el = document.createElement('button'); el.className = 'rs-cluster';
              el.addEventListener('click', e => { if (drawing.current) return; e.stopPropagation(); void narrowCluster(id); });
              labels.set(id, new gl.Marker({ element: el }).setLngLat(f.geometry.coordinates as [number, number]).addTo(m));
            }
            const element = labels.get(id)!.getElement();
            element.textContent = String(f.properties.point_count_abbreviated);
            element.setAttribute('aria-label', `Show the ${f.properties.point_count} properties in this cluster`);
          }
          for (const [id, label] of labels) if (!visible.has(id)) { label.remove(); labels.delete(id); }
        };
        m.on('sourcedata', e => { if (e.sourceId === 'properties' && m.isSourceLoaded('properties')) updateLabels(); });
        m.on('moveend', () => { updateLabels(); const c = m.getCenter(); callbacks.current.onView({ center: [c.lng, c.lat], zoom: m.getZoom() }); });
        setReady(true);
      });
      m.on('error', () => setError('A map layer could not load. The list is unaffected.'));
      m.on('mousemove', e => {
        if (drawing.current && corner.current) {
          const [x, y] = corner.current, xx = e.lngLat.lng, yy = e.lngLat.lat;
          (m.getSource('area') as GeoJSONSource)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x, y], [xx, y], [xx, yy], [x, yy], [x, y]]] } });
          return;
        }
        if (!m.getLayer('property-points')) return;
        const f = m.queryRenderedFeatures(e.point, { layers: [...POINT_LAYERS, 'outside-points'].filter(l => m.getLayoutProperty(l, 'visibility') !== 'none') })[0];
        m.getCanvas().style.cursor = f ? 'pointer' : drawing.current ? 'crosshair' : '';
        setTip(f ? { x: e.point.x, y: e.point.y, id: f.layer.id === 'outside-points' ? `outside:${f.properties.seq}` : String(f.properties.id) } : null);
      });
      m.on('mouseout', () => setTip(null));
      m.on('click', e => {
        if (!m.getLayer('property-points')) return;
        if (drawing.current) {
          const here: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (!corner.current) { corner.current = here; setFirstCorner(true); return; }
          const b: [number, number, number, number] = [Math.min(corner.current[0], here[0]), Math.min(corner.current[1], here[1]), Math.max(corner.current[0], here[0]), Math.max(corner.current[1], here[1])];
          corner.current = null; drawing.current = false; setDraw(false); setFirstCorner(false); m.getCanvas().style.cursor = '';
          if (b[0] < b[2] && b[1] < b[3]) callbacks.current.onArea(b);
          return;
        }
        const r = window.matchMedia('(pointer: coarse)').matches ? 12 : 5;
        const f = m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: [...POINT_LAYERS, 'clusters', 'outside-points'].filter(l => m.getLayoutProperty(l, 'visibility') !== 'none') })[0];
        if (!f) return;
        if (f.layer.id === 'outside-points') { if (outsideRun.current) callbacks.current.onOutside?.(outsideRun.current, Number(f.properties.seq)); return; }
        if (f.properties.cluster_id !== undefined) void narrowCluster(f.properties.cluster_id);
        else callbacks.current.onSelect(String(f.properties.id));
      });
    }).catch(() => setError('The map could not start. The list is unaffected.'));
    return () => { cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null; };
    // The map is created once; later inputs flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    populationVersion.current++;
    (map.current.getSource('properties') as GeoJSONSource)?.setData(features);
    (map.current.getSource('properties-flat') as GeoJSONSource)?.setData(features);
    const signature = rows.map(r => `${r.id}:${r.longitude}:${r.latitude}`).sort().join('|');
    // Only a changed query with changed member locations may move the map; sorting, assumptions and panning never do.
    // On a phone the list sheet covers the lower half, so the fit keeps the points above it.
    const bottom = mobile ? Math.round(map.current.getContainer().clientHeight * 0.5) : 60;
    if (!fitted.current || (fitted.current.query !== queryKey && fitted.current.points !== signature && fitted.current.points !== '')) fitRows(map.current, rows, padRight, bottom);
    fitted.current = { query: queryKey, points: signature };
  }, [ready, features, rows, queryKey, padRight, mobile]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const flat = colour === 'maturity';
    for (const id of ['clusters', 'property-points']) m.setLayoutProperty(id, 'visibility', flat ? 'none' : 'visible');
    m.setLayoutProperty('property-points-flat', 'visibility', flat ? 'visible' : 'none');
  }, [ready, colour]);
  useEffect(() => {
    if (!ready) return;
    const source = map.current?.getSource('area') as GeoJSONSource;
    if (!bounds) { source?.setData({ type: 'FeatureCollection', features: [] }); return; }
    const [w, s, e, n] = bounds;
    source?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
  }, [ready, bounds]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const p = rows.find(r => r.id === selectedId);
    (map.current.getSource('selection') as GeoJSONSource).setData(points(p ? [p] : [], asOf));
    if (p && p.longitude !== null && p.latitude !== null) {
      const m = map.current, px = m.project([p.longitude, p.latitude]), c = m.getContainer();
      if (px.x < 40 || px.y < 40 || px.x > c.clientWidth - 40 - padRight || px.y > c.clientHeight - 40) m.easeTo({ center: [p.longitude, p.latitude], zoom: Math.max(m.getZoom(), 12), padding: { right: padRight, left: 0, top: 0, bottom: 0 }, duration: 400 });
    }
  }, [ready, selectedId, rows, asOf, padRight]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void fetch('/api/research/tracts?snapshot=' + snapshotId, { signal: controller.signal, cache: 'no-store' }).then(async r => { if (!r.ok) throw Error(); return r.json(); })
      .then(geo => (map.current?.getSource('oz') as GeoJSONSource)?.setData(geo)).catch(e => { if (e.name !== 'AbortError') setError('OZ tracts could not load. Retry from About this data.'); });
    return () => controller.abort();
  }, [ready, snapshotId]);
  useEffect(() => { if (ready) { map.current?.setLayoutProperty('aerial', 'visibility', basemap === 'aerial' ? 'visible' : 'none'); if (basemap === 'aerial' && map.current!.getZoom() < 10) map.current!.easeTo({ zoom: 10 }); } }, [basemap, ready]);
  useEffect(() => { if (ready) for (const id of ['oz-fill', 'oz-line']) map.current?.setLayoutProperty(id, 'visibility', oz ? 'visible' : 'none'); }, [oz, ready]);
  useEffect(() => { if (resizeTick) requestAnimationFrame(() => map.current?.resize()); }, [resizeTick]);
  // The national layer loads on first use and stays for the page.
  useEffect(() => {
    if (!ready || !outside || outsideData) return;
    const controller = new AbortController();
    void fetch('/api/research/debt/outside', { signal: controller.signal, cache: 'no-store' }).then(async r => { if (!r.ok) throw Error(); return r.json(); })
      .then((d: OutsideLoans | null) => { setOutsideData(d ?? { runId: '', rows: [] }); })
      .catch(e => { if (e.name !== 'AbortError') setError('Loans outside our property data could not load.'); });
    return () => controller.abort();
  }, [ready, outside, outsideData]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    outsideRun.current = outsideData?.runId || null;
    (m.getSource('outside') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: (outsideData?.rows ?? []).map(([seq, lon, lat]) => ({ type: 'Feature', properties: { seq }, geometry: { type: 'Point', coordinates: [lon, lat] } })) });
    m.setLayoutProperty('outside-points', 'visibility', outside ? 'visible' : 'none');
    m.setFilter('outside-selected', ['==', ['get', 'seq'], outside && outsideSelected !== null ? outsideSelected : -1]);
  }, [ready, outside, outsideData, outsideSelected]);

  function toggleDrawing() {
    const next = !draw; drawing.current = next; corner.current = null; setFirstCorner(false); setDraw(next);
    if (!map.current) return;
    map.current.getCanvas().style.cursor = next ? 'crosshair' : '';
    const [w, s, e, n] = bounds ?? [0, 0, 0, 0];
    (map.current.getSource('area') as GeoJSONSource)?.setData(bounds ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } } : { type: 'FeatureCollection', features: [] });
  }
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of features.features) { const k = colour === 'oz' ? (f.properties!.oz === 'eligible' ? 'eligible' : 'other') : f.properties!.band; c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [features, colour]);
  const labels = maturityBandLabels(asOf);
  const tipRow = tip ? rows.find(r => r.id === tip.id) : null;
  const tipLoan = tip?.id.startsWith('outside:') ? outsideData?.rows.find(r => r[0] === Number(tip.id.slice(8))) ?? null : null;
  return <div className="oz-map" data-drawing={draw || undefined} data-flat={colour === 'maturity' || undefined} onKeyDown={e => { if (e.key === 'Escape' && draw) { e.preventDefault(); toggleDrawing(); } }}>
    <div className="oz-map-canvas" ref={container} aria-label="Property map" />
    <div className="oz-map-tr rs-map-tr">
      <button type="button" className="oz-mapbtn" disabled={!ready || draw} onClick={() => { const b = map.current!.getBounds(); onArea([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); }}><ScanSearch size={18} aria-hidden="true" />{mobile ? <span className="sr-only">Search this view</span> : 'Search this view'}</button>
      <button type="button" className="oz-mapbtn" aria-pressed={draw} disabled={!ready} onClick={toggleDrawing}><SquareDashed size={18} aria-hidden="true" />{mobile ? <span className="sr-only">{draw ? 'Cancel' : 'Draw area'}</span> : draw ? 'Cancel' : 'Draw area'}</button>
    </div>
    <div className="oz-map-ctrl" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
      <button type="button" aria-label="Fit the region" onClick={() => map.current?.fitBounds(REGION, { padding: { top: 30, bottom: 30, left: 30, right: 30 + padRight }, duration: 400 })}><Maximize size={16} /></button>
    </div>
    <section className={`oz-layers${layersOpen ? '' : ' closed'}`} aria-label="Layers">
      <button type="button" className="oz-layers-hd" aria-expanded={layersOpen} onClick={() => setLayersPref(!layersOpen)}><Layers size={18} aria-hidden="true" /><span>Layers</span>{layersOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
      {layersOpen && <div className="oz-layers-body">
        <label className="oz-lsel"><span>Color by</span><select aria-label="Color by" value={colour} onChange={e => onColour(e.target.value as MapColour)}><option value="oz">OZ eligibility</option><option value="maturity">Maturity year</option></select></label>
        {colour === 'oz' ? <>
          <div className="oz-lrow"><span className="rs-dot" style={{ background: OZ_COLOURS.eligible }} aria-hidden="true" /><span>Eligible tract</span><span className="n">{int(counts.eligible ?? 0)}</span></div>
          <div className="oz-lrow"><span className="rs-dot" style={{ background: OZ_COLOURS.other }} aria-hidden="true" /><span>Other</span><span className="n">{int(counts.other ?? 0)}</span></div>
        </> : BANDS.map((b, i) => <div key={b} className="oz-lrow"><span className={`rs-dot${b === 'passed' ? ' ring' : ''}`} style={b === 'passed' ? undefined : { background: b === 'none' ? '#9aa7ad' : RAMP[i] }} aria-hidden="true" /><span>{labels[b]}</span><span className="n">{int(counts[b] ?? 0)}</span></div>)}
        {onToggleOutside && <label className="oz-lrow"><input type="checkbox" checked={outside} onChange={e => onToggleOutside(e.target.checked)} /><svg className="rs-diamond" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill={OUTSIDE_COLOUR} stroke="#fff" strokeWidth="1.5" /></svg><span>Loans outside our property data</span>{outside && outsideData && <span className="n">{int(outsideData.rows.length)}</span>}</label>}
        <label className="oz-lrow"><input type="checkbox" checked={oz} onChange={e => setOz(e.target.checked)} /><span className="oz-sw" style={{ background: 'rgba(188,148,44,.25)', borderColor: '#aa8727' }} aria-hidden="true" /><span>OZ tracts</span></label>
        <label className="oz-lsel"><span>Base map</span><select value={basemap} onChange={e => setBasemap(e.target.value as 'light' | 'aerial')}><option value="light">Light</option><option value="aerial">Aerial</option></select></label>
      </div>}
    </section>
    {tipLoan && !mobile && <div className="oz-tip" style={{ left: tip!.x + 14, top: tip!.y + 14 }} role="status">
      <div className="t1">{tipLoan[3] || 'CMBS loan'}</div>
      <div className="t3"><span>{[tipLoan[4], tipLoan[5]].filter(Boolean).join(', ')}</span>{tipLoan[6] !== null && <span>{usdShort(tipLoan[6])}</span>}{tipLoan[8] === 1 && <span>Special servicing</span>}</div>
    </div>}
    {tipRow && !mobile && <div className="oz-tip" style={{ left: tip!.x + 14, top: tip!.y + 14 }} role="status">
      <div className="t1">{splitAddress(tipRow.address).street}</div>
      <div className="t3"><span>{tipRow.countyName}</span>{tipRow.balance && <span>{balanceText(tipRow)}</span>}</div>
    </div>}
    {draw && <div className="oz-map-notice" role="status">{firstCorner ? 'Click the opposite corner' : 'Click the first corner'}</div>}
    {error && <div className="oz-map-notice warn" role="status">{error}</div>}
  </div>;
}
function pointPaint(colour: MapColour) {
  const band = ['match', ['get', 'band'], 'b0', RAMP[0], 'b1', RAMP[1], 'b2', RAMP[2], 'b3', RAMP[3], 'b4', RAMP[4], 'passed', '#ffffff', '#9aa7ad'];
  return {
    'circle-color': colour === 'oz' ? ['case', ['==', ['get', 'oz'], 'eligible'], OZ_COLOURS.eligible, OZ_COLOURS.other] : band,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 12, 6, 17, 8],
    'circle-stroke-width': colour === 'maturity' ? ['case', ['==', ['get', 'band'], 'passed'], 2.2, 1.5] : 1.5,
    'circle-stroke-color': colour === 'maturity' ? ['case', ['==', ['get', 'band'], 'passed'], '#4f6470', '#ffffff'] : '#ffffff',
  };
}
function fitRows(map: MapType, rows: ScreenRow[], padRight = 0, bottom = 60) {
  const c = rows.filter(r => r.longitude !== null && r.latitude !== null);
  if (!c.length) return;
  const lng = c.map(r => r.longitude!), lat = c.map(r => r.latitude!);
  map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: { top: 70, bottom, left: 40, right: 40 + padRight }, maxZoom: 15, duration: 0 });
}
function points(rows: ScreenRow[], asOf: string): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: rows.filter(p => p.longitude !== null && p.latitude !== null).map(p => ({ type: 'Feature', id: p.id, properties: { id: p.id, oz: p.oz, band: maturityBand(p.earliestMaturity, asOf) }, geometry: { type: 'Point', coordinates: [p.longitude!, p.latitude!] } })) };
}
