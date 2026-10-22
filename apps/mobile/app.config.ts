import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Build-time configuration layered over app.json. Everything here comes from environment
 * variables set per build (EAS secrets / CI), never from source:
 * - EAS_PROJECT_ID: enables Expo push tokens (FCM/APNs credentials live in EAS).
 * - APP_LINK_HOST: web host for universal links (iOS associatedDomains) and verified Android App Links.
 * - APPLE_SIGN_IN=true: adds the Sign in with Apple entitlement.
 * Without them the app builds and the related features report themselves unavailable.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const host = process.env.APP_LINK_HOST?.trim();
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const appleSignIn = process.env.APPLE_SIGN_IN === "true";
  const linkPaths = ["/dia-diem", "/hanh-trinh", "/dat-lai-mat-khau", "/xac-minh-email"];
  return {
    ...(config as ExpoConfig),
    plugins: [
      ...(config.plugins ?? []),
      ["expo-notifications", { defaultChannel: "reality-alerts", color: "#F2B544" }],
      ...(appleSignIn ? ["expo-apple-authentication"] : []),
    ],
    ios: {
      ...config.ios,
      ...(appleSignIn ? { usesAppleSignIn: true } : {}),
      ...(host ? { associatedDomains: [`applinks:${host}`] } : {}),
    },
    android: {
      ...config.android,
      ...(host ? {
        intentFilters: [{
          action: "VIEW",
          autoVerify: true,
          data: linkPaths.map((pathPrefix) => ({ scheme: "https", host, pathPrefix })),
          category: ["BROWSABLE", "DEFAULT"],
        }],
      } : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
      appLinkHost: host ?? null,
    },
  };
};
