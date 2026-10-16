'use client';
// The OZ / EB-5 map. Opens on the national fit with one class-shaped point per tract (2018) or one tier-coloured point
// per eligible tract (2027); polygons take over from zoom 7 (2018, per state in view) or zoom 8 (2027, per 2-degree cell),
// each request naming the run so the browser can cache it. Hover and selection are feature-state on both layers.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapType, GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { ChevronDown, ChevronUp, Crosshair, Layers, Maximize, Minus, Plus } from 'lucide-react';
import { OZ_EB5_MAPPED_CLASSES, type OzEb5Class } from '../../lib/research/oz-eb5';
import { OZ2027_TIERS, type Oz2027Tier } from '../../lib/research/oz2027';
import { statesInView, type Bbox } from '../../lib/research/oz-eb5-states';
import { CLASS_COLOURS, CLASS_LABELS, ClassGlyph, INTERP_EDGE, STATE_ABBR, TIER_COLOURS, TIER_EDGE, TIER_LABELS, TierSwatch, int } from './oz-eb5-parts';

export type MapPoint = { geoid: string; lon: number; lat: number; cls?: OzEb5Class; tier?: Oz2027Tier; county?: string; state?: string; only2018?: boolean };
export type MapView = { bounds: Bbox; center: [number, number]; zoom: number };
export type Overlay = '' | 'qct' | 'dda' | 'nmtc';
type Props = {
  mode: '2018' | '2027'; run: string | null; run2018: string | null;
  points: MapPoint[]; classes: OzEb5Class[]; classCounts: Record<string, number>; metroCount: number; tierCounts: Record<string, number>;
  overlay: Overlay; overlayGeoids: string[]; compare: boolean; compare2018: MapPoint[];
  selected: string; hovered: string; focusState: string;
  onSelect: (geoid: string) => void; onHover: (geoid: string) => void; onView: (view: MapView) => void;
  onToggleClass: (cls: OzEb5Class) => void; onOverlay: (overlay: Overlay) => void;
  pick: boolean; onTogglePick: () => void; onPick: (lat: number, lon: number) => void;
  initialAt: [number, number, number] | null; padRight: number; mobile: boolean;
  /** Bumped after the list is resized or re-opened, so the canvas is resized at once. */
  resizeTick?: number;
};
const NATIONAL: [[number, number], [number, number]] = [[-124.8, 24.4], [-66.9, 49.4]];
const POLY_ZOOM = { '2018': 7, '2027': 8 } as const;
const CELL = 2;
const EMPTY = { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] };

function canvasImage(size: number, draw: (c: CanvasRenderingContext2D) => void) {
  const ratio = 2, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * ratio;
  const c = canvas.getContext('2d')!;
  c.scale(ratio, ratio);
  draw(c);
  return { image: c.getImageData(0, 0, size * ratio, size * ratio), ratio };
}
function addImages(m: MapType) {
  const glyph = (name: string, draw: (c: CanvasRenderingContext2D) => void) => { const { image, ratio } = canvasImage(14, draw); if (!m.hasImage(name)) m.addImage(name, { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer) }, { pixelRatio: ratio }); };
  glyph('g-rural_clear', c => { c.beginPath(); c.arc(7, 7, 4.2, 0, Math.PI * 2); c.fillStyle = CLASS_COLOURS.rural_clear; c.fill(); c.lineWidth = 1; c.strokeStyle = '#fff'; c.stroke(); });
  glyph('g-rural_interpretation_dependent', c => { c.beginPath(); c.moveTo(7, 1.5); c.lineTo(12.5, 7); c.lineTo(7, 12.5); c.lineTo(1.5, 7); c.closePath(); c.fillStyle = CLASS_COLOURS.rural_interpretation_dependent; c.fill(); c.lineWidth = 1; c.strokeStyle = INTERP_EDGE; c.stroke(); });
  glyph('g-not_rural_place_per_iiusa', c => { c.beginPath(); c.arc(7, 7, 4, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = CLASS_COLOURS.not_rural_place_per_iiusa; c.stroke(); });
  glyph('g-unknown', c => { c.fillStyle = CLASS_COLOURS.unknown; c.fillRect(2.5, 2.5, 9, 9); c.lineWidth = 1; c.strokeStyle = '#fff'; c.strokeRect(2.5, 2.5, 9, 9); });
  const hatch = (name: string, colour: string, back: string) => {
    const { image, ratio } = canvasImage(8, c => { c.fillStyle = back; c.fillRect(0, 0, 8, 8); c.strokeStyle = colour; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-2, 10); c.lineTo(10, -2); c.moveTo(-2, 2); c.lineTo(2, -2); c.moveTo(6, 10); c.lineTo(10, 6); c.stroke(); });
    if (!m.hasImage(name)) m.addImage(name, { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer) }, { pixelRatio: ratio });
  };
  hatch('hatch-place', CLASS_COLOURS.not_rural_place_per_iiusa, 'rgba(178,69,46,0.10)');
  hatch('hatch-overlay', '#284f60', 'rgba(255,255,255,0)');
  hatch('hatch-warn', '#a87212', 'rgba(232,178,60,0.30)');
}
const cellsFor = ([w, s, e, n]: Bbox) => {
  const cells: Bbox[] = [];
  for (let x = Math.floor(w / CELL) * CELL; x < e; x += CELL) for (let y = Math.floor(s / CELL) * CELL; y < n; y += CELL) cells.push([x, y, x + CELL, y + CELL]);
  return cells;
};

