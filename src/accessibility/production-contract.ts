export type AccessibilityRole =
  | "button"
  | "header"
  | "search"
  | "summary"
  | "status"
  | "alert"
  | "list"
  | "listitem";

export interface AccessibleNode {
  id: string;
  role: AccessibilityRole;
  label: string;
  hint?: string;
  order: number;
  minimumTargetDp?: number;
  nonColorCue?: string;
}

export interface MapAccessibleAlternative {
  heading: string;
  summary: string;
  items: Array<{
    id: string;
    label: string;
    distanceText?: string;
    stateText: string;
  }>;
}

export interface MotionPreference {
  reduceMotion: boolean;
}

export const productionAccessibility = {
  minimumTargetDp: 48,
  movingTargetDp: 56,
  quickReportTargetDp: 64,
  maxCriticalTextScaleWithoutLoss: 2,
  stateMustNotDependOnColor: true,
  mapRequiresStructuredAlternative: true,
  safetyChangeRequiresNonVisualCue: true,
  movingFlowMustAvoidTyping: true,
} as const;

export function resolveMotion(input: MotionPreference) {
  return input.reduceMotion
    ? {
        mapCamera: "instant" as const,
        sheet: "crossfade" as const,
        warning: "static" as const,
        parallax: false,
      }
    : {
        mapCamera: "spatial" as const,
        sheet: "spring" as const,
        warning: "subtle-pulse" as const,
        parallax: false,
      };
}

export function assertTouchTarget(sizeDp: number, moving = false): boolean {
  return sizeDp >= (moving ? productionAccessibility.movingTargetDp : productionAccessibility.minimumTargetDp);
}

export function buildMapAlternative(input: MapAccessibleAlternative): MapAccessibleAlternative {
  return input;
}
