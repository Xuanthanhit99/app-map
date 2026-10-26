import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { messageFor } from "@core/i18n/error-messages";
import { activeJourneyLocationNotice } from "@core/location/active-journey-location";
import { formatDistanceVi, nextInstruction } from "@core/routing/guidance";
import type { RouteInstruction } from "@core/routing/routing-contract";
import { api, ApiError } from "../../src/infrastructure/api/client";
import { RealityMap } from "../../src/infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../src/infrastructure/location/useForegroundLocationLifecycle";
import { Button, Card, H, Notice, P, Screen } from "../../src/ui/kit";

type Journey = { id: string; status: string; destinationLabel: string | null; origin: [number, number]; destination: [number, number]; canStart: boolean; routeStatus: string;
  guidance: { provider: string | null; revision: number; instructions: RouteInstruction[] } | null;
  route: { provider: string | null; distanceMeters: number | null; durationSeconds: number | null; durationLabel: string; coordinates: [number, number][] } | null };
type Impact = { status: "UNAVAILABLE" } | { status: "EVALUATED"; recommendation: string; note: string; items: { severity: string; label: string; truth: string; distanceFromRouteMeters?: number }[] };
const STATUS: Record<string, string> = { PLANNED: "Đã lên kế hoạch", ACTIVE: "Đang đi", PAUSED: "Tạm dừng", ARRIVED: "Đã đến nơi", CANCELLED: "Đã hủy", STOPPED: "Đã dừng" };
const REC: Record<string, string> = { REROUTE_OR_POSTPONE: "Nên đổi tuyến hoặc hoãn.", CONSIDER_REROUTE: "Cân nhắc đổi tuyến.", PROCEED_WITH_CAUTION: "Có thể đi, hãy chú ý.", NO_VERIFIED_IMPACT: "Chưa có tác động nào được xác minh dọc tuyến." };
const SEV: Record<string, string> = { SAFETY_CRITICAL: "Nguy hiểm", SIGNIFICANT: "Đáng kể", MINOR: "Bất tiện nhỏ", INFO: "Thông tin" };

