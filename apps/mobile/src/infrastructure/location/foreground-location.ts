import * as Location from "expo-location";

export type ForegroundLocationState =
  | { status: "IDLE" }
  | { status: "REQUESTING" }
  | { status: "DENIED"; canAskAgain: boolean }
  | { status: "UNAVAILABLE"; message: string }
  | { status: "READY"; latitude: number; longitude: number; accuracyMeters?: number };

export async function requestForegroundLocation(): Promise<ForegroundLocationState> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: "DENIED", canAskAgain: permission.canAskAgain };

  try {
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 250 });
    const position = lastKnown ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      status: "READY",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      ...(position.coords.accuracy == null ? {} : { accuracyMeters: position.coords.accuracy }),
    };
  } catch {
    return { status: "UNAVAILABLE", message: "Chưa thể xác định vị trí hiện tại." };
  }
}
