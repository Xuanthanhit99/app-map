import { Tabs } from "expo-router";
import { Text } from "react-native";
import { theme } from "../../src/ui/theme";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 19, color: focused ? "#D5B77A" : "#78938D" }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: "#D5B77A",
      tabBarInactiveTintColor: "#78938D",
      tabBarStyle: { minHeight: 68, paddingTop: 7, paddingBottom: 7, backgroundColor: "#0A1D1A", borderTopColor: "rgba(255,255,255,0.10)" },
      tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Khám phá", tabBarAccessibilityLabel: "Khám phá", tabBarIcon: ({ focused }) => <TabIcon symbol="✦" focused={focused} /> }} />
      <Tabs.Screen name="map" options={{ title: "Bản đồ", tabBarAccessibilityLabel: "Bản đồ", tabBarIcon: ({ focused }) => <TabIcon symbol="⌖" focused={focused} /> }} />
      <Tabs.Screen name="journey" options={{ title: "Hành trình", tabBarAccessibilityLabel: "Hành trình", tabBarIcon: ({ focused }) => <TabIcon symbol="→" focused={focused} /> }} />
      <Tabs.Screen name="watch" options={{ title: "Theo dõi", tabBarAccessibilityLabel: "Theo dõi", tabBarIcon: ({ focused }) => <TabIcon symbol="◉" focused={focused} /> }} />
      <Tabs.Screen name="me" options={{ title: "Tôi", tabBarAccessibilityLabel: "Tôi", tabBarIcon: ({ focused }) => <TabIcon symbol="○" focused={focused} /> }} />
      <Tabs.Screen name="report" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
  );
}