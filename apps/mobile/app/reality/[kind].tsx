import { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildRealitySheet } from "@core/features/reality-sheet/reality-sheet";
import { describeProvenance } from "@core/presentation/provenance-presentation";
import type { DetailContainer } from "@core/responsive/layout-contract";
import { theme } from "../../src/ui/theme";

export default function RealityDetailRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headingRef = useRef<Text>(null);
  const isParking = kind === "parking";
  const sheet = buildRealitySheet(isParking ? {
    kind: "PARKING",
    state: { domain: "LIMITED", truthStatus: "KNOWN", freshness: "AGING", systemAvailability: "ONLINE", permission: "GRANTED", contentAvailability: "CONTENT", interactionLifecycle: "NONE", fetchLifecycle: "IDLE", safetyLevel: "NONE", provenance: [{ sourceType: "FACILITY_API", confidence: "HIGH" }] },
  } : {
    kind: "ROAD",
    state: { domain: "FLOODED_MODERATE", truthStatus: "KNOWN", freshness: "FRESH", systemAvailability: "ONLINE", permission: "GRANTED", contentAvailability: "CONTENT", interactionLifecycle: "NONE", fetchLifecycle: "IDLE", safetyLevel: "CAUTION", provenance: [{ sourceType: "COMMUNITY", confidence: "MEDIUM" }] },
  }, {
    widthClass: width >= 768 ? "TABLET" : width >= 420 ? "LARGE_PHONE" : "SMALL_PHONE",
    orientation: width > height ? "LANDSCAPE" : "PORTRAIT",
    dynamicTypeScale: fontScale,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const node = findNodeHandle(headingRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View
        accessibilityViewIsModal={sheet.container !== "SIDE_INSPECTOR"}
        style={[styles.panel, containerStyles[sheet.container]]}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết" onPress={() => router.back()} style={styles.close}>
          <Text>Đóng</Text>
        </Pressable>
        <Text ref={headingRef} accessible accessibilityRole="header" style={styles.title}>{sheet.presentation.headline}</Text>
        <Text style={styles.body}>{sheet.presentation.supportingText}</Text>
        <Text accessibilityRole="header" style={styles.section}>Bằng chứng</Text>
        {sheet.evidence.map((e, i) => <Text key={i} style={styles.body}>{describeProvenance(e)}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(23,32,31,0.18)", padding: 16 },
  panel: { backgroundColor: theme.color.surface1, borderRadius: theme.radius.sheet, padding: 20, gap: 12, borderWidth: 1, borderColor: theme.color.border },
  bottomSheet: { width: "100%", maxHeight: "82%", alignSelf: "stretch" },
  floatingPanel: { width: "92%", maxWidth: 560, maxHeight: "78%", alignSelf: "center", marginBottom: 12 },
  sideInspector: { alignSelf: "flex-end", width: "42%", minWidth: 360, maxWidth: 560, height: "100%", justifyContent: "center" },
  glanceRail: { alignSelf: "flex-end", width: "46%", minWidth: 320, maxWidth: 520, maxHeight: "92%", justifyContent: "center" },
  close: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12 },
  title: { ...theme.typography.title1, color: theme.color.textPrimary },
  body: { ...theme.typography.body, color: theme.color.textSecondary },
  section: { ...theme.typography.headline, color: theme.color.textPrimary },
});

const containerStyles: Record<DetailContainer, object> = {
  BOTTOM_SHEET: styles.bottomSheet,
  FLOATING_PANEL: styles.floatingPanel,
  SIDE_INSPECTOR: styles.sideInspector,
  GLANCE_RAIL: styles.glanceRail,
};
