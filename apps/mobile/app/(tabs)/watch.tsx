import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function WatchTab() {
  const insets=useSafeAreaInsets();
  return <View style={[styles.root,{paddingTop:insets.top}]}><Text style={styles.eyebrow}>WATCH</Text><Text style={styles.title}>Theo dõi</Text><View style={styles.card}><Text style={styles.cardTitle}>Chưa có khu vực đang theo dõi</Text><Text style={styles.body}>Các khu vực, tuyến đường và cảnh báo bạn chủ động lưu sẽ xuất hiện ở đây. Không có dữ liệu giả được tạo để lấp trạng thái trống.</Text></View></View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#FFFFFF",paddingHorizontal:16,paddingTop:18},eyebrow:{fontSize:10,fontWeight:"800",letterSpacing:1.2,color:"#287158"},title:{fontSize:27,lineHeight:33,fontWeight:"800",color:"#172C27",marginTop:4,marginBottom:18},card:{padding:17,borderRadius:20,backgroundColor:"#F5F8F6",borderWidth:1,borderColor:"#DCE9E2"},cardTitle:{fontSize:16,fontWeight:"700",color:"#FFF"},body:{fontSize:12,lineHeight:18,color:"#536A64",marginTop:5}});