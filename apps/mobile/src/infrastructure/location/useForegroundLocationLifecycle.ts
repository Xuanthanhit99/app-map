import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reduceLocation, type LocationLifecycle } from "@core/location/location-lifecycle";
import { createForegroundRestartGate } from "./foreground-restart-gate";

const STALE_AFTER_MS = 30_000;
const LOCATION_DEBUG_PREFIX = "[RealityLocation]";
const POSITION_LOGS_ENABLED = false;

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

export function useForegroundLocationLifecycle(enabled = true): LocationLifecycle {
  const [state, setState] = useState<LocationLifecycle>({ status: "IDLE" });
  const stateRef = useRef<LocationLifecycle>(state);
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) {
      stateRef.current = { status: "IDLE" };
      setState({ status: "IDLE" });
      return;
    }
    let mounted = true;
    let foreground = AppState.currentState === "active";
    let subscription: Location.LocationSubscription | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    const restartGate = createForegroundRestartGate();
    if (!foreground) restartGate.transition(false);

    const commit = (next: LocationLifecycle) => {
      if (!mounted || !foreground) return;
      stateRef.current = next;
      setState(next);
    };
    const dispatch = (event: Parameters<typeof reduceLocation>[1]) => commit(reduceLocation(stateRef.current, event));
    const armStale = () => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => dispatch({ type: "DEGRADE", reason: "STALE" }), STALE_AFTER_MS);
    };
    const acceptPosition = (position: Location.LocationObject) => {
      if (POSITION_LOGS_ENABLED) debugLocation("position", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
      dispatch(fix(position));
      armStale();
    };

    const start = async () => {
      if (!mounted || !foreground || subscription) return;
      if (restartGate.begin() !== "START") return;
      dispatch({ type: "REQUEST" });
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        const providerStatus = await Location.getProviderStatusAsync();
        debugLocation("services", { enabled: servicesEnabled, providerStatus });
        if (!servicesEnabled) {
          dispatch({ type: "UNAVAILABLE", reason: "SERVICES_DISABLED" });
          return;
        }

        const currentPermission = await Location.getForegroundPermissionsAsync();
        const permission = currentPermission.granted || !currentPermission.canAskAgain
          ? currentPermission
          : await Location.requestForegroundPermissionsAsync();
        debugLocation("permission", { granted: permission.granted, canAskAgain: permission.canAskAgain });
        if (!mounted || !foreground) return;
        if (!permission.granted) {
          dispatch({ type: "DENY", canAskAgain: permission.canAskAgain });
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 1_000,
        });
        if (!mounted || !foreground) return;
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
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 5_000,
            mayShowUserSettingsDialog: true,
          },
          acceptPosition,
        );
        debugLocation("watch:registered");
        if (!mounted || !foreground) {
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
        if (restartGate.finish(Boolean(subscription))) void start();
      }
    };

    void start();
    const appState = AppState.addEventListener("change", (next) => {
      foreground = next === "active";
      if (foreground) {
        restartGate.transition(true);
        subscription?.remove();
        subscription = undefined;
        void start();
      } else {
        restartGate.transition(false);
        subscription?.remove();
        subscription = undefined;
        if (staleTimer) clearTimeout(staleTimer);
      }
    });

    return () => {
      mounted = false;
      restartGate.dispose();
      subscription?.remove();
      if (staleTimer) clearTimeout(staleTimer);
      appState.remove();
    };
  }, [enabled]);

  return enabled ? state : { status: "IDLE" };
}
