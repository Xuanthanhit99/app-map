import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ResponsiveContract } from "../../../../../src/responsive/layout-contract";
import { RealityMap } from "../../infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../infrastructure/location/useForegroundLocationLifecycle";
import { selectMapItem, type MapMarker, type MapSelection } from "@core/map/map-contract";
import { theme } from "../../ui/theme";

const categories = ["Gần bạn", "Ăn uống", "Cà phê", "Đỗ xe", "Khác"] as const;

function responsiveFor(width: number, height: number, fontScale: number): ResponsiveContract {
  return { widthClass: width >= 768 ? "TABLET" : width >= 420 ? "LARGE_PHONE" : "SMALL_PHONE", orientation: width > height ? "LANDSCAPE" : "PORTRAIT", dynamicTypeScale: fontScale };
}

export function RealityHomeScreen() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const location = useForegroundLocationLifecycle();
  const [category, setCategory] = useState<(typeof categories)[number]>("Gần bạn");
  const responsive = responsiveFor(width, height, fontScale);
  const compact = width < 380 || fontScale >= 1.6;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.greeting}>Chào buổi sáng,</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Bạn muốn đi đâu?</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Thông báo" style={styles.avatar}><Text style={styles.avatarText}>●</Text></Pressable>
          </View>

          <View style={styles.search}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput accessibilityLabel="Tìm kiếm" placeholder="Tìm địa điểm, tuyến đường, tình trạng…" placeholderTextColor={theme.color.textSecondary} style={styles.searchInput} />
            <Text style={styles.mic}>⌁</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((item) => (
              <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
                <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.areaCard}>
          <View>
            <Text style={styles.areaName}>Hà Nội</Text>
            <Text style={styles.areaMeta}>Trời nắng · Cập nhật gần đây</Text>
          </View>
          <View style={styles.weather}><Text style={styles.weatherIcon}>☀</Text><Text style={styles.temperature}>28°</Text></View>
          {!compact ? <View style={styles.aqi}><Text style={styles.aqiLabel}>Chất lượng không khí</Text><Text style={styles.aqiValue}>AQI 42 · Tốt</Text></View> : null}
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionEyebrow}>REALITY PULSE</Text><Text style={styles.sectionTitle}>Đang diễn ra quanh bạn</Text></View>
          <Pressable accessibilityRole="button"><Text style={styles.seeAll}>Xem tất cả ›</Text></Pressable>
        </View>

        <View style={styles.feed}>
          <View style={styles.unknownState}>
            <View style={[styles.stateIcon, styles.stateUnknown]}><Text style={styles.stateIconText}>?</Text></View>
            <View style={styles.liveCopy}>
              <Text style={styles.liveHeadline}>Chưa có đủ tín hiệu gần đây</Text>
              <Text style={styles.liveMeta}>Không có dữ liệu không có nghĩa là khu vực đang an toàn. Báo tình trạng bạn vừa thấy để giúp người đi sau.</Text>
            </View>
          </View>
        </View>

        <View style={styles.mapHeader}><Text style={styles.sectionTitle}>Bản đồ khu vực</Text><Text style={styles.mapHint}>Bản đồ hỗ trợ ngữ cảnh</Text></View>
        <View style={styles.mapPreview}>
          <RealityMap location={location} camera={{ mode: "OVERVIEW" }} accessibilityLabel="Bản đồ khu vực hiện tại. Chưa có tình trạng cộng đồng nào được xác minh để hiển thị." />
          {location.status === "REQUESTING" || location.status === "IDLE" ? <View style={styles.locationPill}><Text style={styles.locationPillText}>Đang tìm vị trí · bản đồ vẫn dùng được</Text></View> : null}
          {location.status === "UNAVAILABLE" ? <View style={styles.locationPill}><Text style={styles.locationPillText}>Chưa lấy được vị trí · đang hiển thị Hà Nội</Text></View> : null}
          {location.status === "DENIED" ? <View style={styles.locationPill}><Text style={styles.locationPillText}>Vị trí đang tắt · bản đồ vẫn dùng được</Text></View> : null}
          <Pressable style={styles.mapButton} accessibilityRole="button"><Text style={styles.mapButtonText}>Xem trên bản đồ</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingHorizontal: 18, gap: 18 },
  hero: { paddingTop: 14, gap: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  greeting: { ...theme.typography.body, color: theme.color.textSecondary },
  heroTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: theme.color.textPrimary, letterSpacing: -0.5 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.brand[100], alignItems: "center", justifyContent: "center" },
  avatarText: { color: theme.color.brand[700], fontSize: 16 },
  search: { minHeight: 54, borderRadius: 18, backgroundColor: theme.color.surface1, borderWidth: 1, borderColor: theme.color.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  searchIcon: { fontSize: 24, color: theme.color.brand[700] },
  searchInput: { flex: 1, fontSize: 15, color: theme.color.textPrimary, paddingVertical: 0 },
  mic: { fontSize: 20, color: theme.color.textSecondary },
  chips: { gap: 8, paddingRight: 4 },
  chip: { minHeight: 38, justifyContent: "center", paddingHorizontal: 14, borderRadius: 19, backgroundColor: theme.color.surface1, borderWidth: 1, borderColor: theme.color.border },
  chipActive: { backgroundColor: theme.color.brand[900], borderColor: theme.color.brand[900] },
  chipText: { ...theme.typography.label, color: theme.color.textPrimary },
  chipTextActive: { color: "#FFFFFF", fontWeight: "600" },
  areaCard: { minHeight: 82, backgroundColor: theme.color.brand[900], borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  areaName: { ...theme.typography.headline, color: "#FFFFFF" },
  areaMeta: { ...theme.typography.small, color: "#DDEDEA", marginTop: 2 },
  weather: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5 },
  weatherIcon: { fontSize: 19, color: "#FFFFFF" },
  temperature: { fontSize: 23, fontWeight: "700", color: "#FFFFFF" },
  aqi: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.22)", paddingLeft: 12 },
  aqiLabel: { fontSize: 10, color: "#DDEDEA" },
  aqiValue: { fontSize: 12, fontWeight: "600", color: "#FFFFFF", marginTop: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 2 },
  sectionEyebrow: { ...theme.typography.label, color: theme.color.brand[700], letterSpacing: 0.7, marginBottom: 3 },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: "700", color: theme.color.textPrimary },
  seeAll: { ...theme.typography.small, color: theme.color.brand[700], fontWeight: "600", paddingBottom: 2 },
  feed: { backgroundColor: theme.color.surface1, borderRadius: 20, borderWidth: 1, borderColor: theme.color.border, overflow: "hidden" },
  liveRow: { minHeight: 86, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.border, gap: 12 },
  stateIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  stateCaution: { backgroundColor: "#FBE8E4" },
  stateTraffic: { backgroundColor: "#FFF1D9" },
  stateParking: { backgroundColor: "#E3F0F8" },
  stateUnknown: { backgroundColor: "#EEF1F0" },
  unknownState: { minHeight: 96, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  stateIconText: { fontSize: 18, fontWeight: "800", color: theme.color.textPrimary },
  liveCopy: { flex: 1, gap: 2 },
  livePlace: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: theme.color.textSecondary },
  liveHeadline: { fontSize: 16, lineHeight: 21, fontWeight: "700", color: theme.color.textPrimary },
  liveMeta: { fontSize: 12, lineHeight: 17, color: theme.color.textSecondary },
  chevron: { fontSize: 26, color: theme.color.textSecondary },
  empty: { ...theme.typography.body, color: theme.color.textSecondary, padding: 16 },
  mapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mapHint: { ...theme.typography.small, color: theme.color.textSecondary },
  mapPreview: { height: 210, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.brand[50] },
  locationPill: { position: "absolute", left: 12, top: 12, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  locationPillText: { fontSize: 12, color: theme.color.textPrimary },
  mapButton: { position: "absolute", left: 12, right: 12, bottom: 12, minHeight: 44, borderRadius: 15, backgroundColor: theme.color.surface1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.border },
  mapButtonText: { ...theme.typography.label, color: theme.color.brand[700], fontWeight: "700" },
});
