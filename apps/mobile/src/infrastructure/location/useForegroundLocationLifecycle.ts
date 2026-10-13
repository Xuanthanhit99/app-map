import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reduceLocation, type LocationLifecycle } from "@core/location/location-lifecycle";
import { createForegroundRestartGate } from "./foreground-restart-gate";
import { createGPSLifecycleContract, type GPSFixSource } from "@core/location/gps-lifecycle-contract";

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
    const gps = createGPSLifecycleContract();
    let activeToken: number | null = null;
    let permissionGranted = false;
    let servicesAvailable: boolean | null = null;
    const validSession = (token: number) => mounted && foreground && activeToken === token;
    const resetLocation = () => {
      stateRef.current = { status: "IDLE" };
      setState({ status: "IDLE" });
    };
    if (!foreground) restartGate.transition(false);

    const commit = (next: LocationLifecycle) => {
      if (!mounted || !foreground) return;
      stateRef.current = next;
      setState(next);
    };
    const dispatch = (event: Parameters<typeof reduceLocation>[1]) => commit(reduceLocation(stateRef.current, event));
    const armStale = (token: number) => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => {
        if (validSession(token)) dispatch({ type: "DEGRADE", reason: "STALE" });
      }, STALE_AFTER_MS);
    };
    const acceptPosition = (position: Location.LocationObject, source: GPSFixSource, token: number) => {
      if (!validSession(token)) return;
      const snapshot = gps.accept(token, position, source, {
        permission: permissionGranted ? "GRANTED" : "UNKNOWN",
        servicesEnabled: servicesAvailable,
        appState: foreground ? "FOREGROUND" : "BACKGROUND",
      }, Date.now());
      if (!snapshot || snapshot.source !== source) return;
      // Cached positions are never promoted to live READY; WATCH alone updates display.
      // E-04B quality stays fail-closed (no approved navigation policy).
      if (source !== "WATCH" || snapshot.quality.classification === "INVALID" ||
          snapshot.quality.classification === "UNAVAILABLE" ||
          snapshot.quality.classification === "STALE" ||
          snapshot.quality.reasons.includes("MISSING_ACCURACY") ||
          snapshot.quality.reasons.includes("MISSING_TIMESTAMP")) return;
      if (snapshot.input.latitude === undefined || snapshot.input.longitude === undefined ||
          snapshot.input.observedAt === undefined) return;
      // Existing 30s display freshness boundary; not an approved navigation policy.
      if (snapshot.input.observedAt > snapshot.input.evaluatedAt ||
          snapshot.input.evaluatedAt - snapshot.input.observedAt > STALE_AFTER_MS) return;
      if (POSITION_LOGS_ENABLED) debugLocation("position", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
      dispatch(fix(position));
      armStale(token);
    };

    const start = async () => {
      if (!mounted || !foreground || subscription) return;
      if (restartGate.begin() !== "START") return;
      const token = gps.start();
      if (token === null) return;
      activeToken = token;
      if (staleTimer) clearTimeout(staleTimer);
      permissionGranted = false;
      servicesAvailable = null;
      dispatch({ type: "REQUEST" });
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!validSession(token)) return;
        const providerStatus = await Location.getProviderStatusAsync();
        if (!validSession(token)) return;
        servicesAvailable = servicesEnabled;
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
        if (!validSession(token)) return;
        permissionGranted = permission.granted;
        if (!permission.granted) {
          dispatch({ type: "DENY", canAskAgain: permission.canAskAgain });
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 1_000,
        });
        if (!validSession(token)) return;
        if (lastKnown) {
          debugLocation("lastKnown:position", {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            accuracy: lastKnown.coords.accuracy,
          });
          acceptPosition(lastKnown, "LAST_KNOWN", token);
        } else {
          debugLocation("lastKnown:none");
        }

        // The watcher is the authoritative foreground source. Do not make app
        // readiness depend on a separate one-shot GNSS request: on Android the
        // latter can time out even while another app has a valid fused fix.
        debugLocation("watch:request");
        const registered = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 5_000,
            mayShowUserSettingsDialog: true,
          },
          (position) => acceptPosition(position, "WATCH", token),
        );
        debugLocation("watch:registered");
        if (!validSession(token)) {
          registered.remove();
          return;
        }
        subscription = registered;
      } catch (error) {
        if (!validSession(token)) return;
        debugLocation("start:error", error instanceof Error ? error.message : String(error));
        if (stateRef.current.status === "READY" || stateRef.current.status === "DEGRADED") {
          dispatch({ type: "DEGRADE", reason: "TEMPORARILY_UNAVAILABLE" });
        } else {
          dispatch({ type: "UNAVAILABLE", reason: "NO_FIX" });
        }
      } finally {
        if (restartGate.finish(Boolean(subscription)) && mounted && foreground) void start();
      }
    };

    void start();
    const appState = AppState.addEventListener("change", (next) => {
      foreground = next === "active";
      if (foreground) {
        if (staleTimer) clearTimeout(staleTimer);
        gps.background();
        activeToken = null;
        resetLocation();
        restartGate.transition(true);
        subscription?.remove();
        subscription = undefined;
        void start();
      } else {
        gps.background();
        activeToken = null;
        resetLocation();
        restartGate.transition(false);
        subscription?.remove();
        subscription = undefined;
        if (staleTimer) clearTimeout(staleTimer);
      }
    });

    return () => {
      mounted = false;
      gps.dispose();
      activeToken = null;
      restartGate.dispose();
      subscription?.remove();
      if (staleTimer) clearTimeout(staleTimer);
      appState.remove();
    };
  }, [enabled]);

  return enabled ? state : { status: "IDLE" };
}
