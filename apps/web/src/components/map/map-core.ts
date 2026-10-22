"use client";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Basemap: a configured MapLibre style (e.g. MapTiler with a restricted key) or the OpenStreetMap raster
 * fallback. The fallback follows the OSM tile usage policy only for light QA traffic; production must
 * configure NEXT_PUBLIC_MAP_STYLE_URL. The basemap is geography, never a live condition.
 */
export function basemapStyle(): string | StyleSpecification {
  const custom = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (custom) return custom;
  return {
    version: 8,
    sources: {
      osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
    },
    layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.35, "raster-brightness-max": 0.97 } }],
  };
}

export const COLORS = {
  lake: "#12615E", unknown: "#687472", conflict: "#7654A6", caution: "#B7791F", avoid: "#D65A24", blocked: "#982F35", positive: "#2E7D5B", info: "#2878A5",
};

/** Maplibre expression colouring a state feature: safety only when KNOWN, otherwise truth. */
export const STATE_COLOR = [
  "case",
  ["==", ["get", "truth"], "CONFLICT"], COLORS.conflict,
  ["==", ["get", "truth"], "UNKNOWN"], COLORS.unknown,
  ["==", ["get", "safety"], "BLOCKED"], COLORS.blocked,
  ["==", ["get", "safety"], "AVOID"], COLORS.avoid,
  ["==", ["get", "safety"], "CAUTION"], COLORS.caution,
  COLORS.lake,
] as unknown as ExpressionSpecification;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Browser GPS with the approved display policy: <= 2 s future skew, <= 30 s age, bounded accuracy. */
export type BrowserFix = { lat: number; lng: number; accuracy: number; observedAt: number };
export function locateOnce(): Promise<BrowserFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("UNSUPPORTED")); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const age = Date.now() - p.timestamp;
      if (age > 30_000 || age < -2_000) { reject(new Error("STALE_FIX")); return; }
      resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, observedAt: p.timestamp });
    }, (e) => reject(new Error(e.code === 1 ? "PERMISSION_DENIED" : e.code === 3 ? "TIMEOUT" : "UNAVAILABLE")), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  });
}
export const LOCATE_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "Bạn chưa cho phép trình duyệt dùng vị trí. Bạn vẫn có thể kéo bản đồ để khám phá.",
  TIMEOUT: "Chưa lấy được vị trí kịp thời. Hãy thử lại ở nơi thoáng hơn.",
  STALE_FIX: "Vị trí nhận được đã cũ hơn 30 giây nên không được dùng.",
  UNAVAILABLE: "Thiết bị chưa xác định được vị trí.",
  UNSUPPORTED: "Trình duyệt này không hỗ trợ định vị.",
};
