import { useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocationPreference } from "../../src/infrastructure/location/LocationPreferenceContext";

export default function MeTab() {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState(false);
  const { choice, hydrated, setChoice } = useLocationPreference();
  return <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 }]}>
    <Text style={styles.eyebrow}>ME / PRIVACY</Text>
    <Text accessibilityRole="header" style={styles.title}>Tôi</Text>
    <Text style={styles.subtitle}>Bạn kiểm soát quyền riêng tư và ngữ cảnh cá nhân.</Text>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Quyền riêng tư · Định vị</Text>
      <Text style={styles.body}>Ứng dụng chỉ yêu cầu quyền vị trí khi bạn chọn bật. Tắt trong ứng dụng không thay đổi quyền hệ thống đã cấp.</Text>
      <Text style={styles.status}>Lựa chọn hiện tại: {!hydrated ? "Đang tải lựa chọn đã lưu" : choice === "ENABLE" ? "Bật định vị" : choice === "SKIP" ? "Không bật" : "Chưa lựa chọn"}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: choice === "ENABLE" }} disabled={!hydrated} onPress={() => setChoice("ENABLE")} style={[styles.action, choice === "ENABLE" && styles.selected]}><Text style={[styles.actionText, choice === "ENABLE" && styles.selectedText]}>Bật định vị</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: choice === "SKIP" }} disabled={!hydrated} onPress={() => setChoice("SKIP")} style={[styles.action, choice === "SKIP" && styles.selected]}><Text style={[styles.actionText, choice === "SKIP" && styles.selectedText]}>Không bật</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => { if (Platform.OS !== "web") void Linking.openSettings(); else setNotice(true); }} style={styles.settings}><Text style={styles.settingsText}>{Platform.OS === "web" ? "Quản lý quyền vị trí trong trình duyệt" : Platform.OS === "ios" ? "Quản lý quyền trong cài đặt iOS" : "Quản lý quyền trong cài đặt Android"}</Text></Pressable>
      <Text style={styles.note}>Lựa chọn được lưu trên thiết bị để sử dụng khi mở lại ứng dụng. {Platform.OS === "web" ? "Quyền định vị được quản lý trong phần quyền trang web của trình duyệt." : "Quyền định vị của hệ thống được quản lý riêng trong Cài đặt thiết bị."}</Text>
    </View>
    <Modal visible={notice} transparent animationType="fade" onRequestClose={() => setNotice(false)}><View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.cardTitle}>Quyền vị trí trên trình duyệt</Text><Text style={styles.body}>Mở biểu tượng quyền trang web bên cạnh địa chỉ, chọn Vị trí và cho phép truy cập. Sau đó tải lại trang. Bạn vẫn xem bản đồ được khi không cấp quyền.</Text><Pressable accessibilityRole="button" onPress={() => setNotice(false)} style={styles.modalAction}><Text style={styles.modalActionText}>Đã hiểu</Text></Pressable></View></View></Modal>
    <View style={styles.card}><Text style={styles.cardTitle}>Phương tiện và ngữ cảnh</Text><Text style={styles.body}>Chưa có hồ sơ phương tiện. Không tự suy đoán thông tin cá nhân hoặc phương tiện.</Text></View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  modalOverlay:{flex:1,backgroundColor:"rgba(0,0,0,.68)",justifyContent:"center",padding:22},modalCard:{backgroundColor:"#102A3B",padding:20,borderRadius:18,gap:14,borderColor:"#36556A",borderWidth:1},modalAction:{backgroundColor:"#F4C979",minHeight:48,borderRadius:12,alignItems:"center",justifyContent:"center"},modalActionText:{color:"#071C2C",fontWeight:"800"},
  root:{flex:1,backgroundColor:"#071C2C"},content:{paddingHorizontal:18,gap:14},
  eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.2,color:"#F4C979"},title:{fontSize:28,fontWeight:"800",color:"#F4F4F0"},subtitle:{fontSize:13,lineHeight:19,color:"#A9BFCE"},
  card:{borderRadius:20,padding:16,gap:12,backgroundColor:"#102A3B",borderWidth:1,borderColor:"#36556A"},
  cardTitle:{fontSize:17,fontWeight:"800",color:"#F4F4F0"},body:{fontSize:13,lineHeight:20,color:"#A9BFCE"},
  status:{fontSize:13,fontWeight:"700",color:"#F4C979"},actions:{flexDirection:"row",gap:9},
  action:{minHeight:48,flex:1,alignItems:"center",justifyContent:"center",borderRadius:12,borderWidth:1,borderColor:"#36556A",backgroundColor:"#17364A"},
  selected:{backgroundColor:"#F4C979",borderColor:"#F4C979"},actionText:{fontSize:12,fontWeight:"700",color:"#F4C979"},selectedText:{color:"#071C2C"},
  settings:{minHeight:44,justifyContent:"center"},settingsText:{fontSize:13,fontWeight:"700",color:"#F4C979"},
  note:{fontSize:11,lineHeight:17,color:"#A9BFCE"}
});