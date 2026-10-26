"use client";
import * as maplibregl from "maplibre-gl";
import { configureMaplibreWorker } from "./maplibre";
import { type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Coordinate, ImpactItem } from "@/lib/types";
import { basemapStyle, COLORS, STATE_COLOR } from "./map-core";
import { mapRenderOptions } from "./map-render";

export function JourneyMap({ route, origin, destination, impacts, position }: { route: Coordinate[] | null; origin: Coordinate; destination: Coordinate; impacts: ImpactItem[]; position: Coordinate | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    configureMaplibreWorker();
    const m = new maplibregl.Map({ container: ref.current, style: basemapStyle(), center: destination, zoom: 13, attributionControl: { compact: true }, ...mapRenderOptions() });
    m.addControl(new maplibregl.NavigationControl({}), "bottom-right");
    const init = () => {
      if (m.getSource("route")) return;
      m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#ffffff", "line-width": 9 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": COLORS.lake, "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addSource("impacts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "impact-points", type: "circle", source: "impacts", paint: { "circle-color": "#fff", "circle-stroke-color": STATE_COLOR, "circle-stroke-width": 3, "circle-radius": 9 } });
      for (const [c, color] of [[origin, COLORS.info], [destination, "#073B3A"]] as const) {
        const el = document.createElement("div");
        el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
        new maplibregl.Marker({ element: el }).setLngLat(c).addTo(m);
      }
      map.current = m;
      sync();
    };
    if (m.isStyleLoaded()) init(); else m.once("style.load", init);
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function sync() {
    const m = map.current;
    if (!m) return;
    (m.getSource("route") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } }] : [] });
    (m.getSource("impacts") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: impacts.filter((i) => i.coordinate).map((i) => ({ type: "Feature", properties: { truth: i.truth, safety: i.severity === "SAFETY_CRITICAL" ? "BLOCKED" : i.severity === "SIGNIFICANT" ? "AVOID" : i.severity === "MINOR" ? "CAUTION" : "NONE" }, geometry: { type: "Point", coordinates: i.coordinate! } })) });
    const pts = route ?? [origin, destination];
    const b = pts.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(pts[0]!, pts[0]!));
    m.fitBounds(b, { padding: 48, duration: 0, maxZoom: 16 });
  }
  useEffect(sync, [route, impacts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    me.current?.remove();
    if (!position) return;
    const el = document.createElement("div");
    el.setAttribute("role", "img"); el.setAttribute("aria-label", "Vị trí của bạn");
    el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#2878A5;border:3px solid #fff;box-shadow:0 0 0 6px rgba(40,120,165,.25)";
    me.current = new maplibregl.Marker({ element: el }).setLngLat(position).addTo(m);
  }, [position]);
  return <div ref={ref} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Bản đồ tuyến đường. Các tác động dọc tuyến được liệt kê trong bảng bên cạnh." />;
}
