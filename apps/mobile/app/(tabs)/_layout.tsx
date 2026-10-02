import { Tabs, useRouter } from "expo-router";
import { Text } from "react-native";
import { theme } from "../../src/ui/theme";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, color: focused ? theme.color.brand[700] : theme.color.textSecondary }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.color.brand[700],
      tabBarInactiveTintColor: theme.color.textSecondary,
      tabBarStyle: { minHeight: 64, paddingTop: 6, paddingBottom: 6, backgroundColor: theme.color.surface1, borderTopColor: theme.color.border },
      tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Map", tabBarAccessibilityLabel: "Bản đồ", tabBarIcon: ({ focused }) => <TabIcon symbol="⌖" focused={focused} /> }} />
      <Tabs.Screen name="journey" options={{ title: "Journey", tabBarAccessibilityLabel: "Hành trình", tabBarIcon: ({ focused }) => <TabIcon symbol="→" focused={focused} /> }} />
      <Tabs.Screen
        name="report"
        listeners={{ tabPress: (event) => { event.preventDefault(); router.push("/report-action"); } }}
        options={{
          title: "Report",
          tabBarAccessibilityLabel: "Mở báo cáo nhanh",
          tabBarIcon: ({ focused }) => <TabIcon symbol="+" focused={focused} />,
          tabBarItemStyle: { minHeight: 56 },
        }}
      />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarAccessibilityLabel: "Hoạt động", tabBarIcon: ({ focused }) => <TabIcon symbol="◉" focused={focused} /> }} />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarAccessibilityLabel: "Cá nhân", tabBarIcon: ({ focused }) => <TabIcon symbol="○" focused={focused} /> }} />
    </Tabs>
  );
}
