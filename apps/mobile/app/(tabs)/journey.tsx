import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getRealityDecisionCollection, type ApiCollection } from "../../src/infrastructure/api/realityDecisionClient";
import { theme } from "../../src/ui/theme";


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
  useEffect(() => {
    let mounted = true;
    getRealityDecisionCollection(process.env.EXPO_PUBLIC_API_BASE_URL, "decision").then(result => {
      if (mounted) setState(result);
    });
    return () => { mounted = false; };
  }, []);
  const plans = state.status === "ready" ? state.items.filter(isVerified) : [];
  const active = plans.find(plan => plan.id === selected);
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
        <View style={styles.placeCard}>
          <Text style={styles.heading}>Điểm xuất phát</Text>
          <Text style={styles.body}>Chưa chọn địa điểm</Text>
          <Text style={styles.hint}>Tìm địa chỉ chưa được hỗ trợ: chưa có dịch vụ geocoding được cấu hình.</Text>
        </View>
        <View style={styles.placeCard}>
          <Text style={styles.heading}>Điểm đến</Text>
          <Text style={styles.body}>Chưa chọn địa điểm</Text>
          <Text style={styles.hint}>Chỉ có thể kiểm tra tuyến đường sau khi xác nhận hai địa điểm thật.</Text>
        </View>
        <Text accessibilityRole="alert" style={styles.body}>Không thể kiểm tra tuyến đường khi chưa có địa điểm đã xác nhận và phương án đủ bằng chứng.</Text>
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
  root: { flex: 1, backgroundColor: "#071C2C" },
  content: { padding: 24, gap: 16, paddingBottom: 100 },
  title: { ...theme.typography.display, color: "#F4F4F0" },
  heading: { ...theme.typography.headline, color: "#F4F4F0" },
  body: { ...theme.typography.body, color: "#A9BFCE" },
  card: { padding: 18, borderRadius: theme.radius.control, backgroundColor: "#102A3B", gap: 10 },
  placeCard: { padding: 14, gap: 7, borderRadius: 12, backgroundColor: "#102A3B", borderWidth: 1, borderColor: "#36556A" },
  hint: { fontSize: 12, lineHeight: 18, color: "#F4C979" },
  disabled: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: "#D1D5DB", paddingHorizontal: 16 },
  disabledText: { ...theme.typography.headline, color: "#4B5563" },
  button: { minHeight: 56, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: theme.color.brand[800], paddingHorizontal: 20 },
  buttonText: { ...theme.typography.headline, color: "#FFFFFF" },
});
