import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocationPreferenceProvider } from "../src/infrastructure/location/LocationPreferenceContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocationPreferenceProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="active-journey" options={{ animation: "fade" }} />
        <Stack.Screen name="report-action" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="reality/[kind]" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
        <Stack.Screen name="place" />
      </Stack>
      </LocationPreferenceProvider>
    </SafeAreaProvider>
  );
}
