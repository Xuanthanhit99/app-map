export interface AccessibleStateDescription {
  label: string;
  hint?: string;
  liveRegion?: "off" | "polite" | "assertive";
}

export function describeRealityState(input: {
  headline: string;
  freshness?: string;
  provenance?: string;
  warning?: boolean;
}): AccessibleStateDescription {
  const parts = [
    input.headline,
    input.freshness ? `Cập nhật: ${input.freshness}` : undefined,
    input.provenance ? `Nguồn: ${input.provenance}` : undefined,
  ].filter(Boolean);

  return {
    label: parts.join(". "),
    liveRegion: input.warning ? "assertive" : "polite",
  };
}

export const accessibilityContract = {
  minimumTouchTarget: 48,
  movingTouchTarget: 56,
  requiresNonColorStateCue: true,
  supportsReducedMotion: true,
  supportsDynamicType: true,
  mapRequiresAccessibleEquivalent: true,
} as const;
