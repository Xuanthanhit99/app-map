import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getRealityDecisionCollection, type ApiCollection } from "../../src/infrastructure/api/realityDecisionClient";
import { theme } from "../../src/ui/theme";
import { checkPlanRoute, type RouteCheck } from "../../src/infrastructure/api/routeVerificationClient";

type PlanItem = { id: string; title?: string; stops?: { placeId: string }[]; evidence?: { truth?: string; source?: string; observedAt?: string; provenanceId?: string } };
type ScreenState = ApiCollection<PlanItem> | { status: "loading"; items: [] };

function isVerified(plan: PlanItem): boolean {
  const e = plan.evidence;
  const observed = typeof e?.observedAt === "string" ? Date.parse(e.observedAt) : NaN;
  return typeof plan.title === "string" && plan.title.trim().length > 0 &&
    Array.isArray(plan.stops) && plan.stops.length > 0 &&
    plan.stops.every(stop => typeof stop?.placeId === "string" && stop.placeId.length > 0) &&
    e?.truth === "KNOWN" && Boolean(e.source?.trim()) && Boolean(e.provenanceId?.trim()) &&
    Number.isFinite(observed) && observed <= Date.now() && Date.now() - observed <= 300000;
}

export default function JourneyTab() {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ status: "loading", items: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [routeCheck, setRouteCheck] = useState<RouteCheck | { status: "loading" } | null>(null);
  useEffect(() => {
    let mounted = true;
    getRealityDecisionCollection(process.env.EXPO_PUBLIC_API_BASE_URL, "decision").then(result => {
      if (mounted) setState(result);
    });
    return () => { mounted = false; };
  }, []);
  const plans = state.status === "ready" ? state.items.filter(isVerified) : [];
  const active = plans.find(plan => plan.id === selected);
  useEffect(() => {
    if (!active) {
      setRouteCheck(null);
      return;
    }
    const controller = new AbortController();
    setRouteCheck({ status: "loading" });
    // Coordinates require a future explicit user selection; never infer from plan ID.
    void checkPlanRoute({
      baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      planId: active.id,
      origin: null,
      destination: null,
      signal: controller.signal,
    }).then(result => {
      if (!controller.signal.aborted) setRouteCheck(result);
    });
    return () => controller.abort();
  }, [active?.id]);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Quyết định & hành trình</Text>
      <Text style={styles.body}>Chỉ hiển thị phương án có nguồn, thời gian quan sát và bằng chứng hợp lệ.</Text>
      {state.status === "loading" ? <ActivityIndicator accessibilityLabel="Đang tải phương án" /> : null}
      {state.status === "error" ? <Text accessibilityRole="alert" style={styles.body}>Không tải được phương án. Kiểm tra kết nối và thử lại.</Text> : null}
      {state.status === "empty" || (state.status === "ready" && plans.length === 0) ?
        <View style={styles.card}><Text style={styles.heading}>Chưa có phương án được xác minh</Text><Text style={styles.body}>Không tự tạo ba kế hoạch khi thiếu dữ liệu hoặc ngữ cảnh.</Text></View> : null}
      {plans.map(plan => <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={`Xem phương án ${plan.title}`} onPress={() => setSelected(plan.id)} style={styles.card}>
        <Text style={styles.heading}>{plan.title}</Text>
        <Text style={styles.body}>KNOWN · FRESH · {plan.stops?.length ?? 0} điểm dừng</Text>
      </Pressable>)}
      <View style={styles.card}>
        <Text style={styles.heading}>Chi tiết kế hoạch</Text>
        <Text style={styles.body}>{active ? active.title : "Chọn phương án đã xác minh để xem chi tiết."}</Text>
        <Text style={styles.body}>{routeCheck?.status === "loading" ? "Đang kiểm tra điều kiện tuyến đường…" :
          routeCheck?.status === "timeout" ? "Hết thời gian kiểm tra tuyến đường." :
          routeCheck?.status === "error" ? "Không thể xác minh tuyến đường. Vui lòng thử lại." :
          routeCheck?.status === "unavailable" && routeCheck.reason === "ORIGIN_REQUIRED" ? "Cần chọn điểm xuất phát trước khi kiểm tra tuyến đường." :
          routeCheck?.status === "route_found_unverified" ? "Đã tìm thấy tuyến đường, nhưng chưa có provenance độc lập để khởi hành." :
          "Chưa có tuyến đường độc lập được xác minh. Không thể bắt đầu hành trình."}</Text>
        <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={styles.disabled}>
          <Text style={styles.disabledText}>Đi kế hoạch này · Chưa khả dụng</Text>
        </View>
      </View>
      <Pressable onPress={() => router.push("/(tabs)/map")} accessibilityRole="button" accessibilityLabel="Mở bản đồ" style={styles.button}>
        <Text style={styles.buttonText}>Xem bản đồ</Text>
      </Pressable>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: 24, gap: 16, paddingBottom: 100 },
  title: { ...theme.typography.display, color: theme.color.textPrimary },
  heading: { ...theme.typography.headline, color: theme.color.textPrimary },
  body: { ...theme.typography.body, color: theme.color.textSecondary },
  card: { padding: 18, borderRadius: theme.radius.control, backgroundColor: "#FFFFFF", gap: 10 },
  disabled: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: "#D1D5DB", paddingHorizontal: 16 },
  disabledText: { ...theme.typography.headline, color: "#4B5563" },
  button: { minHeight: 56, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: theme.color.brand[800], paddingHorizontal: 20 },
  buttonText: { ...theme.typography.headline, color: "#FFFFFF" },
});
