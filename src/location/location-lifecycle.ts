export type LocationLifecycle =
  | { status: "IDLE" }
  | { status: "REQUESTING" }
  | { status: "READY"; latitude: number; longitude: number; accuracyMeters?: number; observedAt: number }
  | { status: "DEGRADED"; lastKnown: { latitude: number; longitude: number; observedAt: number }; reason: "STALE" | "LOW_ACCURACY" | "TEMPORARILY_UNAVAILABLE" }
  | { status: "DENIED"; canAskAgain: boolean }
  | { status: "UNAVAILABLE"; reason: "SERVICES_DISABLED" | "NO_FIX" };

export type LocationEvent =
  | { type: "REQUEST" }
  | { type: "FIX"; latitude: number; longitude: number; accuracyMeters?: number; observedAt: number }
  | { type: "DEGRADE"; reason: "STALE" | "LOW_ACCURACY" | "TEMPORARILY_UNAVAILABLE" }
  | { type: "DENY"; canAskAgain: boolean }
  | { type: "UNAVAILABLE"; reason: "SERVICES_DISABLED" | "NO_FIX" };

export function reduceLocation(state: LocationLifecycle, event: LocationEvent): LocationLifecycle {
  if (event.type === "REQUEST") return { status: "REQUESTING" };
  if (event.type === "FIX") return { status: "READY", latitude: event.latitude, longitude: event.longitude, observedAt: event.observedAt, ...(event.accuracyMeters === undefined ? {} : { accuracyMeters: event.accuracyMeters }) };
  if (event.type === "DENY") return { status: "DENIED", canAskAgain: event.canAskAgain };
  if (event.type === "UNAVAILABLE") return { status: "UNAVAILABLE", reason: event.reason };
  if (event.type === "DEGRADE" && state.status === "READY") return { status: "DEGRADED", lastKnown: { latitude: state.latitude, longitude: state.longitude, observedAt: state.observedAt }, reason: event.reason };
  if (event.type === "DEGRADE" && state.status === "DEGRADED") return { ...state, reason: event.reason };
  return state;
}
