import type { ComponentProps } from "react";
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

function TabIcon({ name, focused }: { name: ComponentProps<typeof Ionicons>["name"]; focused: boolean }) {
  return <Ionicons name={name} size={22} color={focused ? "#1B7155" : "#82938B"} />;
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
      <Tabs.Screen name="index" options={{ title: "Khám phá", tabBarAccessibilityLabel: "Khám phá", tabBarIcon: ({ focused }) => <TabIcon name="compass-outline" focused={focused} /> }} />
      <Tabs.Screen name="map" options={{ title: "Bản đồ", tabBarAccessibilityLabel: "Bản đồ", tabBarIcon: ({ focused }) => <TabIcon name="map-outline" focused={focused} /> }} />
      <Tabs.Screen name="journey" options={{ title: "Hành trình", tabBarAccessibilityLabel: "Hành trình", tabBarIcon: ({ focused }) => <TabIcon name="navigate-outline" focused={focused} /> }} />
      <Tabs.Screen name="watch" options={{ title: "Theo dõi", tabBarAccessibilityLabel: "Theo dõi", tabBarIcon: ({ focused }) => <TabIcon name="notifications-outline" focused={focused} /> }} />
      <Tabs.Screen name="me" options={{ title: "Tôi", tabBarAccessibilityLabel: "Tôi", tabBarIcon: ({ focused }) => <TabIcon name="person-outline" focused={focused} /> }} />
      <Tabs.Screen name="report" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
  );
}