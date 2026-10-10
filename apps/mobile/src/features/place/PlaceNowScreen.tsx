import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildPlaceNowViewModel } from "../../../../../src/features/place-now/place-now";
import { describeProvenance } from "@core/presentation/provenance-presentation";
import { theme } from "../../ui/theme";

export function PlaceNowScreen() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const vm = buildPlaceNowViewModel({
    facts: { id: "place-1", name: "Cà phê bên hồ", category: "CAFE", address: "Hà Nội" },
    live: {
      domain: { open: "OPEN", crowd: "BUSY", queue: "SHORT", availableSeating: "LIMITED" },
      truthStatus: "KNOWN", freshness: "FRESH", systemAvailability: "ONLINE",
      permission: "NOT_REQUIRED", contentAvailability: "CONTENT", interactionLifecycle: "NONE",
      fetchLifecycle: "IDLE", safetyLevel: "NONE",
      provenance: [{ sourceType: "COMMUNITY", confidence: "MEDIUM" }],
    },
  }, {
    widthClass: width >= 768 ? "TABLET" : width >= 420 ? "LARGE_PHONE" : "SMALL_PHONE",
    orientation: width > height ? "LANDSCAPE" : "PORTRAIT",
    dynamicTypeScale: fontScale,
  });

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 16 }}>
      <Text style={styles.eyebrow}>PLACE NOW</Text>
      <Text accessibilityRole="header" style={styles.name}>{vm.place.name}</Text>
      <View accessible accessibilityLabel={vm.accessibility.label} style={styles.liveCard}>
        <Text style={styles.cue}>● TÌNH TRẠNG HIỆN TẠI</Text>
        <Text style={styles.headline} allowFontScaling maxFontSizeMultiplier={2}>{vm.headline}</Text>
        <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={2}>{vm.supportingText}</Text>
      </View>
      <Text accessibilityRole="header" style={styles.section}>Bằng chứng gần đây</Text>
      {vm.evidence.map((e, i) => <Text key={i} style={styles.body}>{describeProvenance(e)}</Text>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  eyebrow: { ...theme.typography.label, color: theme.color.brand[700] },
  name: { ...theme.typography.display, color: theme.color.textPrimary },
  liveCard: { backgroundColor: theme.color.surface1, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.card, padding: theme.spacing[4], gap: theme.spacing[2] },
  cue: { ...theme.typography.label, color: theme.color.textSecondary },
  headline: { ...theme.typography.title1, color: theme.color.textPrimary },
  body: { ...theme.typography.body, color: theme.color.textSecondary },
  section: { ...theme.typography.headline, color: theme.color.textPrimary },
});
