import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/ui/theme";

export default function JourneyTab() {
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>Journey</Text>
      <Text style={styles.body}>Xem trước tuyến đường, Reality phía trước và bắt đầu hành trình.</Text>
      <Link href="/active-journey" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="Bắt đầu hành trình mẫu" style={styles.button}>
          <Text style={styles.buttonText}>Bắt đầu hành trình</Text>
        </Pressable>
      </Link>
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
