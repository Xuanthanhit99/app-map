import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reduceLocation, type LocationLifecycle } from "@core/location/location-lifecycle";

const STALE_AFTER_MS = 30_000;\nconst LOCATION_DEBUG_PREFIX = "[RealityLocation]";\n\nfunction debugLocation(event: string, detail?: unknown) {\n  if (!__DEV__) return;\n  if (detail === undefined) console.info(LOCATION_DEBUG_PREFIX, event);\n  else console.info(LOCATION_DEBUG_PREFIX, event, detail);\n}

function fix(position: Location.LocationObject) {
  return {
    type: "FIX" as const,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    observedAt: position.timestamp,
    ...(position.coords.accuracy == null ? {} : { accuracyMeters: position.coords.accuracy }),
  };
}

export function useForegroundLocationLifecycle(): LocationLifecycle {
  const [state, setState] = useState<LocationLifecycle>({ status: "IDLE" });
  const stateRef = useRef<LocationLifecycle>(state);
  const startingRef = useRef(false);
  stateRef.current = state;

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;

    const commit = (next: LocationLifecycle) => {
      if (!mounted) return;
      stateRef.current = next;
      setState(next);
    };
    const dispatch = (event: Parameters<typeof reduceLocation>[1]) => commit(reduceLocation(stateRef.current, event));
    const armStale = () => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => dispatch({ type: "DEGRADE", reason: "STALE" }), STALE_AFTER_MS);
    };
    const acceptPosition = (position: Location.LocationObject) => {
      dispatch(fix(position));
      armStale();
    };

    const start = async () => {
      if (startingRef.current || subscription) return;
      startingRef.current = true;
      dispatch({ type: "REQUEST" });
      try {
        const permission = await Location.requestForegroundPermissionsAsync();\n        debugLocation("permission", { granted: permission.granted, canAskAgain: permission.canAskAgain });
        if (!mounted) return;
        if (!permission.granted) {
          dispatch({ type: "DENY", canAskAgain: permission.canAskAgain });
          return;
        }

        // Register the foreground watcher before waiting for a one-shot fix.
        // On emulators and cold GNSS starts, getCurrentPositionAsync can wait for
        // a fix while no continuous native request is active.
        debugLocation("watch:request");\n        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5_000 },
          acceptPosition,
        );
        if (!mounted) {
          subscription.remove();
          subscription = undefined;
          return;
        }

        try {
          debugLocation("current:request");\n          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });\n          debugLocation("current:position", {\n            latitude: position.coords.latitude,\n            longitude: position.coords.longitude,\n            accuracy: position.coords.accuracy,\n          });
          acceptPosition(position);
        } catch {
          // Keep the live foreground watcher active. It can still recover from
          // a cold/no-fix one-shot request without converting the state to a
          // terminal unavailable state.
          if (stateRef.current.status === "READY" || stateRef.current.status === "DEGRADED") {
            dispatch({ type: "DEGRADE", reason: "TEMPORARILY_UNAVAILABLE" });
          }
        }
      } catch {
        if (stateRef.current.status === "READY" || stateRef.current.status === "DEGRADED") {
          dispatch({ type: "DEGRADE", reason: "TEMPORARILY_UNAVAILABLE" });
        } else {
          dispatch({ type: "UNAVAILABLE", reason: "NO_FIX" });
        }
      } finally {
        startingRef.current = false;
      }
    };

    void start();
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void start();
      else {
        subscription?.remove();
        subscription = undefined;
        if (staleTimer) clearTimeout(staleTimer);
      }
    });

    return () => {
      mounted = false;
      startingRef.current = false;
      subscription?.remove();
      if (staleTimer) clearTimeout(staleTimer);
      appState.remove();
    };
  }, []);

  return state;
}
