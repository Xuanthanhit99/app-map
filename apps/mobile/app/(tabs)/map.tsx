import { useState } from "react";
import { useLocationPreference } from "../../src/infrastructure/location/LocationPreferenceContext";
import { Linking } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RealityMap } from "../../src/infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../src/infrastructure/location/useForegroundLocationLifecycle";

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { choice: locationChoice, hydrated, setChoice: setLocationChoice } = useLocationPreference();
  const location = useForegroundLocationLifecycle(hydrated && locationChoice === "ENABLE");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [following, setFollowing] = useState(true);
  const locationReady = location.status === "READY" || location.status === "DEGRADED";
  const [mapStyle, setMapStyle] = useState<"streets-v4" | "outdoor-v2" | "satellite">("streets-v4");
  const locationMessage = location.status === "READY"
    ? "Vị trí thiết bị · chưa có tín hiệu cộng đồng được xác minh"
    : location.status === "DENIED"
      ? "Quyền vị trí bị từ chối. Bạn vẫn có thể khám phá bản đồ."
      : location.status === "DEGRADED"
        ? "Đang dùng vị trí gần nhất; có thể không còn chính xác."
        : "Đang xác định vị trí. Bản đồ vẫn có thể khám phá thủ công.";
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SPATIAL REALITY</Text>
        <Text accessibilityRole="header" style={styles.title}>Bản đồ quanh bạn</Text>
        <Text style={styles.meta}>Bản đồ nền là dữ liệu địa lý, không phải báo cáo tình hình trực tiếp.</Text>
      </View>
      {hydrated && locationChoice === "ASK" ? <View style={styles.permissionPanel}><Text style={styles.permissionTitle}>Bạn muốn bật định vị?</Text><Text style={styles.permissionBody}>Bật để xem vị trí và nhận ngữ cảnh quanh bạn. Không bật vẫn xem được bản đồ.</Text><View style={styles.permissionActions}><Pressable accessibilityRole="button" onPress={() => setLocationChoice("ENABLE")} style={styles.permissionPrimary}><Text style={styles.permissionPrimaryText}>Bật định vị</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLocationChoice("SKIP")} style={styles.permissionSecondary}><Text style={styles.permissionSecondaryText}>Không bật</Text></Pressable></View></View> : hydrated && locationChoice === "ENABLE" && location.status === "DENIED" ? <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.permissionPanel}><Text style={styles.permissionTitle}>Chưa có quyền vị trí · Mở cài đặt</Text><Text style={styles.permissionBody}>Bạn vẫn có thể xem bản đồ mà không cấp quyền.</Text></Pressable> : null}
      <View style={styles.map}>
        <RealityMap key={cameraRevision} mode="FULL" location={location} onUserGesture={() => setFollowing(false)} followCamera={following} camera={{ mode: "FOLLOW_USER", zoom: 14 }} mapStyleId={mapStyle} accessibilityLabel="Bản đồ địa lý. Chưa có marker tình hình được xác minh." />
        <View style={styles.controls} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Đổi kiểu bản đồ" onPress={() => setMapStyle((current) => current === "streets-v4" ? "outdoor-v2" : current === "outdoor-v2" ? "satellite" : "streets-v4")} style={styles.controlButton}>
            <Text style={styles.controlText}>Lớp nền: {mapStyle === "streets-v4" ? "Đường phố" : mapStyle === "outdoor-v2" ? "Địa hình" : "Vệ tinh"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Đưa bản đồ về vị trí hiện tại" accessibilityState={{ disabled: !locationReady }} disabled={!locationReady} onPress={() => { setFollowing(true); setCameraRevision((n) => n + 1); }} style={[styles.controlButton, !locationReady && styles.disabled]}>
            <Text style={styles.controlSymbol}>◎</Text>
            <Text style={styles.controlText}>{following ? "Đang theo vị trí" : "Về vị trí của tôi"}</Text>
          </Pressable>
        </View>
        <View style={styles.statePanel} accessible accessibilityRole="summary">
          <View style={styles.stateHeader}><View style={styles.stateDot} /><Text style={styles.stateTitle}>CHƯA CÓ DỮ LIỆU THỰC TẾ</Text></View>
          <Text style={styles.stateText}>{locationMessage}</Text>
          <Text style={styles.stateFoot}>{following ? "Camera theo vị trí khi khả dụng. Kéo bản đồ để khám phá tự do." : "Chế độ khám phá tự do. Chạm nút vị trí để theo lại."}</Text>
        </View>
      </View>
    </View>
  );
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFFFFF"},
  permissionPanel:{marginHorizontal:16,marginBottom:10,padding:13,borderRadius:15,backgroundColor:"#EFF7F2",borderWidth:1,borderColor:"#D5E7DA"},
  permissionTitle:{fontSize:14,fontWeight:"800",color:"#17382D"},permissionBody:{fontSize:12,lineHeight:18,color:"#526A60",marginTop:4},permissionActions:{flexDirection:"row",gap:10,marginTop:10},permissionPrimary:{minHeight:44,justifyContent:"center",paddingHorizontal:15,borderRadius:12,backgroundColor:"#287158"},permissionPrimaryText:{fontSize:13,fontWeight:"700",color:"#FFFFFF"},permissionSecondary:{minHeight:44,justifyContent:"center",paddingHorizontal:15,borderRadius:12,borderWidth:1,borderColor:"#B8D4C4"},permissionSecondaryText:{fontSize:13,fontWeight:"700",color:"#286F5A"},
  header:{paddingHorizontal:18,paddingVertical:14},
  eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.2,color:"#287158"},
  title:{fontSize:26,lineHeight:33,fontWeight:"800",color:"#172C27",marginTop:3},
  meta:{fontSize:12,lineHeight:18,color:"#536A64",marginTop:4},
  map:{flex:1,overflow:"hidden",borderTopWidth:1,borderTopColor:"#E1EAE5"},
  controls:{position:"absolute",right:14,top:16,gap:8},
  controlButton:{minHeight:48,flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:14,borderRadius:15,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE9E2",elevation:3},
  disabled:{opacity:.5},
  controlSymbol:{fontSize:23,color:"#216D55"},
  controlText:{fontSize:13,fontWeight:"700",color:"#172C27"},
  statePanel:{position:"absolute",left:14,right:14,bottom:18,backgroundColor:"rgba(255,255,255,.97)",borderWidth:1,borderColor:"#DDE9E2",borderRadius:18,padding:14,elevation:3},
  stateHeader:{flexDirection:"row",alignItems:"center",gap:7},
  stateDot:{width:8,height:8,borderRadius:4,backgroundColor:"#B98E4E"},
  stateTitle:{fontSize:11,fontWeight:"800",letterSpacing:.5,color:"#4E624F"},
  stateText:{fontSize:13,lineHeight:19,color:"#263D34",marginTop:7},
  stateFoot:{fontSize:11,lineHeight:16,color:"#677C71",marginTop:4}
});
