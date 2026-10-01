import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="active-journey" options={{ animation: "fade" }} />
        <Stack.Screen name="reality/[kind]" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
        <Stack.Screen name="place" />
      </Stack>
    </SafeAreaProvider>
  );
}
