import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 19, color: focused ? "#1B7155" : "#82938B" }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: "#1B7155",
      tabBarInactiveTintColor: "#82938B",
      tabBarStyle: { minHeight: 68, paddingTop: 8, paddingBottom: 8, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#DDE9E2" },
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