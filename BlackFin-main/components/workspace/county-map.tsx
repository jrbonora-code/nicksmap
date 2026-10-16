"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LibreMap } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { LoaderCircle, MapPinOff } from "lucide-react";
import type { CountyCoverage, Deal } from "../../lib/workspace/types";

type CountyGeoJSON = FeatureCollection<Geometry, { fips: string; name: string; dealCount?: number }>;
type MapStatus = "loading" | "ready" | "unavailable";

export function CountyMap({ coverage, deals, selected, onSelect }: { coverage: CountyCoverage[]; deals: Deal[]; selected: string; onSelect: (fips: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const [resource, setResource] = useState<{ coverage: CountyCoverage[]; deals: Deal[]; status: MapStatus }>({ coverage, deals, status: "loading" });
  // A new data resource is loading immediately; the previous map's ready state cannot carry over.
  const status: MapStatus = resource.coverage === coverage && resource.deals === deals ? resource.status : "loading";
  useEffect(() => { onSelectRef.current = onSelect; selectedRef.current = selected; }, [onSelect, selected]);
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let failed = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFrame: number | undefined;
    const controller = new AbortController();
    // Worker/module failures are not guaranteed to emit a MapLibre error event.
    const initializationTimeout = window.setTimeout(() => {
      if (!disposed) { markUnavailable(); controller.abort(); }
    }, 20_000);
    function setStatus(next: MapStatus) {
      if (!disposed) setResource({ coverage, deals, status: next });
    }
    function markUnavailable() {
      failed = true;
      window.clearTimeout(initializationTimeout);
      setStatus("unavailable");
    }
    async function initialize() {
      try {
        const [maplibre, response] = await Promise.all([import("maplibre-gl"), fetch("/data/florida-counties.geojson", { signal: controller.signal })]);
        if (!response.ok) throw new Error("County boundaries unavailable");
        const data = await response.json() as CountyGeoJSON;
        if (data.type !== "FeatureCollection" || data.features.length !== 67) throw new Error("County boundaries incomplete");
        if (disposed || failed || !container.current) return;
        const counts = new Map(coverage.map(county => [county.fips, county.dealCount]));
        data.features.forEach(feature => { feature.properties.dealCount = counts.get(feature.properties.fips) ?? 0; });
        // The pinned ESM worker and its shared module are copied to public/maplibre at build time.
        maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const instance = new maplibre.Map({ container: container.current, style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#eff5fb" } }] }, center: [-83, 28], zoom: 5, attributionControl: { compact: true, customAttribution: "County boundaries: U.S. Census Bureau, 2025 · Generalized 1:500,000" } });
        map.current = instance;
        // MapLibre tracks window resizes; our panel also changes size without a window resize.
        resizeObserver = new ResizeObserver(() => {
          if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = undefined;
            if (!disposed && instance.getContainer().clientWidth > 0 && instance.getContainer().clientHeight > 0) instance.resize();
          });
        });
        resizeObserver.observe(container.current);
        instance.on("error", () => {
          if (!disposed) markUnavailable();
        });
        instance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        instance.on("load", () => {
          if (disposed || failed) return;
          instance.resize();
          instance.addSource("counties", { type: "geojson", data });
          instance.addLayer({ id: "county-fill", type: "fill", source: "counties", paint: { "fill-color": ["case", [">", ["get", "dealCount"], 0], "#7dabdc", "#d5e0ec"], "fill-opacity": 1 } });
          instance.addLayer({ id: "county-outline", type: "line", source: "counties", paint: { "line-color": "#fff", "line-width": 1 } });
          instance.addLayer({ id: "county-selection", type: "line", source: "counties", filter: ["==", ["get", "fips"], selectedRef.current], paint: { "line-color": "#2469b4", "line-width": 3 } });
          instance.addSource("deals", { type: "geojson", data: { type: "FeatureCollection", features: deals.filter(deal => deal.latitude != null && deal.longitude != null).map(deal => ({ type: "Feature", geometry: { type: "Point", coordinates: [deal.longitude!, deal.latitude!] }, properties: { id: deal.id, name: deal.name } })) } });
          instance.addLayer({ id: "deal-points", type: "circle", source: "deals", paint: { "circle-radius": 6, "circle-color": "#18599c", "circle-stroke-color": "white", "circle-stroke-width": 2 } });
          const bounds = new maplibre.LngLatBounds();
          const extendCoordinates = (value: unknown): void => { if (!Array.isArray(value)) return; if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") bounds.extend([value[0], value[1]]); else value.forEach(extendCoordinates); };
          data.features.forEach(feature => { if ("coordinates" in feature.geometry) extendCoordinates(feature.geometry.coordinates); });
          if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: { top: 32, bottom: 35, left: 32, right: 32 }, duration: 0 });
          instance.on("click", "county-fill", event => { const feature = event.features?.[0]; if (feature?.properties?.fips) onSelectRef.current(String(feature.properties.fips)); });
          instance.on("mouseenter", "county-fill", () => { instance.getCanvas().style.cursor = "pointer"; });
          instance.on("mouseleave", "county-fill", () => { instance.getCanvas().style.cursor = ""; });
          instance.on("click", "deal-points", event => {
            const feature = event.features?.[0];
            if (!feature?.properties || feature.geometry.type !== "Point") return;
            const link = document.createElement("a");
            link.href = `/deals/${encodeURIComponent(String(feature.properties.id))}`;
            link.textContent = String(feature.properties.name);
            link.className = "map-deal-link";
            new maplibre.Popup({ closeButton: true }).setLngLat([feature.geometry.coordinates[0], feature.geometry.coordinates[1]]).setDOMContent(link).addTo(instance);
          });
          // Wait for source processing and a rendered frame before dismissing the loading state.
          instance.once("idle", () => {
            if (!disposed && !failed) { window.clearTimeout(initializationTimeout); setStatus("ready"); }
          });
        });
      } catch { if (!disposed) markUnavailable(); }
    }
    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(initializationTimeout);
      controller.abort();
      resizeObserver?.disconnect();
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      map.current?.remove();
      map.current = null;
    };
  }, [coverage, deals]);
  useEffect(() => {
    if (!map.current || status !== "ready") return;
    map.current.setFilter("county-selection", ["==", ["get", "fips"], selected]);
  }, [selected, status]);
  return <div className="county-map" data-map-state={status}><div ref={container} className="map-canvas" aria-label="Interactive map of Florida county boundaries. Use the county list for keyboard selection." role="region" />{status !== "ready" && <div className="map-state" role="status" aria-live="polite">{status === "loading" ? <><LoaderCircle size={24} className="spin" /><strong>Loading Florida county boundaries…</strong></> : <><MapPinOff size={27} /><strong>The map is unavailable</strong><p>Use the county list to explore the same research coverage.</p></>}</div>}{status === "ready" && <div className="map-legend"><span><i className="legend-swatch" />No deals recorded</span><span><i className="legend-swatch has-deals" />Deals recorded</span><span><i className="legend-point" />Entered location</span></div>}</div>;
}
