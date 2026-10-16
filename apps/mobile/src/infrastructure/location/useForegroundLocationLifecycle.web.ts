import { useEffect, useState } from "react";
import { reduceLocation, type LocationLifecycle } from "@core/location/location-lifecycle";

/** Web preview uses browser permission only after explicit opt-in; never loads expo-location native emitter. */
export function useForegroundLocationLifecycle(enabled = true): LocationLifecycle {
  const [state, setState] = useState<LocationLifecycle>({ status: "IDLE" });
  useEffect(() => {
    if (!enabled) {
      setState({ status: "IDLE" });
      return;
    }
    let active = true;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState(reduceLocation({ status: "IDLE" }, { type: "UNAVAILABLE", reason: "NO_FIX" }));
      return;
    }
    setState(reduceLocation({ status: "IDLE" }, { type: "REQUEST" }));
    const watchId = navigator.geolocation.watchPosition(
      position => {
        if (!active) return;
        setState(previous => reduceLocation(previous, {
          type: "FIX",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          observedAt: position.timestamp,
          ...(position.coords.accuracy == null ? {} : { accuracyMeters: position.coords.accuracy }),
        }));
      },
      error => {
        if (!active) return;
        setState(previous => reduceLocation(previous, error.code === 1
          ? { type: "DENY", canAskAgain: false }
          : { type: "UNAVAILABLE", reason: "NO_FIX" }));
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 12000 },
    );
    return () => { active = false; navigator.geolocation.clearWatch(watchId); };
  }, [enabled]);
  return enabled ? state : { status: "IDLE" };
}
