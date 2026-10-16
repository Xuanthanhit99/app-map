/** E-04C: pure boundary for Expo foreground location events.
 * This module does not subscribe to sensors or authorize navigation.
 */
import { evaluateGPSQuality, type GPSQualityInput, type GPSQualityPolicy, type GPSQualityResult } from "./gps-quality";

export type GPSFixSource = "WATCH" | "LAST_KNOWN";
export type GPSRuntimeContext = {
  permission: GPSQualityInput["permission"];
  servicesEnabled: GPSQualityInput["servicesEnabled"];
  appState: GPSQualityInput["appState"];
};
export type RawGPSPosition = {
  timestamp?: number | null;
  coords?: { latitude?: number | null; longitude?: number | null; accuracy?: number | null } | null;
};
export type GPSLifecycleSnapshot = {
  generation: number;
  source: GPSFixSource | "UNKNOWN";
  input: GPSQualityInput;
  quality: GPSQualityResult;
};

export function normalizeGPSPosition(
  position: RawGPSPosition,
  source: GPSFixSource,
  context: GPSRuntimeContext,
  evaluatedAt: number,
): GPSQualityInput {
  const coords = position.coords;
  return {
    ...(typeof coords?.latitude === "number" ? { latitude: coords.latitude } : {}),
    ...(typeof coords?.longitude === "number" ? { longitude: coords.longitude } : {}),
    ...(typeof coords?.accuracy === "number" ? { accuracyMeters: coords.accuracy } : {}),
    ...(typeof position.timestamp === "number" ? { observedAt: position.timestamp } : {}),
    evaluatedAt,
    source,
    permission: context.permission,
    servicesEnabled: context.servicesEnabled,
    appState: context.appState,
  };
}

/** Every start, background, or disposal invalidates callbacks from older generations. */
export function createGPSLifecycleContract() {
  let generation = 0;
  let active = false;
  let disposed = false;
  let snapshot: GPSLifecycleSnapshot | null = null;
  return {
    start(): number | null {
      if (disposed) return null;
      generation++;
      active = true;
      snapshot = null;
      return generation;
    },
    background(): void {
      generation++;
      active = false;
      snapshot = null;
    },
    dispose(): void {
      generation++;
      active = false;
      disposed = true;
      snapshot = null;
    },
    accept(
      token: number,
      position: RawGPSPosition,
      source: GPSFixSource,
      context: GPSRuntimeContext,
      evaluatedAt: number,
      policy?: GPSQualityPolicy,
    ): GPSLifecycleSnapshot | null {
      if (disposed || !active || token !== generation || context.appState !== "FOREGROUND") return null;
      const input = normalizeGPSPosition(position, source, context, evaluatedAt);
      const next: GPSLifecycleSnapshot = {
        generation, source, input, quality: evaluateGPSQuality(input, policy),
      };
      // A cached fix may provide a temporary display value but must never replace a live watch fix.
      if (source === "LAST_KNOWN" && snapshot?.source === "WATCH") return snapshot;
      snapshot = next;
      return next;
    },
    current(): GPSLifecycleSnapshot | null { return snapshot; },
  };
}
