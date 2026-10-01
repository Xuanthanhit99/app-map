import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildRealityHomeViewModel, type RealityHomeItem } from "../../../../../src/features/reality-home/reality-home";
import type { ResponsiveContract } from "../../../../../src/responsive/layout-contract";
import { RealityCard } from "../../ui/RealityCard";
import { RealityMap } from "../../infrastructure/map/RealityMap";
import { requestForegroundLocation, type ForegroundLocationState } from "../../infrastructure/location/foreground-location";
import { theme } from "../../ui/theme";

const demoItems: RealityHomeItem[] = [
  {
    id: "road-nguyen-trai",
    kind: "ROAD",
    distanceMeters: 350,
    state: {
      domain: "FLOODED_MODERATE",
      truthStatus: "KNOWN",
      freshness: "FRESH",
      systemAvailability: "ONLINE",
      permission: "GRANTED",
      contentAvailability: "CONTENT",
      interactionLifecycle: "NONE",
      fetchLifecycle: "IDLE",
      safetyLevel: "CAUTION",
      provenance: [{ sourceType: "COMMUNITY", confidence: "MEDIUM" }],
    },
  },
  {
    id: "parking-a",
    kind: "PARKING",
    distanceMeters: 600,
    state: {
      domain: "LIMITED",
      truthStatus: "KNOWN",
      freshness: "AGING",
      systemAvailability: "ONLINE",
      permission: "GRANTED",
      contentAvailability: "CONTENT",
      interactionLifecycle: "NONE",
      fetchLifecycle: "IDLE",
      safetyLevel: "NONE",
      provenance: [{ sourceType: "FACILITY_API", confidence: "HIGH" }],
    },
  },
];

function responsiveFor(width: number, height: number, fontScale: number): ResponsiveContract {
  return {
    widthClass: width >= 768 ? "TABLET" : width >= 420 ? "LARGE_PHONE" : "SMALL_PHONE",
    orientation: width > height ? "LANDSCAPE" : "PORTRAIT",
    dynamicTypeScale: fontScale,
  };
}

export function RealityHomeScreen() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<ForegroundLocationState>({ status: "IDLE" });

  useEffect(() => {
    let active = true;
    setLocation({ status: "REQUESTING" });
    void requestForegroundLocation().then((next) => {
      if (active) setLocation(next);
    });
    return () => { active = false; };
  }, []);
  const responsive = responsiveFor(width, height, fontScale);
  const vm = useMemo(() => buildRealityHomeViewModel(demoItems, responsive), [width, height, fontScale]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.map}>
        <RealityMap
          location={location}
          accessibilityLabel="Bản đồ khu vực hiện tại. Các tình trạng quan trọng có danh sách tương đương ngay bên dưới."
        />
        {location.status === "REQUESTING" || location.status === "IDLE" ? (
          <View style={styles.locationNotice} accessible accessibilityRole="text">
            <Text style={styles.locationNoticeText}>Đang xác định vị trí…</Text>
          </View>
        ) : null}
        {location.status === "DENIED" ? (
          <View style={styles.locationNotice} accessible accessibilityRole="text">
            <Text style={styles.locationNoticeText}>Chưa có quyền vị trí. Bản đồ vẫn dùng được; tình trạng bên dưới không bị coi là thiếu dữ liệu.</Text>
          </View>
        ) : null}
        {location.status === "UNAVAILABLE" ? (
          <View style={styles.locationNotice} accessible accessibilityRole="text">
            <Text style={styles.locationNoticeText}>{location.message} Bản đồ vẫn dùng được với khu vực mặc định.</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        accessibilityLabel="Tình trạng quanh bạn"
      >
        <Text accessibilityRole="header" style={styles.eyebrow}>REALITY HOME</Text>
        <Text accessibilityRole="header" style={styles.title} allowFontScaling maxFontSizeMultiplier={2}>{vm.title}</Text>
        <Text style={styles.subtitle}>Điều đáng chú ý nhất được đưa lên trước. Màu sắc không phải tín hiệu duy nhất.</Text>

        {vm.pulse ? <RealityCard pulse={vm.pulse} /> : <Text style={styles.empty}>{vm.emptyMessage}</Text>}

        {vm.secondary.length ? (
          <View style={styles.secondary}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Gần đây</Text>
            {vm.secondary.map((item) => <RealityCard key={item.id} pulse={item} />)}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  map: { flex: 0.9, minHeight: 220, backgroundColor: theme.color.brand[50] },
  locationNotice: { position: "absolute", left: theme.spacing[3], right: theme.spacing[3], bottom: theme.spacing[3], backgroundColor: theme.color.surface1, borderRadius: theme.radius.card, padding: theme.spacing[3], borderWidth: 1, borderColor: theme.color.border },
  locationNoticeText: { ...theme.typography.small, color: theme.color.textPrimary },
  sheet: { flex: 1.1, backgroundColor: theme.color.background },
  content: { padding: theme.spacing[4], gap: theme.spacing[3] },
  eyebrow: { ...theme.typography.label, color: theme.color.brand[700], letterSpacing: 0.8 },
  title: { ...theme.typography.display, color: theme.color.textPrimary },
  subtitle: { ...theme.typography.body, color: theme.color.textSecondary, marginBottom: theme.spacing[2] },
  secondary: { gap: theme.spacing[3], marginTop: theme.spacing[2] },
  sectionTitle: { ...theme.typography.headline, color: theme.color.textPrimary },
  empty: { ...theme.typography.body, color: theme.color.textSecondary },
});
