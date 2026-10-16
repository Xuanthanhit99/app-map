import type { ComposableState } from "../../domain/state-model";
import type { ParkingAvailability, RoadState } from "../../domain/domain-states";
import { resolveParkingPresentation, resolveRoadPresentation } from "../../presentation/domain-resolvers";
import { describeRealityState, type AccessibleStateDescription } from "../../accessibility/semantics";
import { shouldReduceChrome, type ResponsiveContract } from "../../responsive/layout-contract";

export type RealityHomeItem =
  | { id: string; kind: "ROAD"; state: ComposableState<RoadState>; distanceMeters?: number }
  | { id: string; kind: "PARKING"; state: ComposableState<ParkingAvailability>; distanceMeters?: number };

export interface RealityPulse {
  id: string;
  kind: RealityHomeItem["kind"];
  headline: string;
  supportingText?: string;
  tone: "neutral" | "positive" | "caution" | "danger" | "uncertainty" | "muted";
  cta?: string;
  accessibility: AccessibleStateDescription;
}

export interface RealityHomeViewModel {
  title: "Ngay quanh bạn";
  pulse: RealityPulse | null;
  secondary: RealityPulse[];
  chrome: {
    showSearch: true;
    showLocate: true;
    showLayers: true;
    showShortcutRow: boolean;
  };
  emptyMessage?: string;
}

function toPulse(item: RealityHomeItem): RealityPulse {
  const presentation =
    item.kind === "ROAD"
      ? resolveRoadPresentation(item.state)
      : resolveParkingPresentation(item.state);

  return {
    id: item.id,
    kind: item.kind,
    headline: presentation.headline,
    tone: presentation.tone,
    ...(presentation.supportingText !== undefined ? { supportingText: presentation.supportingText } : {}),
    ...(presentation.cta !== undefined ? { cta: presentation.cta } : {}),
    accessibility: describeRealityState({
      headline: presentation.headline,
      warning: item.state.safetyLevel !== "NONE",
      ...(item.state.freshness !== undefined ? { freshness: item.state.freshness } : {}),
      ...(item.state.provenance?.[0]?.sourceType !== undefined ? { provenance: item.state.provenance[0].sourceType } : {}),
    }),
  };
}

function priority(item: RealityHomeItem): number {
  let score = 0;
  if (item.state.safetyLevel === "BLOCKED") score += 100;
  else if (item.state.safetyLevel === "AVOID") score += 80;
  else if (item.state.safetyLevel === "CAUTION") score += 60;

  if (item.state.truthStatus === "CONFLICT") score += 35;
  else if (item.state.truthStatus === "UNKNOWN") score += 20;

  if (item.state.interactionLifecycle === "ACTION_REQUIRED") score += 25;
  if (item.state.freshness === "FRESH") score += 10;
  if (item.state.freshness === "STALE") score -= 15;

  if (item.distanceMeters !== undefined) {
    score += Math.max(0, 20 - Math.floor(item.distanceMeters / 250));
  }

  return score;
}

export function buildRealityHomeViewModel(
  items: RealityHomeItem[],
  responsive: ResponsiveContract,
): RealityHomeViewModel {
  const ordered = [...items].sort((a, b) => priority(b) - priority(a));
  const pulses = ordered.map(toPulse);

  return {
    title: "Ngay quanh bạn",
    pulse: pulses[0] ?? null,
    secondary: pulses.slice(1, shouldReduceChrome(responsive) ? 3 : 5),
    chrome: {
      showSearch: true,
      showLocate: true,
      showLayers: true,
      showShortcutRow: !shouldReduceChrome(responsive),
    },
    ...(pulses.length === 0 ? { emptyMessage: "Chưa có đủ tín hiệu gần đây. Không có dữ liệu không có nghĩa là khu vực đang an toàn." } : {}),
  };
}
