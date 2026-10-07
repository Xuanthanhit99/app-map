import type { RealityHomeItem } from "@core/features/reality-home/reality-home";

const base = {
  systemAvailability: "ONLINE" as const,
  permission: "NOT_REQUIRED" as const,
  contentAvailability: "CONTENT" as const,
  fetchLifecycle: "IDLE" as const,
};

export const WORLD_PULSE_DEVELOPMENT_FIXTURES: RealityHomeItem[] = [
  {
    id: "dev-road-cau-giay",
    kind: "ROAD",
    distanceMeters: 420,
    state: {
      ...base,
      domain: "SLOW",
      truthStatus: "KNOWN",
      freshness: "FRESH",
      interactionLifecycle: "ACTION_REQUIRED",
      safetyLevel: "CAUTION",
      provenance: [{ sourceType: "DEVELOPMENT_FIXTURE", provider: "World Pulse QA", confidence: "HIGH", observedAt: "2026-10-07T07:00:00Z" }],
    },
  },
  {
    id: "dev-parking-lang",
    kind: "PARKING",
    distanceMeters: 760,
    state: {
      ...base,
      domain: "LIMITED",
      truthStatus: "CONFLICT",
      freshness: "FRESH",
      interactionLifecycle: "ACTION_REQUIRED",
      safetyLevel: "NONE",
      provenance: [{ sourceType: "DEVELOPMENT_FIXTURE", provider: "World Pulse QA", confidence: "MEDIUM", observedAt: "2026-10-07T06:58:00Z" }],
    },
  },
  {
    id: "dev-road-aging",
    kind: "ROAD",
    distanceMeters: 1250,
    state: {
      ...base,
      domain: "CLEAR",
      truthStatus: "KNOWN",
      freshness: "AGING",
      interactionLifecycle: "NONE",
      safetyLevel: "NONE",
      provenance: [{ sourceType: "DEVELOPMENT_FIXTURE", provider: "World Pulse QA", confidence: "MEDIUM", observedAt: "2026-10-07T06:25:00Z" }],
    },
  },
];

export function getWorldPulseDevelopmentFixtures(): RealityHomeItem[] {
  return __DEV__ ? WORLD_PULSE_DEVELOPMENT_FIXTURES : [];
}
