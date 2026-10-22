import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DOMAIN_CATALOG, type RealityDomain } from "@core/reality/catalog";

/** Mobile kit in the app's existing night palette (navy + amber). State is never colour-only: glyph + words. */
export const C = { bg: "#071C2C", card: "#102A3B", raised: "#17364A", line: "#36556A", ink: "#F4F4F0", ink2: "#A9BFCE", accent: "#F4C979", onAccent: "#071C2C",
  known: "#7FC8A9", caution: "#F0B35A", avoid: "#FF8A5B", blocked: "#FF6B6B", conflict: "#C3A6F2", unknown: "#B8C4CC", danger: "#FF8A8A" };

export function Screen({ title, eyebrow, children, scroll = true }: { title: string; eyebrow?: string; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const head = <View style={{ gap: 4 }}>{eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={s.title}>{title}</Text></View>;
  if (!scroll) return <View style={[s.root, { paddingTop: insets.top + 12, paddingHorizontal: 18 }]}>{head}{children}</View>;
  return <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 18, gap: 14 }} keyboardShouldPersistTaps="handled">{head}{children}</ScrollView>;
}
export function Card({ children, dashed }: { children: ReactNode; dashed?: boolean }) {
  return <View style={[s.card, dashed && { borderStyle: "dashed" }]}>{children}</View>;
}
export function H({ children }: { children: ReactNode }) { return <Text accessibilityRole="header" style={s.h}>{children}</Text>; }
export function P({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) { return <Text style={[s.p, muted && { color: C.ink2 }, small && { fontSize: 12, lineHeight: 18 }]}>{children}</Text>; }
export function Button({ label, onPress, kind = "primary", disabled, busy, accessibilityHint }: { label: string; onPress: () => void; kind?: "primary" | "secondary" | "danger" | "quiet"; disabled?: boolean; busy?: boolean; accessibilityHint?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }} accessibilityHint={accessibilityHint} disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [s.btn, kind === "primary" ? s.btnPrimary : kind === "danger" ? s.btnDanger : kind === "quiet" ? s.btnQuiet : s.btnSecondary, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
      {busy ? <ActivityIndicator color={kind === "primary" ? C.onAccent : C.accent} /> : <Text style={[s.btnText, kind === "primary" ? { color: C.onAccent } : kind === "danger" ? { color: C.danger } : { color: C.accent }]}>{label}</Text>}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 6 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#7F98A8" style={s.input} {...props} /></View>;
}
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "ok" | "warn" }) {
  const color = tone === "error" ? C.danger : tone === "ok" ? C.known : tone === "warn" ? C.caution : C.ink2;
  return <View accessibilityRole={tone === "error" ? "alert" : "text"} style={[s.notice, { borderColor: color }]}><Text style={[s.p, { color: C.ink }]}>{children}</Text></View>;
}

export type MobileState = { domain: string; truth: "KNOWN" | "UNKNOWN" | "CONFLICT"; value: string | null; label: string | null; freshness: "FRESH" | "AGING" | "STALE" | null; safety: string; confidence: number;
  nature: string | null; observedAt: string | null; sources: { name: string }[]; signals: { value: string; contributors: number }[] };
const FRESH = { FRESH: "mới cập nhật", AGING: "đang cũ dần", STALE: "có thể đã thay đổi" } as const;
export function domainLabel(d: string) { return DOMAIN_CATALOG[d as RealityDomain]?.label ?? d; }
export function valueLabel(d: string, v: string | null) { return v ? DOMAIN_CATALOG[d as RealityDomain]?.values[v]?.label ?? v : ""; }
export function StateRow({ state }: { state: MobileState }) {
  const color = state.truth === "UNKNOWN" ? C.unknown : state.truth === "CONFLICT" ? C.conflict : state.safety === "BLOCKED" ? C.blocked : state.safety === "AVOID" ? C.avoid : state.safety === "CAUTION" ? C.caution : C.known;
  const glyph = state.truth === "KNOWN" ? "✓" : state.truth === "UNKNOWN" ? "?" : "≠";
  const headline = state.truth === "UNKNOWN" ? "Chưa rõ" : state.truth === "CONFLICT" ? "Thông tin mâu thuẫn" : state.freshness === "STALE" ? `Từng ghi nhận: ${(state.label ?? "").toLowerCase()}` : state.label ?? "";
  const meta = [state.freshness ? FRESH[state.freshness] : null, state.truth !== "UNKNOWN" ? `tin cậy ${Math.round(state.confidence * 100)}%` : null, state.nature === "FORECAST" ? "dự báo" : null, state.sources.map((x) => x.name).join(", ") || null].filter(Boolean).join(" · ");
  return (
    <View accessible accessibilityLabel={`${domainLabel(state.domain)}: ${headline}. ${meta}`} style={[s.state, { borderColor: color, borderStyle: state.truth === "UNKNOWN" ? "dashed" : "solid" }]}>
      <View style={[s.glyph, { borderColor: color, backgroundColor: state.truth === "KNOWN" ? color : "transparent" }]}><Text style={{ color: state.truth === "KNOWN" ? C.onAccent : color, fontWeight: "800", fontSize: 12 }}>{glyph}</Text></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.small}>{domainLabel(state.domain)}</Text>
        <Text style={s.stateText}>{headline}</Text>
        {state.truth === "UNKNOWN" ? <Text style={s.small}>Chưa rõ không có nghĩa là bình thường hay an toàn.</Text> : null}
        {state.signals[0] ? <Text style={s.small}>{state.signals[0].contributors} báo cáo chưa xác minh: “{valueLabel(state.domain, state.signals[0].value)}”</Text> : null}
        {meta ? <Text style={s.small}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: C.accent },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: C.ink },
  card: { borderRadius: 18, padding: 16, gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  h: { fontSize: 17, fontWeight: "800", color: C.ink },
  p: { fontSize: 14, lineHeight: 21, color: C.ink },
  label: { fontSize: 13, fontWeight: "700", color: C.ink },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, color: C.ink, paddingHorizontal: 14, fontSize: 16 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: C.accent },
  btnSecondary: { borderWidth: 1, borderColor: C.line, backgroundColor: C.raised },
  btnDanger: { borderWidth: 1, borderColor: C.danger },
  btnQuiet: { backgroundColor: "transparent" },
  btnText: { fontSize: 15, fontWeight: "800" },
  notice: { borderLeftWidth: 4, borderRadius: 10, padding: 12, backgroundColor: C.raised },
  state: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, backgroundColor: C.card },
  glyph: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  stateText: { fontSize: 16, fontWeight: "800", color: C.ink },
  small: { fontSize: 12, lineHeight: 17, color: C.ink2 },
});
