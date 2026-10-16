import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RealityPulse } from "../../../../src/features/reality-home/reality-home";
import { theme } from "./theme";

export function RealityCard({ pulse, onPress }: { pulse: RealityPulse; onPress?: () => void }) {
  const cue =
    pulse.tone === "danger" ? "Cảnh báo" :
    pulse.tone === "caution" ? "Cần chú ý" :
    pulse.tone === "uncertainty" ? "Chưa chắc chắn" : "Cập nhật";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pulse.accessibility.label}
      accessibilityHint="Mở chi tiết và bằng chứng"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cueRow}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.symbol}>
          <Text style={styles.symbolText}>{pulse.tone === "danger" ? "!" : pulse.tone === "uncertainty" ? "?" : "•"}</Text>
        </View>
        <Text style={styles.cue}>{cue}</Text>
      </View>
      <Text style={styles.headline} allowFontScaling maxFontSizeMultiplier={2}>{pulse.headline}</Text>
      {pulse.supportingText ? (
        <Text style={styles.supporting} allowFontScaling maxFontSizeMultiplier={2}>{pulse.supportingText}</Text>
      ) : null}
      {pulse.cta ? <Text style={styles.cta}>{pulse.cta}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: theme.touchTarget.moving,
    backgroundColor: theme.color.surface1,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.card,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  pressed: { opacity: 0.82 },
  cueRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  symbol: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1,
    borderColor: theme.color.textSecondary, alignItems: "center", justifyContent: "center",
  },
  symbolText: { ...theme.typography.label, color: theme.color.textPrimary },
  cue: { ...theme.typography.label, color: theme.color.textSecondary },
  headline: { ...theme.typography.title2, color: theme.color.textPrimary },
  supporting: { ...theme.typography.body, color: theme.color.textSecondary },
  cta: { ...theme.typography.label, color: theme.color.brand[700], marginTop: theme.spacing[1] },
});