/** Active journey on real APIs. Navigation continues on reality errors; positions are sent transiently and never stored. */
export default function JourneyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [j, setJ] = useState<Journey | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  // Impact freshness is shown, and a failed refresh is never hidden behind the last good answer.
  const [impactAt, setImpactAt] = useState<number | null>(null);
  const [impactStale, setImpactStale] = useState(false);
  const [checks, setChecks] = useState<{ arrivalDetected?: boolean; offRoute?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const live = j?.status === "ACTIVE" || j?.status === "PAUSED";
  const location = useForegroundLocationLifecycle(Boolean(live));
  const lastSent = useRef(0);
  const load = useCallback(async () => {
    try { const r = await api<{ journey: Journey; impact: Impact }>(`/v1/journeys/${id}`); setJ(r.journey); setImpact(r.impact); setImpactAt(Date.now()); setImpactStale(false); setError(null); }
    catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }, [id]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void api<Impact>(`/v1/journeys/${id}/impact`)
      .then((i) => { setImpact(i); setImpactAt(Date.now()); setImpactStale(false); })
      .catch(() => setImpactStale(true)), 60_000);
    return () => clearInterval(t);
  }, [id, load]);
  useEffect(() => {
    if (j?.status !== "ACTIVE" || location.status !== "READY" || Date.now() - lastSent.current < 10_000) return;
    lastSent.current = Date.now();
    void api<{ checks: typeof checks }>(`/v1/journeys/${id}/events`, { method: "POST", body: { type: "POSITION", position: {
      latitude: location.latitude, longitude: location.longitude, accuracyMeters: Math.round(location.accuracyMeters ?? 9999), observedAt: new Date(Math.min(location.observedAt, Date.now())).toISOString() } } })
      .then((r) => setChecks(r.checks)).catch(() => undefined);
  }, [location, j?.status, id]);
  async function event(type: string) {
    try { const r = await api<{ journey: Journey }>(`/v1/journeys/${id}/events`, { method: "POST", body: { type } }); setJ(r.journey); }
    catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }
  async function reroute() {
    if (location.status !== "READY") return;
    try { const r = await api<{ journey: Journey }>(`/v1/journeys/${id}/reroute`, { method: "POST", body: { origin: { latitude: location.latitude, longitude: location.longitude } } }); setJ(r.journey); setChecks({}); }
    catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }
  if (!j) return <Screen title="Hành trình">{error ? <Notice tone="error">{error}</Notice> : <P muted>Đang tải…</P>}</Screen>;
  const notice = live ? activeJourneyLocationNotice(location) : undefined;
  const next = j.status === "ACTIVE" && j.route && location.status === "READY" ? nextInstruction(j.route.coordinates, j.guidance?.instructions, [location.longitude, location.latitude]) : null;
  return (
    <Screen title={`Đến ${j.destinationLabel ?? "điểm đến"}`} eyebrow={STATUS[j.status]?.toUpperCase()}>
      <View style={{ height: 240, borderRadius: 16, overflow: "hidden" }}>
        <RealityMap location={location} camera={{ mode: "FOLLOW_ROUTE", padding: 32 }} followCamera={false}
          {...(j.route ? { route: { id: j.id, source: "ROUTING_ENGINE" as const, generatedAt: Date.now(), coordinates: j.route.coordinates } } : {})}
          markers={[{ id: "origin", coordinate: j.origin }, { id: "destination", coordinate: j.destination }]} accessibilityLabel="Bản đồ tuyến đường" />
      </View>
      {j.route ? <P>{((j.route.distanceMeters ?? 0) / 1000).toFixed(1).replace(".", ",")} km · khoảng {Math.round((j.route.durationSeconds ?? 0) / 60)} phút ({j.route.durationLabel.toLowerCase()})</P>
        : <Notice tone="warn">Chưa có tuyến hợp lệ từ nhà cung cấp định tuyến nên chưa thể bắt đầu.</Notice>}
      {next?.status === "NEXT" ? (
        <Card><P muted small>{formatDistanceVi(next.inMeters).toUpperCase()}</P><H>{next.instruction.text}</H>{next.instruction.street ? <P small>{next.instruction.street}</P> : null}<P muted small>Chỉ dẫn từ {j.guidance?.provider ?? "nhà cung cấp định tuyến"}</P></Card>
      ) : next?.status === "OFF_ROUTE" ? <Notice tone="warn">Bạn đang cách tuyến khoảng {next.offRouteMeters} m nên chỉ dẫn tạm dừng. Hãy quay lại tuyến hoặc tính lại tuyến.</Notice> : null}
      {notice ? <Notice tone="warn">{notice}</Notice> : null}
      {checks.offRoute ? <Notice tone="warn">Có vẻ bạn đã đi lệch tuyến.</Notice> : null}
      {checks.arrivalDetected && j.status === "ACTIVE" ? <Notice tone="ok">Có vẻ bạn đã tới nơi.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {j.status === "PLANNED" ? <><Button label="Bắt đầu" disabled={!j.canStart} onPress={() => void event("START")} /><Button kind="quiet" label="Hủy" onPress={() => void event("CANCEL")} /></> : null}
      {j.status === "ACTIVE" ? <><Button label="Đã đến nơi" onPress={() => void event("ARRIVE")} /><Button kind="secondary" label="Tạm dừng" onPress={() => void event("PAUSE")} />{checks.offRoute || next?.status === "OFF_ROUTE" ? <Button kind="secondary" label="Tính lại tuyến" onPress={() => void reroute()} /> : null}<Button kind="quiet" label="Kết thúc" onPress={() => void event("STOP")} /></> : null}
      {j.status === "PAUSED" ? <><Button label="Tiếp tục" onPress={() => void event("RESUME")} /><Button kind="quiet" label="Kết thúc" onPress={() => void event("STOP")} /></> : null}
      <Card>
        <H>Dọc tuyến đường</H>
        {impact?.status === "EVALUATED" ? (
          <>
            <P>{REC[impact.recommendation]}</P>
            {impact.items.map((i, k) => <P key={k} small>{SEV[i.severity]} · {i.label}{i.truth !== "KNOWN" ? " (chưa xác minh)" : ""}{i.distanceFromRouteMeters != null ? ` · cách tuyến ${i.distanceFromRouteMeters} m` : ""}</P>)}
            <P muted small>{impact.note}</P>
            {impactAt ? <P muted small>Kiểm tra lúc {new Date(impactAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</P> : null}
            {impactStale ? <Notice tone="warn">Không cập nhật được tác động dọc tuyến (mất kết nối?). Thông tin trên có thể đã cũ.</Notice> : null}
          </>
        ) : <P muted small>Chưa có tuyến nên chưa kiểm tra được tác động.</P>}
      </Card>
      {!j.guidance ? <P muted small>Nhà cung cấp định tuyến không trả về chỉ dẫn từng ngã rẽ cho tuyến này, nên ứng dụng chỉ hiển thị tuyến và tác động.</P> : null}
    </Screen>
  );
}
