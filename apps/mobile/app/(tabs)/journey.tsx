import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getRealityDecisionCollection, type ApiCollection } from "../../src/infrastructure/api/realityDecisionClient";
import { theme } from "../../src/ui/theme";
import { searchPlaces, type PlaceResult, type PlaceSearch } from "../../src/infrastructure/api/placeSearchClient";
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
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [origin, setOrigin] = useState<PlaceResult | null>(null);
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [originResults, setOriginResults] = useState<PlaceSearch | null>(null);
  const [destinationResults, setDestinationResults] = useState<PlaceSearch | null>(null);
  const [routeCheck, setRouteCheck] = useState<RouteCheck | { status: "loading" } | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (origin || originQuery.trim().length < 3) { setOriginResults(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => { void searchPlaces(process.env.EXPO_PUBLIC_API_BASE_URL, originQuery, controller.signal).then(result => { if (!controller.signal.aborted) setOriginResults(result); }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [originQuery, origin]);
  useEffect(() => {
    if (destination || destinationQuery.trim().length < 3) { setDestinationResults(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => { void searchPlaces(process.env.EXPO_PUBLIC_API_BASE_URL, destinationQuery, controller.signal).then(result => { if (!controller.signal.aborted) setDestinationResults(result); }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [destinationQuery, destination]);
  async function verifyRoute() {
    if (!origin || !destination || !active) return;
    setConfirming(true);
    setRouteCheck({ status: "loading" });
    const result = await checkPlanRoute({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL, planId: active.id, origin: origin.coordinate, destination: destination.coordinate });
    setRouteCheck(result);
    setConfirming(false);
  }
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
        {([
          { label: "Điểm xuất phát", query: originQuery, setQuery: setOriginQuery, selectedPlace: origin, setPlace: setOrigin, results: originResults },
          { label: "Điểm đến", query: destinationQuery, setQuery: setDestinationQuery, selectedPlace: destination, setPlace: setDestination, results: destinationResults },
        ] as const).map(field => (
          <View key={field.label} style={styles.placeCard}>
            <Text style={styles.heading}>{field.label}</Text>
            <TextInput accessibilityLabel={field.label} placeholder="Nhập tên địa điểm hoặc địa chỉ" placeholderTextColor="#9CB3C2"
              style={styles.input} value={field.query} onChangeText={value => { field.setQuery(value); field.setPlace(null); setRouteCheck(null); }} />
            {field.selectedPlace ? <Text style={styles.hint}>Đã chọn từ TomTom: {field.selectedPlace.address}</Text> :
              field.results?.status === "unavailable" ? <Text accessibilityRole="alert" style={styles.hint}>Chưa hỗ trợ tìm địa chỉ: chưa cấu hình dịch vụ geocoding.</Text> :
              field.results?.status === "error" ? <Text accessibilityRole="alert" style={styles.hint}>Không tìm được địa điểm. Kiểm tra kết nối hoặc thử lại.</Text> :
              field.results?.status === "ready" && field.results.items.length === 0 ? <Text style={styles.body}>Không có kết quả phù hợp.</Text> :
              field.query.trim().length < 3 ? <Text style={styles.body}>Nhập ít nhất 3 ký tự để tìm địa điểm thật.</Text> : null}
            {field.results?.status === "ready" && !field.selectedPlace ? field.results.items.map(place =>
              <Pressable key={place.id} accessibilityRole="button" onPress={() => { field.setPlace(place); field.setQuery(place.address); setRouteCheck(null); }} style={styles.result}>
                <Text style={styles.heading}>{place.name}</Text>
                <Text style={styles.body}>{place.address} · TomTom</Text>
              </Pressable>) : null}
          </View>
        ))}
        {origin && destination ? <View style={styles.placeCard}>
          <Text style={styles.heading}>Xác nhận địa điểm</Text>
          <Text style={styles.body}>Đi: {origin.address}</Text>
          <Text style={styles.body}>Đến: {destination.address}</Text>
          <Pressable accessibilityRole="button" disabled={!active || confirming} style={styles.button} onPress={() => { void verifyRoute(); }}>
            <Text style={styles.buttonText}>{!active ? "Chưa có phương án được xác minh" : confirming ? "Đang kiểm tra tuyến…" : "Xác nhận và kiểm tra tuyến"}</Text>
          </Pressable>
        </View> : <Text style={styles.hint}>Hãy chọn hai kết quả địa điểm thật để xác nhận. Không tự dùng vị trí thiết bị.</Text>}
        {routeCheck ? <Text accessibilityRole="alert" style={styles.body}>{routeCheck.status === "loading" ? "Đang kiểm tra tuyến…" :
          routeCheck.status === "route_found_unverified" ? "Đã tìm được tuyến, nhưng chưa đủ bằng chứng độc lập để bắt đầu hành trình." :
          routeCheck.status === "error" ? "Không kiểm tra được tuyến: " + routeCheck.reason :
          routeCheck.status === "timeout" ? "Hết thời gian kiểm tra tuyến." : "Chưa thể kiểm tra tuyến."}</Text> : null}
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
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: "#577084", paddingHorizontal: 12, color: "#F4F4F0", backgroundColor: "#071C2C" },
  result: { padding: 12, borderRadius: 10, backgroundColor: "#17364A", gap: 5 },
  hint: { fontSize: 12, lineHeight: 18, color: "#F4C979" },
  disabled: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: "#D1D5DB", paddingHorizontal: 16 },
  disabledText: { ...theme.typography.headline, color: "#4B5563" },
  button: { minHeight: 56, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: "#F4C979", paddingHorizontal: 20 },
  buttonText: { ...theme.typography.headline, color: "#071C2C" },
});
