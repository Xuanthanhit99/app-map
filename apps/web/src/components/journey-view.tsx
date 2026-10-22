"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { distance, duration, relativeTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import type { Coordinate, Impact, Journey } from "@/lib/types";
import { LazyJourneyMap } from "./map/lazy";
import { LOCATE_MESSAGES } from "./map/map-core";
import { formatDistanceVi, nextInstruction } from "@core/routing/guidance";

const STATUS: Record<Journey["status"], string> = { PLANNED: "Đã lên kế hoạch", ACTIVE: "Đang đi", PAUSED: "Tạm dừng", ARRIVED: "Đã đến nơi", CANCELLED: "Đã hủy", STOPPED: "Đã dừng" };
const SEV: Record<string, string> = { SAFETY_CRITICAL: "Nguy hiểm đã xác nhận", SIGNIFICANT: "Ảnh hưởng đáng kể", MINOR: "Bất tiện nhỏ", INFO: "Thông tin" };
const REC: Record<string, string> = { REROUTE_OR_POSTPONE: "Nên đổi tuyến hoặc hoãn chuyến đi.", CONSIDER_REROUTE: "Cân nhắc đổi tuyến.", PROCEED_WITH_CAUTION: "Có thể đi tiếp, hãy chú ý.", NO_VERIFIED_IMPACT: "Chưa có tác động nào được xác minh dọc tuyến." };

