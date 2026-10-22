import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

/** Client IDs are public identifiers configured per build; absent IDs mean the button is not offered. */
export const GOOGLE_IDS = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
export function googleConfiguredForPlatform(): boolean {
  return Platform.OS === "ios" ? Boolean(GOOGLE_IDS.ios) : Platform.OS === "android" ? Boolean(GOOGLE_IDS.android) : false;
}

export function newNonce(): string { return Crypto.randomUUID() + Crypto.randomUUID(); }

/** Google ID-token flow bound to a one-time nonce. */
export function useGoogleIdToken(onToken: (idToken: string, nonce: string) => void) {
  const [nonce] = useState(newNonce);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    ...(GOOGLE_IDS.ios ? { iosClientId: GOOGLE_IDS.ios } : {}),
    ...(GOOGLE_IDS.android ? { androidClientId: GOOGLE_IDS.android } : {}),
    ...(GOOGLE_IDS.web ? { webClientId: GOOGLE_IDS.web } : {}),
    extraParams: { nonce },
  });
  useEffect(() => {
    if (response?.type === "success" && typeof response.params.id_token === "string") onToken(response.params.id_token, nonce);
  }, [response, nonce, onToken]);
  return { ready: Boolean(request), prompt: () => promptAsync() };
}

export async function appleAvailable(): Promise<boolean> {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync().catch(() => false));
}

/** Apple returns the SHA-256 of the nonce in the token; the server checks it against the raw nonce. */
export async function appleIdToken(): Promise<{ idToken: string; nonce: string; name: string | null } | null> {
  const nonce = newNonce();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce: hashed });
    if (!cred.identityToken) return null;
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ") || null;
    return { idToken: cred.identityToken, nonce, name };
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}
