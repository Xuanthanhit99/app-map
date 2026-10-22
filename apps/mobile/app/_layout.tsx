import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/infrastructure/auth/AuthContext";
import { LocationPreferenceProvider } from "../src/infrastructure/location/LocationPreferenceContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocationPreferenceProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#071C2C" } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="journey/[id]" />
            <Stack.Screen name="decide" />
            <Stack.Screen name="report-action" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="place" />
          </Stack>
        </LocationPreferenceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
