import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { messageFor } from "@core/i18n/error-messages";
import { selectFloodSeverity, selectMovingReportType, startMovingContribution, type FloodSeverity, type MovingContributionStep, type MovingReportType } from "@core/features/contribution/moving-safe";
import { api, ApiError } from "../../infrastructure/api/client";
import { useAuth } from "../../infrastructure/auth/AuthContext";
import { useLocationPreference } from "../../infrastructure/location/LocationPreferenceContext";
import { useForegroundLocationLifecycle } from "../../infrastructure/location/useForegroundLocationLifecycle";
import { AuthPanel } from "../account/AuthPanel";
import { Button, C, Notice, P, Screen } from "../../ui/kit";

const LABEL: Record<string, string> = { FLOOD: "Ngập", ACCIDENT: "Tai nạn", ROAD_BLOCKED: "Đường chặn", LIGHT: "Nhẹ", MODERATE: "Vừa", DEEP: "Sâu" };
const FLOOD_VALUE: Record<FloodSeverity, string> = { LIGHT: "FLOODED_LIGHT", MODERATE: "FLOODED_MODERATE", DEEP: "FLOODED_DEEP" };
const ROAD_VALUE: Record<Exclude<MovingReportType, "FLOOD">, string> = { ACCIDENT: "ACCIDENT", ROAD_BLOCKED: "BLOCKED" };
const PLACE_OPTIONS = [["PLACE_OPEN", "OPEN", "Đang mở cửa"], ["PLACE_OPEN", "CLOSED", "Đang đóng cửa"], ["CROWD", "QUIET", "Vắng"], ["CROWD", "VERY_BUSY", "Rất đông"], ["QUEUE", "LONG", "Chờ lâu"], ["PARKING", "FULL", "Bãi xe đầy"], ["PARKING", "AVAILABLE", "Bãi xe còn chỗ"]] as const;

/**
 * Moving-safe one-tap contribution (no typing): type → (flood) severity → submitted.
 * Uses the live foreground fix only (READY, approved display policy); never a cached or mocked position.
 */
export function MovingContributionScreen() {
  const { placeId, placeName } = useLocalSearchParams<{ placeId?: string; placeName?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { choice, setChoice } = useLocationPreference();
  const location = useForegroundLocationLifecycle(choice === "ENABLE");
  const [step, setStep] = useState<MovingContributionStep>(startMovingContribution());
  const [result, setResult] = useState<{ kind: "ok" | "error" | "consent"; text: string; pending?: { domain: string; value: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(domain: string, value: string, moving: boolean) {
    if (location.status !== "READY") { setResult({ kind: "error", text: "Chưa có vị trí hiện tại đủ tin cậy. Báo cáo cần vị trí thật của bạn." }); return; }
    setBusy(true);
    try {
      const r = await api<{ report: { status: string } }>("/v1/reports", { method: "POST", body: {
        domain, value, latitude: location.latitude, longitude: location.longitude, moving,
        ...(location.accuracyMeters !== undefined ? { accuracyMeters: Math.round(location.accuracyMeters) } : {}),
        observedAt: new Date(Math.min(location.observedAt, Date.now())).toISOString(),
        ...(placeId ? { placeId } : {}),
      } });
      setResult({ kind: "ok", text: r.report.status === "CORROBORATED" ? "Đã có người khác cùng báo — tình trạng giờ được xác nhận." : "Đã ghi nhận. Báo cáo là tín hiệu chưa xác minh cho tới khi có thêm một người khác cùng báo." });
      setStep({ step: "SUBMITTED", deferDetailsUntilStationary: true });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setResult(code === "CONTRIBUTION_CONSENT_REQUIRED" ? { kind: "consent", text: messageFor(code), pending: { domain, value } } : { kind: "error", text: messageFor(code) });
    } finally { setBusy(false); }
  }

  if (!user) return <Screen title="Báo tình trạng"><P muted>Đăng nhập để gửi báo cáo.</P><AuthPanel /></Screen>;
  if (choice !== "ENABLE") return <Screen title="Báo tình trạng"><Notice>Báo cáo cần vị trí hiện tại của bạn. Vị trí chính xác chỉ dùng để kiểm tra; người khác chỉ thấy ô gần đúng ~150 m.</Notice><Button label="Bật định vị" onPress={() => setChoice("ENABLE")} /></Screen>;

  const gps = location.status === "READY" ? `Vị trí hiện tại${location.accuracyMeters !== undefined ? ` (sai số ~${Math.round(location.accuracyMeters)} m)` : ""}` : location.status === "DENIED" ? "Chưa có quyền vị trí" : "Đang xác định vị trí…";
  return (
    <Screen title={placeId ? `Tại ${placeName ?? "địa điểm"}` : step.step === "FLOOD_SEVERITY" ? "Mức ngập?" : "Bạn vừa thấy gì?"} eyebrow="ĐÓNG GÓP · MỘT CHẠM">
      <P muted small>{gps}. Chọn nhanh, không cần nhập chữ khi đang di chuyển.</P>
      {result ? <Notice tone={result.kind === "ok" ? "ok" : result.kind === "consent" ? "warn" : "error"}>{result.text}</Notice> : null}
      {result?.kind === "consent" && result.pending ? <Button label="Bật “Đóng góp công khai” và gửi" onPress={() => void api("/v1/me/consents", { method: "POST", body: { purpose: "contribution_public", granted: true } }).then(() => submit(result.pending!.domain, result.pending!.value, !placeId))} /> : null}
      {step.step === "SUBMITTED" ? (
        <View style={{ gap: 10 }}><P muted small>Chi tiết, ảnh và ghi chú có thể thêm sau khi bạn dừng lại.</P><Button label="Xong" onPress={() => router.back()} /><Button kind="secondary" label="Báo thêm" onPress={() => { setStep(startMovingContribution()); setResult(null); }} /></View>
      ) : placeId ? (
        <View style={st.options}>{PLACE_OPTIONS.map(([d, v, l]) => <Big key={d + v} label={l} disabled={busy} onPress={() => void submit(d, v, false)} />)}</View>
      ) : step.step === "TYPE" ? (
        <View style={st.options}>{step.options.map((o) => <Big key={o} label={LABEL[o]!} disabled={busy} onPress={() => { const next = selectMovingReportType(o); if (next.step === "SUBMITTED") void submit("ROAD", ROAD_VALUE[o as Exclude<MovingReportType, "FLOOD">], true); else setStep(next); }} />)}</View>
      ) : step.step === "FLOOD_SEVERITY" ? (
        <View style={st.options}>{step.options.map((o) => <Big key={o} label={`Ngập ${LABEL[o]!.toLowerCase()}`} disabled={busy} onPress={() => { selectFloodSeverity(o); void submit("ROAD", FLOOD_VALUE[o], true); }} />)}</View>
      ) : null}
    </Screen>
  );
}

function Big({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [st.big, pressed && { opacity: 0.8 }, disabled && { opacity: 0.5 }]}><Text style={st.bigText}>{label}</Text></Pressable>;
}
const st = StyleSheet.create({
  options: { gap: 12 },
  big: { minHeight: 64, justifyContent: "center", paddingHorizontal: 20, borderRadius: 16, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  bigText: { fontSize: 20, fontWeight: "800", color: C.ink },
});
