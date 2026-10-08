import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RealityMap } from "../../src/infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../src/infrastructure/location/useForegroundLocationLifecycle";

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const location = useForegroundLocationLifecycle();
  const [follow, setFollow] = useState(true);
  const [cameraRevision, setCameraRevision] = useState(0);
  const locationReady = location.status === "READY";
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
      <View style={styles.map}>
        <RealityMap key={cameraRevision} mode="FULL" location={location} camera={{ mode: "FOLLOW_USER", zoom: 14 }} accessibilityLabel="Bản đồ địa lý. Chưa có marker tình hình được xác minh." />
        <View style={styles.controls} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Đưa bản đồ về vị trí hiện tại" accessibilityState={{ disabled: !locationReady }} disabled={!locationReady} onPress={() => { setFollow(true); setCameraRevision((n) => n + 1); }} style={[styles.controlButton, !locationReady && styles.disabled]}>
            <Text style={styles.controlSymbol}>◎</Text>
            <Text style={styles.controlText}>Vị trí của tôi</Text>
          </Pressable>
        </View>
        <View style={styles.statePanel} accessible accessibilityRole="summary">
          <View style={styles.stateHeader}><View style={styles.stateDot} /><Text style={styles.stateTitle}>CHƯA CÓ DỮ LIỆU THỰC TẾ</Text></View>
          <Text style={styles.stateText}>{locationMessage}</Text>
          <Text style={styles.stateFoot}>Không có marker, sự cố hoặc thời gian cập nhật giả.</Text>
        </View>
      </View>
    </View>
  );
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFFFFF"},
  header:{paddingHorizontal:18,paddingVertical:14},
  eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.2,color:"#287158"},
  title:{fontSize:26,lineHeight:33,fontWeight:"800",color:"#172C27",marginTop:3},
  meta:{fontSize:12,lineHeight:18,color:"#536A64",marginTop:4},
  map:{flex:1,overflow:"hidden",borderTopWidth:1,borderTopColor:"#E1EAE5"},
  controls:{position:"absolute",right:14,top:16},
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
