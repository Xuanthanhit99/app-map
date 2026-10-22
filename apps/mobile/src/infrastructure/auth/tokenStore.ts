import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Tokens live in the platform keystore (iOS Keychain / Android Keystore via expo-secure-store),
 * never in AsyncStorage. Expo web has no secure store, so tokens are kept in memory only there.
 */
export type StoredTokens = { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string };
const KEY = "reality.session.v1";
let memory: StoredTokens | null = null;

export async function loadTokens(): Promise<StoredTokens | null> {
  if (Platform.OS === "web") return memory;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch { return null; }
}
export async function saveTokens(tokens: StoredTokens | null): Promise<void> {
  memory = tokens;
  if (Platform.OS === "web") return;
  if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(KEY);
}
