import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildRealityHomeViewModel, type RealityHomeItem } from "../../../../../src/features/reality-home/reality-home";
import type { ResponsiveContract } from "../../../../../src/responsive/layout-contract";
import { RealityCard } from "../../ui/RealityCard";
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
  const responsive = responsiveFor(width, height, fontScale);
  const vm = useMemo(() => buildRealityHomeViewModel(demoItems, responsive), [width, height, fontScale]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.map} accessible accessibilityRole="summary" accessibilityLabel="Bản đồ khu vực hiện tại. Danh sách tình trạng tương đương nằm bên dưới.">
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapTitle}>REALITY MAP</Text>
          <Text style={styles.mapHint}>Map provider sẽ được gắn sau; trạng thái không phụ thuộc vào bản đồ để truy cập.</Text>
        </View>
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
  map: { flex: 0.9, minHeight: 220, backgroundColor: theme.color.brand[50], padding: theme.spacing[4] },
  mapPlaceholder: {
    flex: 1, borderWidth: 1, borderColor: theme.color.brand[100], borderRadius: theme.radius.card,
    alignItems: "center", justifyContent: "center", padding: theme.spacing[6], gap: theme.spacing[2],
  },
  mapTitle: { ...theme.typography.label, color: theme.color.brand[800], letterSpacing: 1.2 },
  mapHint: { ...theme.typography.small, color: theme.color.textSecondary, textAlign: "center" },
  sheet: { flex: 1.1, backgroundColor: theme.color.background },
  content: { padding: theme.spacing[4], gap: theme.spacing[3] },
  eyebrow: { ...theme.typography.label, color: theme.color.brand[700], letterSpacing: 0.8 },
  title: { ...theme.typography.display, color: theme.color.textPrimary },
  subtitle: { ...theme.typography.body, color: theme.color.textSecondary, marginBottom: theme.spacing[2] },
  secondary: { gap: theme.spacing[3], marginTop: theme.spacing[2] },
  sectionTitle: { ...theme.typography.headline, color: theme.color.textPrimary },
  empty: { ...theme.typography.body, color: theme.color.textSecondary },
});
