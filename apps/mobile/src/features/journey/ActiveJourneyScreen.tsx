import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildActiveJourneyViewModel } from "../../../../../src/features/journey/active-journey";
import { theme } from "../../ui/theme";

export function ActiveJourneyScreen() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const vm = buildActiveJourneyViewModel({
    maneuver: { distanceMeters: 300, instruction: "Rẽ phải vào Nguyễn Trãi" },
    etaMinutes: 18,
    roadAhead: {
      domain: "FLOODED_MODERATE", truthStatus: "KNOWN", freshness: "FRESH",
      systemAvailability: "ONLINE", permission: "GRANTED", contentAvailability: "CONTENT",
      interactionLifecycle: "NONE", fetchLifecycle: "IDLE", safetyLevel: "CAUTION",
      provenance: [{ sourceType: "COMMUNITY", confidence: "MEDIUM" }],
    },
    responsive: {
      widthClass: width >= 768 ? "TABLET" : width >= 420 ? "LARGE_PHONE" : "SMALL_PHONE",
      orientation: width > height ? "LANDSCAPE" : "PORTRAIT",
      dynamicTypeScale: fontScale,
    },
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.maneuver} accessible accessibilityRole="summary">
        <Text style={styles.distance}>{vm.maneuver.distanceMeters} m</Text>
        <Text style={styles.instruction} allowFontScaling maxFontSizeMultiplier={2}>{vm.maneuver.instruction}</Text>
      </View>
      <View style={styles.map} accessibilityLabel="Bản đồ hành trình. Hướng dẫn bằng chữ và cảnh báo nằm ngoài bản đồ." />
      {vm.roadAhead ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.warning}>
          <Text style={styles.warningCue}>⚠ CẦN CHÚ Ý</Text>
          <Text style={styles.warningTitle} allowFontScaling maxFontSizeMultiplier={2}>{vm.roadAhead.headline}</Text>
          <Text style={styles.warningText} allowFontScaling maxFontSizeMultiplier={2}>{vm.roadAhead.supportingText}</Text>
        </View>
      ) : null}
      {vm.etaMinutes !== undefined ? <Text style={styles.eta}>Còn khoảng {vm.etaMinutes} phút</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background, padding: theme.spacing[4], gap: theme.spacing[3] },
  maneuver: { gap: theme.spacing[1] },
  distance: { fontSize: 40, lineHeight: 44, fontWeight: "700", color: theme.color.textPrimary },
  instruction: { fontSize: 22, lineHeight: 28, fontWeight: "600", color: theme.color.textPrimary },
  map: { flex: 1, minHeight: 220, backgroundColor: theme.color.brand[50], borderRadius: theme.radius.card },
  warning: { borderWidth: 2, borderColor: theme.color.caution, borderRadius: theme.radius.card, padding: theme.spacing[4], gap: theme.spacing[2], backgroundColor: theme.color.surface1 },
  warningCue: { ...theme.typography.label, color: theme.color.textPrimary },
  warningTitle: { ...theme.typography.title2, color: theme.color.textPrimary },
  warningText: { ...theme.typography.body, color: theme.color.textSecondary },
  eta: { ...theme.typography.headline, color: theme.color.textPrimary },
});