export function JourneyView({ initial, initialImpact }: { initial: Journey; initialImpact: Impact }) {
  const [j, setJ] = useState(initial);
  const [impact, setImpact] = useState(initialImpact);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<{ arrivalDetected?: boolean; offRoute?: boolean; distanceToDestinationM?: number; position?: string }>({});
  const [pos, setPos] = useState<Coordinate | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [share, setShare] = useState<{ url: string; expiresAt: string; shareId: string } | null>(null);
  const lastSent = useRef(0);
  const lastFix = useRef<GeolocationPosition | null>(null);

  const [impactAt, setImpactAt] = useState<number>(() => Date.now());
  const [impactStale, setImpactStale] = useState(false);
  const refreshImpact = useCallback(async () => {
    // A failed refresh keeps the last answer but says so: stale safety information is never presented as current.
    try { setImpact(await call<Impact>(`/v1/journeys/${j.id}/impact`)); setImpactAt(Date.now()); setImpactStale(false); } catch { setImpactStale(true); }
  }, [j.id]);
  useEffect(() => { const t = setInterval(() => void refreshImpact(), 60_000); return () => clearInterval(t); }, [refreshImpact]);

  // Foreground-only GPS while the journey is ACTIVE; positions are sent transiently for arrival/deviation checks.
  useEffect(() => {
    if (j.status !== "ACTIVE" || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(async (p) => {
      const age = Date.now() - p.timestamp;
      if (age > 30_000 || age < -2_000) { setGpsMsg(LOCATE_MESSAGES.STALE_FIX!); return; }
      lastFix.current = p;
      setPos([p.coords.longitude, p.coords.latitude]);
      setGpsMsg(p.coords.accuracy > 100 ? `Vị trí kém chính xác (~${Math.round(p.coords.accuracy)} m): chưa dùng để kiểm tra lệch tuyến.` : null);
      if (Date.now() - lastSent.current < 10_000) return;
      lastSent.current = Date.now();
      try {
        const r = await call<{ journey: Journey; checks: typeof checks }>(`/v1/journeys/${j.id}/events`, { method: "POST", body: { type: "POSITION",
          position: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyMeters: Math.round(p.coords.accuracy), observedAt: new Date(Math.min(p.timestamp, Date.now())).toISOString() } } });
        setChecks(r.checks);
      } catch { /* navigation continues on network failure */ }
    }, (e) => setGpsMsg(LOCATE_MESSAGES[e.code === 1 ? "PERMISSION_DENIED" : e.code === 3 ? "TIMEOUT" : "UNAVAILABLE"] ?? null), { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [j.status, j.id]);

  async function event(type: "START" | "PAUSE" | "RESUME" | "ARRIVE" | "CANCEL" | "STOP") {
    setError(null);
    try { const r = await call<{ journey: Journey }>(`/v1/journeys/${j.id}/events`, { method: "POST", body: { type } }); setJ(r.journey); }
    catch (e) { setError(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  async function reroute() {
    const p = lastFix.current;
    const origin = p ? { latitude: p.coords.latitude, longitude: p.coords.longitude } : { latitude: j.origin[1], longitude: j.origin[0] };
    setError(null);
    try { const r = await call<{ journey: Journey }>(`/v1/journeys/${j.id}/reroute`, { method: "POST", body: { origin } }); setJ(r.journey); setChecks({}); void refreshImpact(); }
    catch (e) { setError(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  async function createShare() {
    try { setShare(await call(`/v1/journeys/${j.id}/shares`, { method: "POST", body: { ttlMinutes: 60 } })); }
    catch (e) { setError(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  async function revokeShare() {
    if (!share) return;
    await call(`/v1/journeys/${j.id}/shares/${share.shareId}`, { method: "DELETE" }).catch(() => undefined);
    setShare(null);
  }

  const items = impact.status === "EVALUATED" ? impact.items : [];
  const live = j.status === "ACTIVE" || j.status === "PAUSED";
  return (
    <div className="journey-layout">
      <div className="map-canvas"><LazyJourneyMap route={j.route?.coordinates ?? null} origin={j.origin} destination={j.destination} impacts={items} position={pos} /></div>
      <aside className="journey-panel" aria-label="Thông tin hành trình">
        <div className="stack" style={{ gap: 6 }}>
          <span className="badge" aria-live="polite">{STATUS[j.status]}</span>
          <h1 className="maneuver">Đến {j.destinationLabel ?? "điểm đến"}</h1>
          {j.route ? <p className="muted">{distance(j.route.distanceMeters)} · khoảng {duration(j.route.durationSeconds)} <span className="xsmall">({j.route.durationLabel.toLowerCase()})</span></p>
            : <div className="notice notice-warn">Chưa có tuyến đường hợp lệ từ nhà cung cấp định tuyến, nên chưa thể bắt đầu dẫn đường. Bạn vẫn có thể xem điểm đến trên bản đồ.</div>}
        </div>

        {checks.arrivalDetected && j.status === "ACTIVE" ? <div className="notice notice-ok" role="status"><span>Có vẻ bạn đã tới nơi. <button type="button" className="btn btn-primary btn-sm" onClick={() => void event("ARRIVE")}>Xác nhận đã đến</button></span></div> : null}
        {checks.offRoute && j.status === "ACTIVE" ? <div className="notice notice-warn" role="alert"><span>Bạn có vẻ đã đi lệch tuyến. <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reroute()}>Tính lại tuyến</button></span></div> : null}
        {(() => {
          if (j.status !== "ACTIVE" || !j.route || !pos) return null;
          const n = nextInstruction(j.route.coordinates, j.guidance?.instructions, pos);
          if (n.status === "NEXT") return <div className="panel" role="status" aria-live="polite"><p className="xsmall muted">{formatDistanceVi(n.inMeters)}</p><p style={{ fontSize: "var(--t-lg)", fontWeight: 700 }}>{n.instruction.text}</p><p className="xsmall muted">Chỉ dẫn từ {j.guidance?.provider ?? "nhà cung cấp định tuyến"}</p></div>;
          if (n.status === "OFF_ROUTE") return <div className="notice notice-warn" role="alert"><span>Bạn đang cách tuyến khoảng {n.offRouteMeters} m nên chỉ dẫn tạm dừng. <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reroute()}>Tính lại tuyến</button></span></div>;
          return null;
        })()}
        {gpsMsg && live ? <p className="small muted" role="status">{gpsMsg}</p> : null}
        {impactStale ? <div className="notice notice-warn" role="alert"><span>Không cập nhật được tác động dọc tuyến từ lúc {new Date(impactAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}. Thông tin bên dưới có thể đã cũ.</span></div> : null}
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}

        <div className="row">
          {j.status === "PLANNED" ? <>
            <button type="button" className="btn btn-primary btn-lg" disabled={!j.canStart} onClick={() => void event("START")}>Bắt đầu</button>
            {!j.canStart && j.route ? <button type="button" className="btn btn-secondary" onClick={() => void reroute()}>Tính lại tuyến</button> : null}
            <button type="button" className="btn btn-quiet" onClick={() => void event("CANCEL")}>Hủy</button>
          </> : null}
          {j.status === "ACTIVE" ? <><button type="button" className="btn btn-secondary" onClick={() => void event("PAUSE")}>Tạm dừng</button><button type="button" className="btn btn-primary" onClick={() => void event("ARRIVE")}>Đã đến nơi</button><button type="button" className="btn btn-quiet" onClick={() => void event("STOP")}>Kết thúc</button></> : null}
          {j.status === "PAUSED" ? <><button type="button" className="btn btn-primary" onClick={() => void event("RESUME")}>Tiếp tục</button><button type="button" className="btn btn-quiet" onClick={() => void event("STOP")}>Kết thúc</button></> : null}
          {j.status === "ARRIVED" ? <Link className="btn btn-primary" href={j.destinationPlaceId ? `/ban-do?place=${j.destinationPlaceId}&report=1` : "/ban-do?report=1"}>Báo tình trạng tại nơi đến</Link> : null}
        </div>
        {live ? <p className="xsmall muted">Bản web hiển thị tuyến và các tác động; chỉ dẫn từng ngã rẽ có trên ứng dụng di động. Vị trí chỉ được gửi để kiểm tra đã tới nơi hay lệch tuyến và không được lưu.</p> : null}

        <section aria-labelledby="impact-h" className="stack">
          <h2 id="impact-h" style={{ fontSize: "var(--t-lg)" }}>Dọc tuyến đường</h2>
          {impact.status === "UNAVAILABLE" ? <p className="small muted">Chưa có tuyến nên chưa thể kiểm tra tác động.</p> : (
            <>
              <p className="small"><strong>{REC[impact.recommendation] ?? ""}</strong></p>
              {items.length ? <ul className="list-plain stack">{items.map((i, k) => (
                <li key={k} className="impact-item" data-sev={i.severity}>
                  <strong>{i.label}</strong>
                  <span className="xsmall">{SEV[i.severity]}{i.truth !== "KNOWN" ? " · chưa xác minh" : ""}{i.distanceFromRouteMeters != null ? ` · cách tuyến ${distance(i.distanceFromRouteMeters)}` : ""}{i.sources?.length ? ` · ${i.sources.map((s) => s.name).join(", ")}` : ""}</span>
                </li>))}</ul> : null}
              <p className="xsmall muted">{impact.note} Cập nhật {relativeTime(impact.evaluatedAt)}.</p>
            </>
          )}
        </section>

        {live || j.status === "PLANNED" ? (
          <section aria-labelledby="share-h" className="stack">
            <h2 id="share-h" style={{ fontSize: "var(--t-md)" }}>Chia sẻ giờ đến dự kiến</h2>
            {share ? <div className="stack"><p className="small">Liên kết có hiệu lực tới {new Date(share.expiresAt).toLocaleTimeString("vi-VN")}. Người nhận chỉ thấy trạng thái và giờ đến dự kiến, không thấy vị trí của bạn.</p><input className="input" readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} aria-label="Liên kết chia sẻ" /><button type="button" className="btn btn-danger btn-sm" onClick={() => void revokeShare()}>Thu hồi liên kết</button></div>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => void createShare()}>Tạo liên kết 60 phút</button>}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
