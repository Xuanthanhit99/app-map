import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../src/ui/theme";
export default function MeTab(){
 return <View style={styles.root}><Text accessibilityRole="header" style={styles.title}>Me</Text><Text style={styles.body}>Phương tiện, quyền riêng tư, dữ liệu cá nhân và cài đặt sẽ được quản lý tại đây.</Text></View>;
}
const styles=StyleSheet.create({root:{flex:1,justifyContent:"center",padding:24,gap:12,backgroundColor:theme.color.background},title:{...theme.typography.display,color:theme.color.textPrimary},body:{...theme.typography.body,color:theme.color.textSecondary}});
