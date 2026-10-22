"use client";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { basemapStyle, COLORS } from "./map-core";

export function MiniMap({ center, label }: { center: [number, number]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const m = new maplibregl.Map({ container: ref.current, style: basemapStyle(), center, zoom: 16, interactive: false, attributionControl: { compact: true } });
    const el = document.createElement("div");
    el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${COLORS.lake};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
    new maplibregl.Marker({ element: el }).setLngLat(center).addTo(m);
    return () => m.remove();
  }, [center]);
  return <div ref={ref} className="mini-map" role="img" aria-label={`Bản đồ vị trí: ${label}`} style={{ position: "relative" }} />;
}
