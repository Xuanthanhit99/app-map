import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { selectFloodSeverity, selectMovingReportType, startMovingContribution, type MovingContributionStep } from "../../../../../src/features/contribution/moving-safe";
import { theme } from "../../ui/theme";

const labels: Record<string, string> = {
  FLOOD: "Ngập", ACCIDENT: "Tai nạn", ROAD_BLOCKED: "Đường chặn",
  LIGHT: "Nhẹ", MODERATE: "Vừa", DEEP: "Nặng",
};

export function MovingContributionScreen() {
  const [state, setState] = useState<MovingContributionStep>(startMovingContribution());

  if (state.step === "SUBMITTED") {
    return <View style={styles.root}><Text accessibilityRole="header" style={styles.title}>Đã ghi nhận</Text><Text style={styles.body}>Chi tiết, ảnh và ghi chú có thể thêm sau khi bạn dừng lại.</Text></View>;
  }

  const title = state.step === "TYPE" ? "Bạn vừa thấy gì?" : "Mức nào?";
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title} allowFontScaling maxFontSizeMultiplier={2}>{title}</Text>
      <Text style={styles.body}>Chọn nhanh, không cần nhập chữ khi đang di chuyển.</Text>
      <View style={styles.options}>
        {state.options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={labels[option]}
            style={styles.option}
            onPress={() => state.step === "TYPE"
              ? setState(selectMovingReportType(option))
              : setState(selectFloodSeverity(option))}
          >
            <Text style={styles.optionText}>{labels[option]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", backgroundColor: theme.color.background, padding: theme.spacing[6], gap: theme.spacing[4] },
  title: { ...theme.typography.display, color: theme.color.textPrimary },
  body: { ...theme.typography.body, color: theme.color.textSecondary },
  options: { gap: theme.spacing[3] },
  option: { minHeight: theme.touchTarget.quickReport, justifyContent: "center", paddingHorizontal: theme.spacing[5], borderRadius: theme.radius.control, backgroundColor: theme.color.surface1, borderWidth: 1, borderColor: theme.color.border },
  optionText: { ...theme.typography.title2, color: theme.color.textPrimary },
});
