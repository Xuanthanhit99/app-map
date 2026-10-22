"use client";
import * as maplibregl from "maplibre-gl";
import { configureMaplibreWorker } from "./maplibre";
import { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { DEFAULT_AREA } from "@/lib/config";
import { distance, relativeTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import type { Place, PlaceDetail, PublicReport, RealityState } from "@/lib/types";
import { IconAlert, IconInfo, IconLocate, IconPlus } from "../icons";
import { StateCard, StateChip, domainLabel } from "../state";
import { basemapStyle, COLORS, LOCATE_MESSAGES, locateOnce, prefersReducedMotion, STATE_COLOR, type BrowserFix } from "./map-core";
import { ReportPanel } from "./report-panel";

type Category = { id: string; label: string; placeCount: number };
type Bounds = { west: number; south: number; east: number; north: number };
type Status = { kind: "idle" | "loading" | "error" | "offline"; message?: string };

const toBBox = (b: Bounds) => [b.west, b.south, b.east, b.north].map((n) => n.toFixed(5)).join(",");

export function MapExplorer(props: { initialQuery?: string; initialAt?: [number, number]; initialPlace?: string; openReport?: boolean; signedIn: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(13);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [places, setPlaces] = useState<Place[]>([]);
  const [states, setStates] = useState<RealityState[]>([]);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [selected, setSelected] = useState<PlaceDetail | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fix, setFix] = useState<BrowserFix | null>(null);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const [reporting, setReporting] = useState(Boolean(props.openReport));
  const [collapsed, setCollapsed] = useState(false);
  const [basemapIssue, setBasemapIssue] = useState(false);
  const side = useRef<HTMLElement>(null);
  useEffect(() => { side.current?.scrollTo({ top: 0 }); }, [selected, reporting]);
  const [layers, setLayers] = useState({ places: true, states: true, reports: true });

  // ── Map lifecycle ──
  useEffect(() => {
    if (!container.current || map.current) return;
    configureMaplibreWorker();
    const m = new maplibregl.Map({
      container: container.current,
      style: basemapStyle(),
      center: props.initialAt ? [props.initialAt[1], props.initialAt[0]] : DEFAULT_AREA.center,
      zoom: props.initialAt ? 16 : 13.5,
      maxBounds: [[101.5, 7.5], [110.5, 24]],
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    const init = () => {
      if (m.getSource("places")) return;
      m.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 40, clusterMaxZoom: 15 });
      m.addLayer({ id: "place-clusters", type: "circle", source: "places", filter: ["has", "point_count"],
        paint: { "circle-color": "#DDEDEA", "circle-stroke-color": COLORS.lake, "circle-stroke-width": 1.5, "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 60, 24] } });
      m.addLayer({ id: "place-cluster-count", type: "symbol", source: "places", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#073B3A" } });
      m.addLayer({ id: "place-points", type: "circle", source: "places", filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#073B3A", COLORS.lake], "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 9, 6], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addSource("states", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "state-halo", type: "circle", source: "states", paint: { "circle-color": STATE_COLOR, "circle-opacity": 0.14, "circle-radius": 26 } });
      m.addLayer({ id: "state-points", type: "circle", source: "states", paint: { "circle-color": "#fff", "circle-stroke-color": STATE_COLOR, "circle-stroke-width": 3, "circle-radius": 9 } });
      m.addLayer({ id: "state-glyph", type: "symbol", source: "states", layout: { "text-field": ["get", "glyph"], "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": STATE_COLOR } });
      m.addSource("reports", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "report-cells", type: "circle", source: "reports", paint: { "circle-color": "transparent", "circle-stroke-color": COLORS.unknown, "circle-stroke-width": 1.5, "circle-radius": 14, "circle-stroke-opacity": 0.8 } }, "state-halo");
      m.on("click", "place-clusters", async (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const z = await (m.getSource("places") as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id as number);
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z, duration: prefersReducedMotion() ? 0 : 400 });
      });
      m.on("click", "place-points", (e: maplibregl.MapLayerMouseEvent) => { const id = e.features?.[0]?.properties?.id; if (typeof id === "string") void openPlace(id); });
      for (const l of ["place-points", "place-clusters", "state-points"]) {
        m.on("mouseenter", l, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", l, () => { m.getCanvas().style.cursor = ""; });
      }
      setReady(true);
      const b = m.getBounds();
      setBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    };
    if (m.isStyleLoaded()) init(); else m.once("style.load", init);
    m.on("moveend", () => {
      const b = m.getBounds();
      setBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
      setZoom(m.getZoom());
    });
    // Basemap tile failures are reported separately: they never hide or block reality data.
    m.on("error", () => setBasemapIssue(true));
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connectivity ──
  useEffect(() => {
    const update = () => setStatus(navigator.onLine ? { kind: "idle" } : { kind: "offline", message: messageFor("OFFLINE") });
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => { call<{ items: Category[] }>("/v1/places/categories").then((r) => setCategories(r.items)).catch(() => undefined); }, []);

  // ── Data for the current view ──
  useEffect(() => {
    if (!bounds || !ready) return;
    const span = Math.max(bounds.east - bounds.west, bounds.north - bounds.south);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setStatus((s) => (s.kind === "offline" ? s : { kind: "loading" }));
      try {
        const clipped = span > 0.9 ? null : toBBox(bounds);
        const placeParams = new URLSearchParams({ limit: "100" });
        if (query.trim().length >= 2) placeParams.set("q", query.trim());
        if (category) placeParams.set("category", category);
        if (clipped && span <= 1.9) placeParams.set("bbox", clipped);
        const needsFilter = !placeParams.has("q") && !placeParams.has("category") && !placeParams.has("bbox");
        const [p, s, r] = await Promise.all([
          needsFilter ? Promise.resolve({ items: [] as Place[] }) : call<{ items: Place[] }>(`/v1/places?${placeParams}`, { signal: controller.signal }),
          clipped ? call<{ items: RealityState[] }>(`/v1/reality/states?bbox=${clipped}&domains=ROAD,WEATHER,ACTIVITY`, { signal: controller.signal }) : Promise.resolve({ items: [] }),
          clipped && span <= 0.5 ? call<{ items: PublicReport[] }>(`/v1/reports?bbox=${clipped}`, { signal: controller.signal }) : Promise.resolve({ items: [] }),
        ]);
        setPlaces(p.items); setStates(s.items); setReports(r.items);
        setStatus((st) => (st.kind === "offline" ? st : { kind: "idle" }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus({ kind: e instanceof ClientApiError && e.code === "OFFLINE" ? "offline" : "error", message: messageFor(e instanceof ClientApiError ? e.code : undefined) });
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [bounds, ready, query, category]);

  // ── Push data into map sources ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("places") as GeoJSONSource).setData({ type: "FeatureCollection", features: layers.places ? places.map((p) => ({ type: "Feature", id: p.id, properties: { id: p.id, name: p.name }, geometry: { type: "Point", coordinates: p.coordinate } })) : [] });
    (m.getSource("states") as GeoJSONSource).setData({ type: "FeatureCollection", features: layers.states ? states.filter((s) => s.coordinate).map((s) => ({ type: "Feature", properties: { truth: s.truth, safety: s.truth === "KNOWN" ? s.safety : "NONE", glyph: s.truth === "KNOWN" ? "✓" : s.truth === "UNKNOWN" ? "?" : "≠" }, geometry: { type: "Point", coordinates: s.coordinate! } })) : [] });
    (m.getSource("reports") as GeoJSONSource).setData({ type: "FeatureCollection", features: layers.reports ? reports.map((r) => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "Point", coordinates: r.approximateCoordinate } })) : [] });
  }, [places, states, reports, ready, layers]);

  const openPlace = useCallback(async (idOrSlug: string) => {
    try {
      const d = await call<PlaceDetail>(`/v1/places/${encodeURIComponent(idOrSlug)}`);
      setSelected(d);
      setCollapsed(false);
      const m = map.current;
      if (m) {
        m.easeTo({ center: d.place.coordinate, zoom: Math.max(m.getZoom(), 15.5), duration: prefersReducedMotion() ? 0 : 500 });
        places.forEach((p) => m.setFeatureState({ source: "places", id: p.id }, { selected: p.id === d.place.id }));
      }
      const url = new URL(window.location.href);
      url.searchParams.set("place", d.place.slug);
      window.history.replaceState(null, "", url);
    } catch (e) {
      setStatus({ kind: "error", message: messageFor(e instanceof ClientApiError ? e.code : undefined) });
    }
  }, [places]);

  useEffect(() => { if (props.initialPlace) void openPlace(props.initialPlace); /* once */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function locate() {
    setLocateMsg("Đang xác định vị trí…");
    try {
      const f = await locateOnce();
      setFix(f);
      setLocateMsg(f.accuracy > 200 ? `Vị trí có sai số khoảng ${Math.round(f.accuracy)} m.` : null);
      const m = map.current;
      if (m) {
        userMarker.current?.remove();
        const el = document.createElement("div");
        el.setAttribute("role", "img"); el.setAttribute("aria-label", "Vị trí của bạn");
        el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#2878A5;border:3px solid #fff;box-shadow:0 0 0 6px rgba(40,120,165,.25)";
        userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([f.lng, f.lat]).addTo(m);
        m.easeTo({ center: [f.lng, f.lat], zoom: Math.max(m.getZoom(), 15), duration: prefersReducedMotion() ? 0 : 600 });
      }
    } catch (e) {
      setLocateMsg(LOCATE_MESSAGES[(e as Error).message] ?? LOCATE_MESSAGES.UNAVAILABLE!);
    }
  }

  const visibleStates = useMemo(() => states.slice(0, 12), [states]);
  const center = (): { lat: number; lng: number } | null => { const c = map.current?.getCenter(); return c ? { lat: c.lat, lng: c.lng } : null; };

  return (
    <div className="map-shell">
      <aside ref={side} className="map-side" aria-label="Bảng thông tin bản đồ" data-collapsed={collapsed}>
        <button type="button" className="grabber" aria-label={collapsed ? "Mở rộng bảng thông tin" : "Thu gọn bảng thông tin"} onClick={() => setCollapsed((c) => !c)} style={{ border: 0, padding: 0, cursor: "pointer" }} />
        <div className="side-head">
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="map-q" className="visually-hidden">Tìm địa điểm</label>
            <input id="map-q" className="input" type="search" placeholder="Tìm địa điểm theo tên" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} />
          </form>
          <div className="chips" role="group" aria-label="Lọc theo loại địa điểm" style={{ maxHeight: 92, overflow: "auto" }}>
            <button type="button" className="chip-btn" aria-pressed={category === null} onClick={() => setCategory(null)}>Tất cả</button>
            {categories.filter((c) => c.placeCount > 0).map((c) => <button type="button" key={c.id} className="chip-btn" aria-pressed={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>{c.label}</button>)}
          </div>
        </div>
        <div className="side-body">
          {reporting ? (
            <ReportPanel signedIn={props.signedIn} fix={fix} mapCenter={center} placeId={selected?.place.id ?? null} placeName={selected?.place.name ?? null}
              onClose={() => setReporting(false)} onSubmitted={() => setBounds((b) => (b ? { ...b } : b))} />
          ) : selected ? (
            <PlaceInspector detail={selected} onClose={() => { setSelected(null); places.forEach((p) => map.current?.setFeatureState({ source: "places", id: p.id }, { selected: false })); }} onReport={() => setReporting(true)} />
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setReporting(true)}><IconPlus width={18} />Báo tình trạng tại đây</button>
              <section aria-labelledby="states-h" className="stack">
                <h2 id="states-h" style={{ fontSize: "var(--t-md)" }}>Tình trạng trong khung nhìn</h2>
                {zoom < 11 ? <p className="small muted">Phóng to bản đồ để xem tình trạng.</p>
                  : visibleStates.length === 0 ? <div className="empty"><h3>Không có tín hiệu nào ở đây</h3><p>Chưa có báo cáo hay dữ liệu hiện hành trong khung nhìn. Chưa có tín hiệu không có nghĩa là an toàn.</p></div>
                  : <ul className="list-plain stack">{visibleStates.map((s) => <li key={s.subjectKey}><StateCard state={s} /></li>)}</ul>}
              </section>
              <section aria-labelledby="places-h" className="stack">
                <h2 id="places-h" style={{ fontSize: "var(--t-md)" }}>Địa điểm {places.length ? <span className="muted small">({places.length})</span> : null}</h2>
                {places.length === 0 ? <p className="small muted">{query.length >= 2 ? "Không tìm thấy địa điểm phù hợp trong khung nhìn." : "Không có địa điểm nào được nạp ở khung nhìn này."}</p> : (
                  <ul className="list-plain">{places.slice(0, 40).map((p) => (
                    <li key={p.id}><button type="button" className="place-row" onClick={() => void openPlace(p.id)}>
                      <span><span className="n">{p.name}</span><br /><span className="c">{p.categoryLabel}{p.address ? ` · ${p.address}` : ""}</span></span>
                      {fix ? <span className="c">{distance(haversine(fix, p.coordinate))}</span> : null}
                    </button></li>))}</ul>
                )}
              </section>
              <details className="small"><summary>Lớp hiển thị và chú giải</summary>
                <div className="stack" style={{ marginTop: 10 }}>
                  {(["places", "states", "reports"] as const).map((k) => <label key={k} className="check"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{k === "places" ? "Địa điểm (OpenStreetMap)" : k === "states" ? "Tình trạng đã đánh giá" : "Ô báo cáo cộng đồng (vị trí gần đúng ~150 m)"}</label>)}
                  <div className="legend">
                    <span><span className="sw" style={{ background: COLORS.lake }} />Đã xác nhận, không nguy hiểm</span>
                    <span><span className="sw" style={{ background: COLORS.caution }} />Thận trọng</span>
                    <span><span className="sw" style={{ background: COLORS.avoid }} />Nên tránh</span>
                    <span><span className="sw" style={{ background: COLORS.blocked }} />Bị chặn</span>
                    <span><span className="sw" style={{ background: COLORS.conflict }} />Mâu thuẫn (≠)</span>
                    <span><span className="sw" style={{ background: COLORS.unknown }} />Chưa rõ (?)</span>
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </aside>
      <div className="map-canvas">
        <div ref={container} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Bản đồ. Danh sách địa điểm và tình trạng tương ứng có trong bảng thông tin." />
        <div className="map-toolbar">
          <button type="button" className="btn" onClick={() => void locate()} aria-label="Về vị trí của tôi"><IconLocate width={20} /></button>
        </div>
        {(status.kind !== "idle" || locateMsg || basemapIssue) ? (
          <div className="map-status" role="status" aria-live="polite">
            {status.kind === "loading" ? "Đang tải dữ liệu cho khung nhìn…" : status.kind !== "idle" ? <span className="row"><IconAlert width={16} />{status.message}</span> : null}
            {locateMsg ? <div>{locateMsg}</div> : null}
            {basemapIssue && status.kind !== "offline" ? <div>Bản đồ nền tạm thời không tải được. Địa điểm và tình trạng vẫn hiển thị.</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function haversine(a: { lat: number; lng: number }, c: [number, number]) {
  const R = 6371008.8, r = Math.PI / 180, dLat = (c[1] - a.lat) * r, dLng = (c[0] - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(c[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function PlaceInspector({ detail, onClose, onReport }: { detail: PlaceDetail; onClose: () => void; onReport: () => void }) {
  const p = detail.place;
  const informative = detail.states.filter((s) => s.truth !== "UNKNOWN" || s.signals.length);
  return (
    <section className="stack" aria-labelledby="insp-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>Quay lại danh sách</button>
      </div>
      <div>
        <p className="small muted">{p.categoryLabel}</p>
        <h2 id="insp-title">{p.name}</h2>
        {p.address ? <p className="small muted">{p.address}</p> : null}
      </div>
      <div className="stack">
        {informative.length ? informative.map((s) => <StateCard key={s.subjectKey} state={s} />) : (
          <div className="state-card" data-truth="UNKNOWN"><StateChip state={{ truth: "UNKNOWN", safety: "NONE", label: null, domain: "PLACE_OPEN", freshness: null }} /><p className="small muted">Chưa có tình trạng nào được xác nhận gần đây cho địa điểm này (mở cửa, mức đông, hàng chờ{p.category === "parking" ? ", chỗ trống" : ""}).</p></div>
        )}
        {p.openingHours ? <p className="xsmall muted">Giờ mở cửa công bố: {p.openingHours.raw}. {p.openingHours.note}</p> : null}
      </div>
      <div className="row">
        <Link className="btn btn-primary btn-sm" href={`/hanh-trinh?to=${p.slug}`}>Chỉ đường</Link>
        <Link className="btn btn-secondary btn-sm" href={`/dia-diem/${p.slug}`}>Xem chi tiết</Link>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onReport}>Báo thay đổi</button>
      </div>
      <p className="xsmall muted">Đánh giá {relativeTime(detail.evaluatedAt)} · Dữ liệu địa điểm: {p.source.attribution}</p>
      {detail.recentReports.length ? <div className="stack"><h3 style={{ fontSize: "var(--t-sm)" }}>Báo cáo gần đây</h3><ul className="list-plain small">{detail.recentReports.slice(0, 5).map((r) => <li key={r.id}>{domainLabel(r.domain)}: {r.value} · {r.status === "CORROBORATED" ? "đã đối chứng" : r.status === "VERIFIED" ? "đã xác minh" : r.status === "DISPUTED" ? "đang tranh cãi" : "chưa xác minh"} · {relativeTime(r.observedAt)}</li>)}</ul></div> : null}
    </section>
  );
}

export { IconInfo };
