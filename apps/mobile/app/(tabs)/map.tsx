import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RealityMap } from "../../src/infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../src/infrastructure/location/useForegroundLocationLifecycle";

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const location = useForegroundLocationLifecycle();
  return (
    <View style={[styles.root,{paddingTop:insets.top}]}>
      <View style={styles.header}><Text style={styles.eyebrow}>SPATIAL REALITY</Text><Text style={styles.title}>Bản đồ</Text><Text style={styles.meta}>Không gian để kiểm tra tín hiệu thực tế, không thay thế World Pulse.</Text></View>
      <View style={styles.map}><RealityMap location={location} camera={{mode:"FOLLOW_USER",zoom:14}} accessibilityLabel="Bản đồ tình hình thực tế" /></View>
    </View>
  );
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#081916"},header:{paddingHorizontal:16,paddingVertical:14},eyebrow:{fontSize:10,fontWeight:"800",letterSpacing:1.2,color:"#D5B77A"},title:{fontSize:26,lineHeight:32,fontWeight:"800",color:"#FFF",marginTop:3},meta:{fontSize:12,lineHeight:18,color:"#8FA9A3",marginTop:3},map:{flex:1,overflow:"hidden",borderTopWidth:1,borderTopColor:"rgba(255,255,255,.1)"}});