export function OzEb5Map(props: Props) {
  const { mode, run, run2018, points, classes, overlay, overlayGeoids, compare, compare2018, selected, hovered, focusState, pick, initialAt, padRight, mobile, resizeTick = 0 } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapType | null>(null);
  const cb = useRef(props);
  const loaded = useRef(new Map<string, GeoJSON.Feature[]>());
  const compareLoaded = useRef(new Map<string, GeoJSON.Feature[]>());
  const lastSelected = useRef(''), lastHovered = useRef('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(3);
  const [bounds, setBounds] = useState<Bbox | null>(null);
  // Until the reader folds or unfolds the panel, it is open on a desk and folded on a phone so the map stays visible.
  const [layersPref, setLayersPref] = useState<boolean | null>(null);
  const layersOpen = layersPref ?? !mobile;
  const [basemap, setBasemap] = useState<'light' | 'aerial'>('light');
  const [tip, setTip] = useState<{ x: number; y: number; point: MapPoint } | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => { cb.current = props; });
  const byGeoid = useMemo(() => new Map(points.map(p => [p.geoid, p])), [points]);
  const byGeoidRef = useRef(byGeoid);
  useEffect(() => { byGeoidRef.current = byGeoid; }, [byGeoid]);

  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    void import('maplibre-gl').then(gl => {
      if (cancelled || !container.current) return;
      gl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      // On a phone the list sheet covers the lower half, so the national fit keeps the country above it.
      const phone = window.matchMedia('(max-width: 760px)').matches;
      const fitPadding = phone ? { top: 80, left: 12, right: 12, bottom: Math.round(container.current.clientHeight * 0.55) } : 24;
      const m = new gl.Map({
        container: container.current, cooperativeGestures: window.matchMedia('(pointer: coarse)').matches, minZoom: 2, maxZoom: 16,
        attributionControl: { compact: true }, ...(initialAt ? { center: [initialAt[0], initialAt[1]] as [number, number], zoom: initialAt[2] } : { bounds: NATIONAL, fitBoundsOptions: { padding: fitPadding } }),
        style: {
          version: 8,
          sources: {
            streets: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' },
            aerial: { type: 'raster', tiles: ['https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?f=image&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng'], tileSize: 256, minzoom: 9, maxzoom: 19, attribution: 'USGS / USDA NAIP' },
          },
          layers: [
            { id: 'streets', type: 'raster', source: 'streets', paint: { 'raster-saturation': -0.85, 'raster-opacity': 0.9, 'raster-brightness-min': 0.08 } },
            { id: 'aerial', type: 'raster', source: 'aerial', layout: { visibility: 'none' } },
          ],
        },
      });
      map.current = m;
      m.addControl(new gl.ScaleControl({ unit: 'imperial' }), 'bottom-right');
      resize = new ResizeObserver(() => m.resize());
      resize.observe(container.current);
      m.on('load', () => {
        if (cancelled) return;
        addImages(m);
        m.addSource('poly', { type: 'geojson', data: EMPTY, promoteId: 'geoid' });
        m.addSource('cmp', { type: 'geojson', data: EMPTY, promoteId: 'geoid' });
        m.addSource('pts', { type: 'geojson', data: EMPTY, promoteId: 'geoid' });
        const sel = ['boolean', ['feature-state', 'selected'], false];
        const hov = ['boolean', ['feature-state', 'hover'], false];
        // 2018 polygons
        const classFill = ['match', ['get', 'className'], 'rural_clear', CLASS_COLOURS.rural_clear, 'rural_interpretation_dependent', CLASS_COLOURS.rural_interpretation_dependent, 'unknown', CLASS_COLOURS.unknown, CLASS_COLOURS.not_rural_place_per_iiusa];
        m.addLayer({ id: 'p18-fill', type: 'fill', source: 'poly', filter: ['all', ['has', 'className'], ['!=', ['get', 'className'], 'not_rural_place_per_iiusa']],
          paint: { 'fill-color': classFill as never, 'fill-opacity': ['case', sel, 0.5, ['match', ['get', 'className'], 'rural_interpretation_dependent', 0.38, 'unknown', 0.18, 0.3]] as never } });
        m.addLayer({ id: 'p18-place', type: 'fill', source: 'poly', filter: ['==', ['get', 'className'], 'not_rural_place_per_iiusa'], paint: { 'fill-pattern': 'hatch-place' } });
        m.addLayer({ id: 'p18-line', type: 'line', source: 'poly', filter: ['has', 'className'],
          paint: { 'line-color': ['match', ['get', 'className'], 'rural_interpretation_dependent', INTERP_EDGE, classFill] as never, 'line-width': 1.1 } });
        // 2027 polygons
        const tierExpr = (prop: string, colours: Record<string, string>, fallback: string) => { const e: unknown[] = ['match', ['get', prop]]; for (const t of OZ2027_TIERS) e.push(t, colours[t]); e.push(fallback); return e; };
        const tierFill = tierExpr('status', TIER_COLOURS, '#eef3f5'), tierEdge = tierExpr('status', TIER_EDGE, '#aebec5');
        m.addLayer({ id: 'p27-fill', type: 'fill', source: 'poly', filter: ['has', 'status'], paint: { 'fill-color': tierFill as never, 'fill-opacity': ['match', ['get', 'status'], 'eligible', 0, 0.82] as never } });
        m.addLayer({ id: 'p27-line', type: 'line', source: 'poly', filter: ['has', 'status'], paint: { 'line-color': tierEdge as never, 'line-width': 0.9 } });
        // Overlay hatch (2018 incentives) and the 2018 comparison (2027 mode)
        m.addLayer({ id: 'overlay', type: 'fill', source: 'poly', filter: ['in', ['get', 'geoid'], ['literal', []]], paint: { 'fill-pattern': 'hatch-overlay' } });
        m.addLayer({ id: 'cmp-only', type: 'fill', source: 'cmp', filter: ['==', ['get', 'only2018'], true], paint: { 'fill-pattern': 'hatch-warn' } });
        m.addLayer({ id: 'cmp-line', type: 'line', source: 'cmp', paint: { 'line-color': '#111f27', 'line-opacity': 0.7, 'line-width': 1.1, 'line-dasharray': [3, 2] } });
        // Highlight
        m.addLayer({ id: 'hl-halo', type: 'line', source: 'poly', filter: ['has', 'geoid'], paint: { 'line-color': '#ffffff', 'line-opacity': ['case', sel, 0.9, 0] as never, 'line-width': 8 } });
        m.addLayer({ id: 'hl-line', type: 'line', source: 'poly', filter: ['has', 'geoid'], paint: { 'line-color': '#111f27', 'line-opacity': ['case', sel, 1, hov, 0.8, 0] as never, 'line-width': ['case', sel, 2.8, 2] as never } });
        // Points
        m.addLayer({ id: 'pts-2018', type: 'symbol', source: 'pts', filter: ['has', 'cls'], layout: { 'icon-image': ['concat', 'g-', ['get', 'cls']] as never, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 7, 1.15] as never } });
        m.addLayer({ id: 'pts-2027', type: 'circle', source: 'pts', filter: ['has', 'tier'],
          paint: { 'circle-color': tierExpr('tier', TIER_COLOURS, '#eef3f5') as never, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1.8, 7, 4] as never,
            'circle-stroke-color': tierExpr('tier', TIER_EDGE, '#aebec5') as never, 'circle-stroke-width': 0.6 } });
        m.addLayer({ id: 'pts-hl', type: 'circle', source: 'pts', paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111f27', 'circle-stroke-width': ['case', sel, 2.5, hov, 1.5, 0] as never } });
        setReady(true);
      });
      m.on('error', () => setError('A map layer did not load. The list still works.'));
      const report = () => {
        const b = m.getBounds();
        setZoom(m.getZoom());
        setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        cb.current.onView({ bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], center: [m.getCenter().lng, m.getCenter().lat], zoom: m.getZoom() });
        setLoadTick(t => t + 1);
      };
      m.on('moveend', report);
      m.once('idle', report);
      const hitLayers = () => ['pts-2018', 'pts-2027', 'p18-fill', 'p18-place', 'p27-fill', 'p27-line'].filter(id => m.getLayer(id));
      const geoidAt = (e: MapMouseEvent) => {
        const r = window.matchMedia('(pointer: coarse)').matches ? 12 : 5;
        const hit = m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: hitLayers() })[0];
        return hit?.properties?.geoid ? String(hit.properties.geoid) : '';
      };
      m.on('click', e => {
        if (cb.current.pick) { cb.current.onPick(e.lngLat.lat, e.lngLat.lng); return; }
        const geoid = geoidAt(e);
        if (geoid) cb.current.onSelect(geoid);
      });
      m.on('mousemove', e => {
        const geoid = geoidAt(e);
        m.getCanvas().style.cursor = cb.current.pick ? 'crosshair' : geoid ? 'pointer' : '';
        cb.current.onHover(geoid);
        const point = geoid ? byGeoidRef.current.get(geoid) : undefined;
        setTip(point ? { x: e.point.x, y: e.point.y, point } : null);
      });
      m.on('mouseout', () => { cb.current.onHover(''); setTip(null); });
    }).catch(() => setError('The map renderer is unavailable. The list still works.'));
    return () => { cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null; };
    // The map is created once; later prop changes are applied by the effects below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (resizeTick) requestAnimationFrame(() => map.current?.resize()); }, [resizeTick]);

  // Mode change: forget loaded polygons of the other mode.
  useEffect(() => { loaded.current.clear(); if (ready) (map.current?.getSource('poly') as GeoJSONSource | undefined)?.setData(EMPTY); }, [mode, run, ready]);

  // Points
  useEffect(() => {
    if (!ready || !map.current) return;
    const below = POLY_ZOOM[mode];
    const features = points.map(p => ({ type: 'Feature' as const, id: p.geoid, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }, properties: mode === '2018' ? { geoid: p.geoid, cls: p.cls } : { geoid: p.geoid, tier: p.tier } }));
    (map.current.getSource('pts') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    for (const id of ['pts-2018', 'pts-2027', 'pts-hl']) map.current.setLayerZoomRange(id, 0, below);
  }, [ready, points, mode]);

  // Polygons for what is in view, from the polygon zoom up. Each request names the run, so the browser may cache it.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !run) return;
    if (m.getZoom() < POLY_ZOOM[mode] - 0.01 && !focusState) return;
    const b = m.getBounds();
    const bounds: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const keys = mode === '2018'
      ? (focusState ? [focusState] : statesInView(bounds)).map(state => `state:${state}`)
      : cellsFor(bounds).slice(0, 24).map(c => `bbox:${c.join(',')}`);
    const wanted = keys.filter(k => !loaded.current.has(k));
    if (!wanted.length) return;
    const controller = new AbortController();
    const base = mode === '2018' ? '/api/research/oz-eb5/geometry' : '/api/research/oz2027/geometry';
    void Promise.all(wanted.map(async key => {
      const [kind, value] = key.split(/:(.*)/s);
      const response = await fetch(`${base}?${kind}=${encodeURIComponent(value)}&run=${run}`, { signal: controller.signal, cache: 'default' });
      if (!response.ok) throw new Error('geometry');
      const body = await response.json() as { features?: GeoJSON.Feature[] } | null;
      loaded.current.set(key, body?.features ?? []);
    })).then(() => {
      const seen = new Map<string, GeoJSON.Feature>();
      for (const list of loaded.current.values()) for (const f of list) seen.set(String(f.properties?.geoid ?? f.id), f);
      (m.getSource('poly') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [...seen.values()] });
      setError('');
    }).catch(e => { if (e.name !== 'AbortError') setError('Some tract boundaries did not load. Move the map to retry.'); });
    return () => controller.abort();
  }, [ready, run, mode, loadTick, focusState]);

  // The 2018 comparison (2027 mode): dashed outlines of the 2018 zones drawn, hatched where only the 2018 zone qualifies.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const source = m.getSource('cmp') as GeoJSONSource;
    if (mode !== '2027' || !compare || !run2018 || m.getZoom() < 6) { source.setData(EMPTY); return; }
    const b = m.getBounds();
    const states = statesInView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]).filter(s => !compareLoaded.current.has(s));
    const only = new Set(compare2018.filter(p => p.only2018).map(p => p.geoid));
    const paint = () => {
      const features = [...compareLoaded.current.values()].flat().map(f => ({ ...f, properties: { ...f.properties, only2018: only.has(String(f.properties?.geoid)) } }));
      source.setData({ type: 'FeatureCollection', features });
    };
    if (!states.length) { paint(); return; }
    const controller = new AbortController();
    void Promise.all(states.map(async state => {
      const response = await fetch(`/api/research/oz-eb5/geometry?state=${encodeURIComponent(state)}&run=${run2018}`, { signal: controller.signal, cache: 'default' });
      const body = response.ok ? await response.json() as { features?: GeoJSON.Feature[] } | null : null;
      compareLoaded.current.set(state, body?.features ?? []);
    })).then(paint).catch(() => {});
    return () => controller.abort();
  }, [ready, mode, compare, run2018, compare2018, loadTick]);

  // Class filter (2018) and the incentive overlay.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const show = ['in', ['get', 'className'], ['literal', classes]];
    m.setFilter('p18-fill', ['all', ['has', 'className'], ['!=', ['get', 'className'], 'not_rural_place_per_iiusa'], show] as never);
    m.setFilter('p18-place', ['all', ['==', ['get', 'className'], 'not_rural_place_per_iiusa'], show] as never);
    m.setFilter('p18-line', ['all', ['has', 'className'], show] as never);
    m.setFilter('overlay', ['in', ['get', 'geoid'], ['literal', mode === '2018' && overlay ? overlayGeoids : []]] as never);
  }, [ready, classes, overlay, overlayGeoids, mode]);

  // Selection and hover as feature-state on both the polygon and the point source.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const source of ['poly', 'pts']) {
      if (lastSelected.current) m.setFeatureState({ source, id: lastSelected.current }, { selected: false });
      if (selected) m.setFeatureState({ source, id: selected }, { selected: true });
    }
    lastSelected.current = selected;
  }, [ready, selected, mode, loadTick]);
  // Fly once per selection, as soon as its point is known (a shared link can arrive before the list has loaded).
  const flown = useRef('');
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !selected || flown.current === `${mode}:${selected}`) return;
    const point = byGeoid.get(selected);
    if (!point) return;
    flown.current = `${mode}:${selected}`;
    m.easeTo({ center: [point.lon, point.lat], zoom: Math.max(m.getZoom(), mode === '2018' ? 9 : 10), padding: { right: padRight, left: 0, top: 0, bottom: mobile ? 200 : 0 }, duration: 600 });
  }, [ready, selected, mode, padRight, mobile, byGeoid]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const source of ['poly', 'pts']) {
      if (lastHovered.current) m.setFeatureState({ source, id: lastHovered.current }, { hover: false });
      if (hovered) m.setFeatureState({ source, id: hovered }, { hover: true });
    }
    lastHovered.current = hovered;
  }, [ready, hovered, loadTick]);

  // A state chosen in the filter fits the map to it.
  // A link that names a map position keeps it: the chosen state is treated as already fitted.
  const fitted = useRef(initialAt && focusState ? `${mode}:${focusState}` : '');
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focusState || fitted.current === `${mode}:${focusState}`) return;
    if (selected && flown.current !== `${mode}:${selected}`) return;
    const own = points.filter(p => p.state === focusState);
    if (!own.length) return;
    fitted.current = `${mode}:${focusState}`;
    if (selected) return;
    const lons = own.map(p => p.lon), lats = own.map(p => p.lat);
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 60, bottom: 60, left: 60, right: 60 + padRight }, maxZoom: 9, duration: 500 });
    // Fit once per chosen state, once its points are known; later point refreshes never re-fit.
  }, [ready, focusState, mode, points, selected, padRight]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setLayoutProperty('aerial', 'visibility', basemap === 'aerial' ? 'visible' : 'none');
    if (basemap === 'aerial' && m.getZoom() < 9) m.easeTo({ zoom: 9 });
  }, [ready, basemap]);

  const fitNational = () => map.current?.fitBounds(NATIONAL, { padding: { top: 24, bottom: 24, left: 24, right: 24 + padRight }, duration: 500 });
  const tipText = tip ? `${tip.point.county ?? ''}${tip.point.state ? `, ${STATE_ABBR[tip.point.state] ?? tip.point.state}` : ''}` : '';
  const counts = props.classCounts, tiers = props.tierCounts;
  return <div className="oz-map" data-pick={pick || undefined}>
    <div className="oz-map-canvas" ref={container} aria-label={mode === '2018' ? 'Designated 2018 Opportunity Zone tracts by EB-5 rural class' : '2027 Opportunity Zone tracts by status'} />
    <div className="oz-map-tr">
      <button type="button" className="oz-mapbtn" aria-pressed={pick} onClick={props.onTogglePick}><Crosshair size={18} aria-hidden="true" />{mobile ? <span className="sr-only">{pick ? 'Cancel' : 'Test a point'}</span> : pick ? 'Cancel' : 'Test a point'}</button>
    </div>
    <div className="oz-map-ctrl" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
      <button type="button" aria-label="Fit the nation" onClick={fitNational}><Maximize size={16} /></button>
    </div>
    <section className={`oz-layers${layersOpen ? '' : ' closed'}`} aria-label="Layers">
      <button type="button" className="oz-layers-hd" aria-expanded={layersOpen} onClick={() => setLayersPref(!layersOpen)}><Layers size={18} aria-hidden="true" /><span>Layers</span>{layersOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
      {layersOpen && <div className="oz-layers-body">
        {mode === '2018' ? <>
          <p className="oz-layers-st">EB-5 class</p>
          {OZ_EB5_MAPPED_CLASSES.map(cls => <label key={cls} className="oz-lrow"><input type="checkbox" checked={classes.includes(cls)} onChange={() => props.onToggleClass(cls)} /><ClassGlyph cls={cls} /><span>{CLASS_LABELS[cls]}</span><span className="n">{int(counts[cls] ?? 0)}</span></label>)}
          <div className="oz-lrow dim"><span className="oz-cbx-off" aria-hidden="true" /><ClassGlyph cls="not_rural_msa" /><span>Metro, not drawn</span><span className="n">{int(props.metroCount)}</span></div>
          <p className="oz-layers-st">Overlay</p>
          <label className="oz-lsel"><span>Incentive</span><select value={overlay} onChange={e => props.onOverlay(e.target.value as Overlay)}><option value="">None</option><option value="qct">QCT 2026</option><option value="dda">DDA 2026</option><option value="nmtc">NMTC</option></select></label>
        </> : <>
          <p className="oz-layers-st">2027 status</p>
          {OZ2027_TIERS.map(t => <div key={t} className="oz-lrow"><TierSwatch tier={t} /><span>{TIER_LABELS[t]}</span><span className="n">{int(tiers[t] ?? 0)}</span></div>)}
          {compare && <><p className="oz-layers-st">Compared with 2018</p>
            <div className="oz-lrow"><span className="oz-sw dashed" aria-hidden="true" /><span>2018 zone</span></div>
            <div className="oz-lrow"><span className="oz-sw hatch" aria-hidden="true" /><span>2018 only</span></div></>}
        </>}
        <label className="oz-lsel"><span>Base map</span><select value={basemap} onChange={e => setBasemap(e.target.value as 'light' | 'aerial')}><option value="light">Light</option><option value="aerial">Aerial</option></select></label>
      </div>}
    </section>
    {tip && !mobile && <div className="oz-tip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="status">
      <div className="t1">{tipText}</div>
      <div className="t3"><code>{tip.point.geoid}</code>{tip.point.cls ? <span className="oz-cl"><ClassGlyph cls={tip.point.cls} />{CLASS_LABELS[tip.point.cls]}</span> : tip.point.tier ? <span className="oz-cl"><TierSwatch tier={tip.point.tier} />{TIER_LABELS[tip.point.tier]}</span> : null}</div>
    </div>}
    {pick && <div className="oz-map-notice" role="status">Click a point on the map</div>}
    {mode === '2027' && compare && zoom >= 6 && compare2018.length > 0 && <InViewWarning points={compare2018} bounds={bounds} />}
    {error && <div className="oz-map-notice warn" role="status">{error}</div>}
  </div>;
}

function InViewWarning({ points, bounds }: { points: MapPoint[]; bounds: Bbox | null }) {
  if (!bounds) return null;
  const [w, s, e, n0] = bounds;
  const n = points.filter(p => p.only2018 && p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n0).length;
  if (!n) return null;
  return <div className="oz-map-notice warn" role="status">{n.toLocaleString('en-US')} {n === 1 ? 'tract' : 'tracts'} here {n === 1 ? 'is' : 'are'} 2018 only: new purchases generally don&apos;t qualify after 12/31/2026. <a href="https://www.irs.gov/pub/irs-drop/n-26-40.pdf" target="_blank" rel="noreferrer">Notice 2026-40</a></div>;
}
