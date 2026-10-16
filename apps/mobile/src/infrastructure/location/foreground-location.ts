import * as Location from "expo-location";
import type { LocationLifecycle } from "@core/location/location-lifecycle";

export async function requestForegroundLocation(): Promise<LocationLifecycle> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: "DENIED", canAskAgain: permission.canAskAgain };

  try {
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 250 });
    const position = lastKnown ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      status: "READY",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      observedAt: position.timestamp,
      ...(position.coords.accuracy == null ? {} : { accuracyMeters: position.coords.accuracy }),
    };
  } catch {
    return { status: "UNAVAILABLE", reason: "NO_FIX" };
  }
}
