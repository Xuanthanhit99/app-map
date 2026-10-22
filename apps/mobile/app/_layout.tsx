import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { routeForNotification } from "../src/infrastructure/push/pushRegistration";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/infrastructure/auth/AuthContext";
import { LocationPreferenceProvider } from "../src/infrastructure/location/LocationPreferenceContext";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Tapping a push opens the place or journey it is about (hints only; no coordinates in payloads). */
function NotificationRouter() {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (Platform.OS === "web" || !last) return;
    const target = routeForNotification(last.notification.request.content.data as Record<string, unknown>);
    if (target) router.push(target as never);
  }, [last, router]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocationPreferenceProvider>
          <StatusBar style="light" />
          <NotificationRouter />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#071C2C" } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="journey/[id]" />
            <Stack.Screen name="decide" />
            <Stack.Screen name="report-action" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="place" />
            <Stack.Screen name="dat-lai-mat-khau" />
            <Stack.Screen name="xac-minh-email" />
          </Stack>
        </LocationPreferenceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
