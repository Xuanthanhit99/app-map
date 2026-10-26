import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/ui/theme";
export default function ActivityTab(){
 return <View style={styles.root}><Text accessibilityRole="header" style={styles.title}>Activity</Text><Text style={styles.body}>Cần bạn · Ảnh hưởng đến bạn · Đóng góp của bạn · Trước đó</Text></View>;
}
const styles=StyleSheet.create({root:{flex:1,justifyContent:"center",padding:24,gap:12,backgroundColor:theme.color.background},title:{...theme.typography.display,color:theme.color.textPrimary},body:{...theme.typography.body,color:theme.color.textSecondary}});
