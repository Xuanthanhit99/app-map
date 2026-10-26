import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../../src/infrastructure/api/client";
import { useAuth } from "../../src/infrastructure/auth/AuthContext";
import { useLocationPreference } from "../../src/infrastructure/location/LocationPreferenceContext";
import { useForegroundLocationLifecycle } from "../../src/infrastructure/location/useForegroundLocationLifecycle";
import { AuthPanel } from "../../src/features/account/AuthPanel";
import { Button, Card, H, Notice, P, Screen } from "../../src/ui/kit";

type Note = { id: string; kind: string; severity: string; title: string; body: string; readAt: string | null; createdAt: string };
type Watch = { id: string; label: string; kind: string; radiusMeters: number; domains: string[]; minSeverity: string; active: boolean };
const SEV: Record<string, string> = { SAFETY_CRITICAL: "Nguy hiểm", SIGNIFICANT: "Đáng kể", MINOR: "Bất tiện nhỏ", INFO: "Thông tin" };

export default function WatchTab() {
  const { user } = useAuth();
  const { choice } = useLocationPreference();
  const location = useForegroundLocationLifecycle(Boolean(user) && choice === "ENABLE");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [n, w] = await Promise.all([api<{ items: Note[] }>("/v1/me/notifications?limit=50"), api<{ items: Watch[] }>("/v1/me/watch-areas")]);
      setNotes(n.items); setWatches(w.items); setError(null);
    } catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
    finally { setLoading(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);
  async function watchHere() {
    if (location.status !== "READY") { setError("Cần vị trí hiện tại (bật định vị trong mục Tôi)."); return; }
    try {
      await api("/v1/me/watch-areas", { method: "POST", body: { kind: "CIRCLE", label: "Quanh vị trí này", latitude: location.latitude, longitude: location.longitude, radiusMeters: 800, domains: ["ROAD", "WEATHER"], minSeverity: "SIGNIFICANT" } });
      await load();
    } catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }
  if (!user) return <Screen title="Theo dõi" eyebrow="WATCH"><P muted>Đăng nhập để theo dõi khu vực và nhận thông báo khi tình trạng thay đổi đáng kể.</P><AuthPanel /></Screen>;
  return (
    <Screen title="Theo dõi" eyebrow="WATCH">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card>
        <H>Khu vực theo dõi</H>
        {watches.length === 0 ? <P muted small>Chưa có khu vực nào. Bạn chỉ nhận thông báo khi có thay đổi từ mức “đáng kể” trở lên, mỗi khu vực tối đa một lần mỗi 30 phút.</P>
          : watches.map((w) => <View key={w.id} style={{ gap: 4, paddingVertical: 6 }}><P>{w.label}{w.active ? "" : " (tạm dừng)"}</P><P muted small>{w.kind === "CIRCLE" ? `Bán kính ${w.radiusMeters} m` : w.kind === "PLACE" ? "Địa điểm" : "Tuyến đường"} · từ mức {SEV[w.minSeverity]?.toLowerCase()}</P>
            <Button kind="quiet" label="Xóa" onPress={() => void api(`/v1/me/watch-areas/${w.id}`, { method: "DELETE" }).then(load)} /></View>)}
        <Button kind="secondary" label="Theo dõi quanh vị trí hiện tại (800 m)" onPress={() => void watchHere()} disabled={location.status !== "READY"} />
      </Card>
      <Card>
        <H>Thông báo</H>
        {loading && !notes ? <P muted>Đang tải…</P> : !notes?.length ? <P muted small>Chưa có thông báo nào.</P> : notes.map((n) => (
          <View key={n.id} accessible accessibilityLabel={`${SEV[n.severity]}. ${n.title}. ${n.body}`} style={{ gap: 2, paddingVertical: 8, opacity: n.readAt ? 0.7 : 1 }}>
            <P small muted>{SEV[n.severity]} · {n.kind === "JOURNEY_IMPACT" ? "Hành trình" : "Khu vực theo dõi"}</P><P>{n.title}</P><P muted small>{n.body}</P>
          </View>))}
        <Button kind="quiet" label={loading ? "Đang tải…" : "Tải lại"} onPress={() => void load()} />
        {notes?.some((n) => !n.readAt) ? <Button kind="quiet" label="Đánh dấu đã đọc tất cả" onPress={() => void api("/v1/me/notifications/read", { method: "POST", body: { all: true } }).then(load)} /> : null}
      </Card>
    </Screen>
  );
}
