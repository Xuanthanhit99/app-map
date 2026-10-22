import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../../infrastructure/api/client";
import { useLocationPreference } from "../../infrastructure/location/LocationPreferenceContext";
import { useForegroundLocationLifecycle } from "../../infrastructure/location/useForegroundLocationLifecycle";
import { Button, C, Card, Field, H, Notice, P, Screen, StateRow, type MobileState } from "../../ui/kit";

type Factor = { factor: string; effect: number; text: string; basis: string };
type Option = { rank: number; place: { id: string; slug: string; name: string; categoryLabel: string; distanceMeters?: number; coordinate: [number, number] }; factors: Factor[]; risks: string[]; unknowns: string[]; estimate: { travelMinutes: number; label: string } | null; states: MobileState[] };
type Result = { status: "needs_clarification"; suggestions: { id: string; label: string }[]; message: string } | { status: "ready" | "empty"; reason?: string; options: Option[]; excluded: { place: { name: string }; reason: string | null }[]; coverage: string[] };
const QUICK = ["Uống cà phê yên tĩnh", "Đi dạo ngoài trời", "Ăn tối", "Tránh mưa, ở trong nhà"];
const BASIS: Record<string, string> = { EVIDENCE: "bằng chứng", ASSUMPTION: "giả định", USER_INPUT: "theo yêu cầu", UNKNOWN: "chưa rõ" };

/** Flow 06 — Đi đâu bây giờ? Location is used for this request only, with the user's explicit choice. */
export function DecideScreen() {
  const router = useRouter();
  const { choice, setChoice } = useLocationPreference();
  const location = useForegroundLocationLifecycle(choice === "ENABLE");
  const [intent, setIntent] = useState("");
  const [useLoc, setUseLoc] = useState(true);
  const [minutes, setMinutes] = useState(60);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(categories?: string[]) {
    setBusy(true); setError(null);
    const origin = useLoc && location.status === "READY" ? { origin: { latitude: location.latitude, longitude: location.longitude }, useLocation: true } : { areaId: "ha-noi" };
    try { setResult(await api<Result>("/v1/decide", { method: "POST", body: { intent: intent.trim() || "đi chơi", availableMinutes: minutes, limit: 3, ...origin, ...(categories ? { categories } : {}) } })); }
    catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
    finally { setBusy(false); }
  }
  return (
    <Screen title="Đi đâu bây giờ?" eyebrow="FLOW 06 · DECIDE">
      <Field label="Bạn muốn làm gì?" value={intent} onChangeText={setIntent} maxLength={200} placeholder="Ví dụ: tìm chỗ đọc sách yên tĩnh" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{QUICK.map((q) => <Chip key={q} label={q} onPress={() => setIntent(q)} />)}</View>
      <Card>
        <P>{useLoc ? (location.status === "READY" ? "Dùng vị trí hiện tại cho lần gợi ý này (không lưu)." : choice === "ENABLE" ? "Đang xác định vị trí…" : "Định vị chưa bật.") : "Gợi ý trong khu vực Hà Nội, không tính khoảng cách."}</P>
        {choice !== "ENABLE" && useLoc ? <Button kind="secondary" label="Bật định vị" onPress={() => setChoice("ENABLE")} /> : null}
        <Button kind="quiet" label={useLoc ? "Không dùng vị trí" : "Dùng vị trí hiện tại"} onPress={() => setUseLoc(!useLoc)} />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{[30, 60, 120].map((m) => <Chip key={m} label={m < 60 ? `${m} phút` : `${m / 60} giờ`} active={minutes === m} onPress={() => setMinutes(m)} />)}</View>
      </Card>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Gợi ý cho tôi" busy={busy} onPress={() => void run()} />
      {result?.status === "needs_clarification" ? <Card><H>Bạn muốn đến loại nơi nào?</H><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{result.suggestions.map((s) => <Chip key={s.id} label={s.label} onPress={() => void run([s.id])} />)}</View></Card> : null}
      {result && result.status !== "needs_clarification" ? (
        <View style={{ gap: 12 }}>
          {result.status === "empty" ? <Notice>Chưa tìm được nơi phù hợp. Thử tăng thời gian hoặc mô tả khác.</Notice> : null}
          {result.options.map((o) => (
            <Card key={o.place.id}>
              <P muted small>Lựa chọn {o.rank} · {o.place.categoryLabel}</P>
              <H>{o.place.name}</H>
              {o.estimate ? <P muted small>Khoảng {o.estimate.travelMinutes} phút di chuyển ({o.estimate.label.toLowerCase()})</P> : null}
              {o.states.map((s) => <StateRow key={s.domain} state={s} />)}
              {o.factors.map((f, i) => <P key={i} small>{f.effect > 0 ? "+" : ""}{f.effect} · {f.text} ({BASIS[f.basis]})</P>)}
              {o.risks.length ? <Notice tone="warn">{o.risks.join(". ")}</Notice> : null}
              {o.unknowns.length ? <P muted small>Chưa rõ: {o.unknowns.join("; ")}</P> : null}
              <Button label="Chỉ đường" onPress={() => router.push({ pathname: "/(tabs)/journey", params: { to: o.place.slug } })} />
              <Button kind="secondary" label="Xem địa điểm" onPress={() => router.push({ pathname: "/place", params: { slug: o.place.slug } })} />
            </Card>
          ))}
          {result.excluded.length ? <P muted small>Đã loại: {result.excluded.map((x) => `${x.place.name} (${x.reason})`).join("; ")}</P> : null}
          <P muted small>{result.coverage.join(" ")}</P>
        </View>
      ) : null}
    </Screen>
  );
}
function Chip({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: active ? C.accent : C.line, backgroundColor: active ? C.accent : C.raised }}><Text style={{ color: active ? C.onAccent : C.ink, fontWeight: "700" }}>{label}</Text></Pressable>;
}
