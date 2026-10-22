import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "../api/client";

/**
 * Push registration. Returns a truthful status instead of pretending:
 * - UNSUPPORTED: web, simulator/emulator, or the build has no EAS projectId (no FCM/APNs credentials).
 * - DENIED: the user refused the OS permission.
 * - REGISTERED: the Expo push token is stored server-side for this account.
 */
export type PushStatus = "REGISTERED" | "DENIED" | "UNSUPPORTED" | "FAILED";
const KEY = "reality.push.token.v1";

export function pushProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ?? null;
}

export async function registerForPush(): Promise<PushStatus> {
  if (Platform.OS === "web" || !Device.isDevice) return "UNSUPPORTED";
  const projectId = pushProjectId();
  if (!projectId) return "UNSUPPORTED";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reality-alerts", { name: "Cảnh báo tình trạng", importance: Notifications.AndroidImportance.HIGH });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return "DENIED";
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/v1/me/push-tokens", { method: "POST", body: { token, platform: Platform.OS === "ios" ? "ios" : "android" } });
    await SecureStore.setItemAsync(KEY, token);
    return "REGISTERED";
  } catch {
    return "FAILED";
  }
}

/** Called on sign-out and when notification consent is withdrawn. */
export async function unregisterPush(): Promise<void> {
  if (Platform.OS === "web") return;
  const token = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (!token) return;
  try { await api("/v1/me/push-tokens/remove", { method: "POST", body: { token } }); } catch { /* server also drops tokens when consent is revoked */ }
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

/** Routing hints only (no coordinates travel in pushes). */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.journeyId === "string") return `/journey/${data.journeyId}`;
  if (typeof data.placeSlug === "string") return `/place?slug=${encodeURIComponent(data.placeSlug)}`;
  return "/(tabs)/watch";
}
