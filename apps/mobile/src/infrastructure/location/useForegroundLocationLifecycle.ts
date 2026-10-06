import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reduceLocation, type LocationLifecycle } from "@core/location/location-lifecycle";

const STALE_AFTER_MS = 30_000;
const LOCATION_DEBUG_PREFIX = "[RealityLocation]";

function debugLocation(event: string, detail?: unknown) {
  if (!__DEV__) return;
  if (detail === undefined) console.info(LOCATION_DEBUG_PREFIX, event);
  else console.info(LOCATION_DEBUG_PREFIX, event, detail);
}

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
      debugLocation("position", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
      dispatch(fix(position));
      armStale();
    };

    const start = async () => {
      if (startingRef.current || subscription) return;
      startingRef.current = true;
      dispatch({ type: "REQUEST" });
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        const providerStatus = await Location.getProviderStatusAsync();
        debugLocation("services", { enabled: servicesEnabled, providerStatus });
        if (!servicesEnabled) {
          dispatch({ type: "UNAVAILABLE", reason: "SERVICES_DISABLED" });
          return;
        }

        const permission = await Location.requestForegroundPermissionsAsync();
        debugLocation("permission", { granted: permission.granted, canAskAgain: permission.canAskAgain });
        if (!mounted) return;
        if (!permission.granted) {
          dispatch({ type: "DENY", canAskAgain: permission.canAskAgain });
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 1_000,
        });
        if (lastKnown) {
          debugLocation("lastKnown:position", {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            accuracy: lastKnown.coords.accuracy,
          });
          acceptPosition(lastKnown);
        } else {
          debugLocation("lastKnown:none");
        }

        // The watcher is the authoritative foreground source. Do not make app
        // readiness depend on a separate one-shot GNSS request: on Android the
        // latter can time out even while another app has a valid fused fix.
        debugLocation("watch:request");
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 0,
            timeInterval: 1_000,
            mayShowUserSettingsDialog: true,
          },
          acceptPosition,
        );
        debugLocation("watch:registered");
        if (!mounted) {
          subscription.remove();
          subscription = undefined;
        }
      } catch (error) {
        debugLocation("start:error", error instanceof Error ? error.message : String(error));
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
