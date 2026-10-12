import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { getRealityDecisionCollection, type ApiCollection } from "../../src/infrastructure/api/realityDecisionClient";
import { theme } from "../../src/ui/theme";
import { RealityMap } from "../../src/infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../src/infrastructure/location/useForegroundLocationLifecycle";
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

  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const mapLocation = useForegroundLocationLifecycle(false);
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
  const [screenMode, setScreenMode] = useState<"SEARCH" | "ROUTE_PREVIEW">("SEARCH");
  const [editingRoute, setEditingRoute] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const requestEpoch = useRef(0);
  const invalidateRoute = () => { requestEpoch.current += 1; setRouteCheck(null); setConfirming(false); };
  const [mode, setMode] = useState<"DRIVING" | "WALKING" | "CYCLING">("DRIVING");
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
    if (!origin || !destination) return;
    const epoch = ++requestEpoch.current;
    setConfirming(true);
    setRouteCheck({ status: "loading" });
    const result = await checkPlanRoute({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL, planId: active?.id ?? "manual-route", origin: origin.coordinate, destination: destination.coordinate, mode });
    if (epoch !== requestEpoch.current) return;
    setRouteCheck(result);
    setConfirming(false);
    if (result.status === "route_found_unverified" && result.route?.source === "ROUTING_ENGINE" && result.route.coordinates.length >= 2) { setScreenMode("ROUTE_PREVIEW"); setEditingRoute(false); }
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
  if (screenMode === "ROUTE_PREVIEW" && routeCheck?.status === "route_found_unverified" && routeCheck.route?.source === "ROUTING_ENGINE" && routeCheck.route.coordinates.length >= 2 && !editingRoute) {
    const summary = <View style={[styles.previewSummary, !isDesktop && styles.mobilePreviewSummary]}>
      <Text style={styles.previewKicker}>HÀNH TRÌNH · TOMTOM ROUTING</Text>
      <Text style={styles.previewEta}>{Math.floor(routeCheck.durationSeconds / 3600) > 0 ? `${Math.floor(routeCheck.durationSeconds / 3600)} giờ ${Math.round((routeCheck.durationSeconds % 3600) / 60)} phút` : `${Math.round(routeCheck.durationSeconds / 60)} phút`}</Text>
      <Text style={styles.body}>{(routeCheck.distanceMeters / 1000).toFixed(1)} km · {mode === "DRIVING" ? "Ô tô" : mode === "WALKING" ? "Đi bộ" : "Xe đạp"}</Text>
      <View style={styles.realityNote}>
        <Text style={styles.heading}>Reality Check</Text>
        <Text style={styles.body}>Chưa có dữ liệu giao thông thực tế được xác minh cho tuyến này. ETA do TomTom Routing cung cấp, không phải trạng thái LIVE.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => setEditingRoute(true)} style={styles.previewPrimary}><Text style={styles.previewPrimaryText}>Chỉnh sửa hành trình</Text></Pressable>
      <Text style={styles.previewFootnote}>Tuyến thay thế, cảnh báo và điểm dừng chỉ xuất hiện khi có dữ liệu xác thực.</Text>
    </View>;
    const mapView = <View style={styles.previewMap}>
      <RealityMap location={mapLocation} camera={{mode:"FOLLOW_ROUTE",padding:32}} followCamera={false}
        route={routeCheck.route} markers={[...(origin ? [{id:"origin",coordinate:origin.coordinate}] : []),...(destination ? [{id:"destination",coordinate:destination.coordinate}] : [])]}
        accessibilityLabel="Bản đồ lớn hiển thị tuyến TomTom và hai địa điểm" />
    </View>;
    return <View style={styles.previewRoot}>
      <View style={styles.previewHeader}>
        <Pressable accessibilityRole="button" onPress={() => { setScreenMode("SEARCH"); setEditingRoute(false); }} style={styles.previewAction}><Text style={styles.previewActionText}>← Trở lại</Text></Pressable>
        <View style={{flex:1}}>
          <Text numberOfLines={1} style={styles.heading}>{origin?.name} → {destination?.name}</Text>
          <Text style={styles.body}>Tuyến đường đã tìm được · chưa xác minh giao thông thực tế</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Đổi chiều điểm đi và điểm đến" onPress={() => {
          setOrigin(destination); setDestination(origin);
          setOriginQuery(destination?.name ?? ""); setDestinationQuery(origin?.name ?? "");
          setOriginResults(null); setDestinationResults(null); invalidateRoute(); setEditingRoute(true);
        }} style={styles.previewAction}><Text style={styles.previewActionText}>⇅</Text></Pressable>
      </View>
      <View style={isDesktop ? styles.desktopPreview : styles.mobilePreview}>
        {isDesktop ? <View style={{width:340}}>{summary}</View> : <View style={styles.mobileRouteSummary}>{summary}</View>}
        {mapView}
      </View>
    </View>;
  }
  const searchPanel = <ScrollView style={styles.searchPanel} contentContainerStyle={styles.searchContent} keyboardShouldPersistTaps="handled">
      {isDesktop ? <><Text style={styles.eyebrow}>JOURNEY</Text><Text accessibilityRole="header" style={styles.title}>Lên kế hoạch hành trình</Text><Text style={styles.body}>Tìm địa chỉ, chọn đúng địa điểm rồi xem tuyến đường. Không cần nhập tọa độ.</Text></> : null}
      {isDesktop ? <View style={styles.realityCompact}><Text style={styles.realityCompactText}>Reality Check · Chưa có dữ liệu giao thông được xác minh</Text></View> : null}
      <View style={styles.card}>
        {isDesktop ? <Text style={styles.heading}>Tìm đường</Text> : null}
        {([
          { label: "Điểm xuất phát", query: originQuery, setQuery: setOriginQuery, selectedPlace: origin, setPlace: setOrigin, results: originResults },
          { label: "Điểm đến", query: destinationQuery, setQuery: setDestinationQuery, selectedPlace: destination, setPlace: setDestination, results: destinationResults },
        ] as const).map(field => (
          <View key={field.label} style={styles.placeCard}>
            <Text style={styles.heading}>{field.label}</Text>
            <TextInput accessibilityLabel={field.label} placeholder="Nhập tên địa điểm hoặc địa chỉ" placeholderTextColor="#9CB3C2"
              style={styles.input} value={field.query} onChangeText={value => { field.setQuery(value); field.setPlace(null); invalidateRoute(); }} />
            {field.selectedPlace ? <Text style={styles.hint}>Đã chọn từ TomTom: {field.selectedPlace.address}</Text> :
              field.results?.status === "unavailable" ? <Text accessibilityRole="alert" style={styles.hint}>Chưa hỗ trợ tìm địa chỉ: chưa cấu hình dịch vụ geocoding.</Text> :
              field.results?.status === "error" ? <Text accessibilityRole="alert" style={styles.hint}>Không tìm được địa điểm. Kiểm tra kết nối hoặc thử lại.</Text> :
              field.results?.status === "ready" && field.results.items.length === 0 ? <Text style={styles.body}>Không có kết quả phù hợp.</Text> :
              field.query.trim().length < 3 ? <Text style={styles.body}>Nhập ít nhất 3 ký tự để tìm địa điểm thật.</Text> : null}
            {field.results?.status === "ready" && !field.selectedPlace ? field.results.items.map(place =>
              <Pressable key={place.id} accessibilityRole="button" onPress={() => { field.setPlace(place); field.setQuery(place.name); invalidateRoute(); }} style={styles.result}>
                <Text style={styles.heading}>{place.name}</Text>
                <Text style={styles.body}>{place.address} · TomTom</Text>
              </Pressable>) : null}
          </View>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Đổi chiều điểm xuất phát và điểm đến" style={styles.swapButton} onPress={() => {
          setOrigin(destination); setDestination(origin);
          setOriginQuery(destination?.name ?? ""); setDestinationQuery(origin?.name ?? "");
          setOriginResults(null); setDestinationResults(null); invalidateRoute();
        }}><Text style={styles.swapText}>⇅  Đổi chiều điểm đi / điểm đến</Text></Pressable>
        <Text style={styles.heading}>Phương tiện</Text>
        <View style={styles.modes}>{([["DRIVING","Ô tô"],["WALKING","Đi bộ"],["CYCLING","Xe đạp"]] as const).map(([value,label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{selected:mode===value}} onPress={() => {setMode(value);invalidateRoute();}} style={[styles.modeButton,mode===value && styles.modeSelected]}><Text style={[styles.modeText,mode===value && styles.modeSelectedText]}>{label}</Text></Pressable>)}</View>
        <Text style={styles.hint}>Phương tiện được gửi đến Routing API; khả dụng tùy nhà cung cấp.</Text>
        {origin && destination ? <View style={styles.confirmCard}>
          <Text style={styles.heading}>Hai địa điểm đã chọn</Text>
          <Text style={styles.body}>Từ: {origin.name}</Text>
          <Text style={styles.body}>Đến: {destination.name}</Text>
          <Pressable accessibilityRole="button" style={styles.button} disabled={confirming} onPress={() => { void verifyRoute(); }}>
            <Text style={styles.buttonText}>{confirming ? "Đang tìm tuyến…" : "Xác nhận & tìm tuyến đường"}</Text>
          </Pressable>
        </View> : <Text style={styles.hint}>Chọn một kết quả thực cho mỗi địa điểm để tiếp tục.</Text>}
        {routeCheck ? <View style={styles.result}>
          <Text accessibilityRole="alert" style={styles.heading}>{routeCheck.status === "loading" ? "Đang tìm tuyến đường" : routeCheck.status === "route_found_unverified" ? "Đã tìm thấy tuyến đường" : "Chưa tìm được tuyến đường"}</Text>
          <Text style={styles.body}>{routeCheck.status === "route_found_unverified" ?
            `${(routeCheck.distanceMeters / 1000).toFixed(1)} km · ${Math.round(routeCheck.durationSeconds / 60)} phút · Nguồn: ${routeCheck.provider}. Chưa xác minh điều kiện giao thông thực tế.` :
            routeCheck.status === "error" ? routeCheck.reason === "HTTP_503" ? "Dịch vụ định tuyến chưa được cấu hình. Bạn vẫn có thể tìm và chọn địa chỉ." : "Không thể tìm tuyến: " + routeCheck.reason :
            routeCheck.status === "timeout" ? "Yêu cầu hết thời gian. Vui lòng thử lại." : routeCheck.status === "loading" ? "Đang lấy tuyến từ nhà cung cấp…" : "Chưa đủ điều kiện định tuyến."}</Text>
        </View> : null}
      </View>
      {!isDesktop ? <View style={styles.realityCompact}><Text style={styles.realityCompactText}>Reality Check · Chưa có dữ liệu giao thông được xác minh. Không thể kết luận tuyến an toàn hay thông thoáng.</Text></View> : null}
      {isDesktop ? <View style={styles.card}>
        <Text style={styles.heading}>Reality Check</Text>
        <Text style={styles.body}>Chưa có dữ liệu giao thông thực tế được xác minh trên hành trình này. Không thể kết luận tuyến an toàn hay thông thoáng.</Text>
        <Text style={styles.hint}>Thông tin định tuyến TomTom được xác minh riêng với tình trạng giao thông.</Text>
      </View> : null}
      {(isDesktop || plans.length > 0 || state.status === "error") ? <View style={styles.card}>
        <Text style={styles.heading}>Journey Impact · Phương án</Text>
        {state.status === "loading" ? <ActivityIndicator accessibilityLabel="Đang tải phương án" /> : null}
        {state.status === "error" ? <Text style={styles.body}>Chưa tải được dữ liệu phương án có bằng chứng.</Text> : null}
        {state.status === "empty" || (state.status === "ready" && plans.length === 0) ? <Text style={styles.body}>Chưa có tác động hoặc phương án đã xác minh liên quan đến hành trình.</Text> : null}
        {plans.map(plan => <Pressable key={plan.id} accessibilityRole="button" onPress={() => setSelected(plan.id)} style={styles.result}><Text style={styles.heading}>{plan.title}</Text><Text style={styles.body}>{selected === plan.id ? "Đã chọn phương án" : "Xem phương án có bằng chứng"}</Text></Pressable>)}
        <Text style={styles.hint}>Theo dõi hành trình chưa khả dụng cho đến khi đạt kiểm thử an toàn.</Text>
      </View> : null}

    </ScrollView>;
  const searchMap = <View style={styles.searchMap}>
    <RealityMap location={mapLocation} camera={{mode:"OVERVIEW"}} followCamera={false}
      markers={[...(origin ? [{id:"origin",coordinate:origin.coordinate}] : []),...(destination ? [{id:"destination",coordinate:destination.coordinate}] : [])]}
      accessibilityLabel="Bản đồ tìm kiếm địa điểm; chưa có tuyến đường được xác minh" />
    <View pointerEvents="none" style={styles.mapCaption}>
      <Text style={styles.mapCaptionText}>BẢN ĐỒ KHÁM PHÁ · Chưa có tuyến được chọn</Text>
    </View>
  </View>;
  return <View style={styles.previewRoot}>
    {isDesktop ? <View style={styles.desktopPreview}>
      <View style={styles.desktopSearchPanel}>{searchPanel}</View>
      {searchMap}
    </View> : <View style={styles.mobileSearch}>
      {searchMap}
      <View style={[styles.mobileSearchPanel, sheetExpanded ? styles.mobileSheetExpanded : styles.mobileSheetCollapsed]}>
        <Pressable accessibilityRole="button" accessibilityLabel={sheetExpanded ? "Thu gọn bảng tìm đường" : "Mở rộng bảng tìm đường"} onPress={() => setSheetExpanded(value => !value)} style={styles.sheetHandle}>
          <View style={styles.sheetGrip}/><Text style={styles.sheetHandleText}>{sheetExpanded ? "Thu gọn" : "Tìm đường · Mở rộng"}</Text>
        </Pressable>
        {searchPanel}
      </View>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071C2C" },
  searchPanel: { flex: 1, backgroundColor: "#102A3B" },
  searchContent: { padding: 12, paddingBottom: 128, gap: 8 },
  desktopSearchPanel: { width: 390, maxWidth: "40%", backgroundColor: "#102A3B" },
  mobileSearch: { flex: 1 },
  mobileSearchPanel: { backgroundColor: "#102A3B", borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
  mobileSheetCollapsed: { height: "53%" },
  mobileSheetExpanded: { height: "72%" },
  sheetHandle: { minHeight: 44, alignItems: "center", justifyContent: "center", gap: 3, borderBottomWidth: 1, borderBottomColor: "#36556A" },
  sheetGrip: { width: 36, height: 4, borderRadius: 3, backgroundColor: "#9CB3C2" },
  sheetHandleText: { color: "#F4C979", fontSize: 12, fontWeight: "700" },
  realityCompact: { padding: 10, backgroundColor: "#17364A", borderRadius: 10 },
  realityCompactText: { color: "#F4C979", fontSize: 12, fontWeight: "700" },
  mobileRouteSummary: { backgroundColor: "#102A3B" },
  mobilePreviewSummary: { maxHeight: undefined, padding: 10 },
  searchMap: { flex: 1, minHeight: 220 },
  mapCaption: { position: "absolute", top: 12, left: 12, right: 12, alignItems: "flex-start" },
  mapCaptionText: { fontSize: 11, fontWeight: "700", color: "#071C2C", backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  previewRoot: { flex: 1, backgroundColor: "#071C2C" },
  desktopPreview: { flex: 1, flexDirection: "row" },
  mobilePreview: { flex: 1 },
  previewSummary: { padding: 16, gap: 10, backgroundColor: "#102A3B", maxHeight: "58%", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  previewKicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "#F4C979" },
  previewEta: { fontSize: 28, fontWeight: "800", color: "#FFFFFF" },
  realityNote: { gap: 5, padding: 12, borderRadius: 12, backgroundColor: "#17364A" },
  previewPrimary: { minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: "#F4C979" },
  previewPrimaryText: { fontWeight: "800", color: "#071C2C" },
  previewFootnote: { fontSize: 11, color: "#A9BFCE" },
  previewHeader: { padding: 12, flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#102A3B" },
  previewAction: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#577084" },
  previewActionText: { color: "#F4C979", fontWeight: "700", fontSize: 12 },
  previewMap: { flex: 1, minHeight: 280 },
  routeMapCard:{padding:14,gap:10,borderRadius:16,backgroundColor:"#102A3B"},
  routeMap:{height:340,overflow:"hidden",borderRadius:12},
  swapButton:{minHeight:48,justifyContent:"center",alignItems:"center",borderRadius:12,borderWidth:1,borderColor:"#36556A"},
  swapText:{fontSize:13,fontWeight:"700",color:"#F4C979"},
  modes:{flexDirection:"row",gap:8},
  modeButton:{flex:1,minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:11,borderWidth:1,borderColor:"#36556A"},
  modeSelected:{backgroundColor:"#F4C979",borderColor:"#F4C979"},
  modeText:{fontSize:12,fontWeight:"700",color:"#F4F4F0"},
  modeSelectedText:{color:"#071C2C"},
  content: { padding: 24, gap: 16, paddingBottom: 100 },
  eyebrow: { color: "#F4C979", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  confirmCard: { padding: 12, gap: 9, borderRadius: 12, backgroundColor: "#17364A" },
  title: { ...theme.typography.display, color: "#F4F4F0" },
  heading: { ...theme.typography.headline, color: "#F4F4F0" },
  body: { ...theme.typography.body, color: "#A9BFCE" },
  card: { padding: 10, borderRadius: theme.radius.control, backgroundColor: "#102A3B", gap: 10 },
  placeCard: { padding: 10, gap: 7, borderRadius: 12, backgroundColor: "#102A3B", borderWidth: 1, borderColor: "#36556A" },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: "#577084", paddingHorizontal: 12, color: "#F4F4F0", backgroundColor: "#071C2C" },
  result: { padding: 12, borderRadius: 10, backgroundColor: "#17364A", gap: 5 },
  hint: { fontSize: 12, lineHeight: 18, color: "#F4C979" },
  disabled: { minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: "#D1D5DB", paddingHorizontal: 16 },
  disabledText: { ...theme.typography.headline, color: "#4B5563" },
  button: { minHeight: 56, justifyContent: "center", alignItems: "center", borderRadius: theme.radius.control, backgroundColor: "#F4C979", paddingHorizontal: 20 },
  buttonText: { ...theme.typography.headline, color: "#071C2C" },
});
