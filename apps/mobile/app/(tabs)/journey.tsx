import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/ui/theme";

export default function JourneyTab() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>Hành trình</Text>
      <Text style={styles.body}>Chọn điểm đến và kiểm tra tình hình phía trước trước khi bắt đầu di chuyển. Không có hành trình giả được tạo khi chưa có tuyến đường xác minh.</Text>
      <Pressable onPress={() => router.push("/(tabs)/map")} accessibilityRole="button" accessibilityLabel="Mở bản đồ để chọn điểm đến" style={styles.button}>

          <Text style={styles.buttonText}>Chọn điểm đến trên bản đồ</Text>
      </Pressable>
    </View>
  );
}
const styles=StyleSheet.create({
  root:{flex:1,justifyContent:"center",padding:24,gap:16,backgroundColor:theme.color.background},
  title:{...theme.typography.display,color:theme.color.textPrimary},
  body:{...theme.typography.body,color:theme.color.textSecondary},
  button:{minHeight:56,justifyContent:"center",alignItems:"center",borderRadius:theme.radius.control,backgroundColor:theme.color.brand[800],paddingHorizontal:20},
  buttonText:{...theme.typography.headline,color:"#FFFFFF"}
});
