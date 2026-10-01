import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildRealitySheet } from "@core/features/reality-sheet/reality-sheet";
import { theme } from "../../src/ui/theme";

export default function RealityDetailRoute(){
 const { kind }=useLocalSearchParams<{kind:string}>();
 const router=useRouter();
 const {width,height,fontScale}=useWindowDimensions();
 const insets=useSafeAreaInsets();
 const isParking=kind==="parking";
 const sheet=buildRealitySheet(isParking?{
   kind:"PARKING",state:{domain:"LIMITED",truthStatus:"KNOWN",freshness:"AGING",systemAvailability:"ONLINE",permission:"GRANTED",contentAvailability:"CONTENT",interactionLifecycle:"NONE",fetchLifecycle:"IDLE",safetyLevel:"NONE",provenance:[{sourceType:"FACILITY_API",confidence:"HIGH"}]}
 }:{
   kind:"ROAD",state:{domain:"FLOODED_MODERATE",truthStatus:"KNOWN",freshness:"FRESH",systemAvailability:"ONLINE",permission:"GRANTED",contentAvailability:"CONTENT",interactionLifecycle:"NONE",fetchLifecycle:"IDLE",safetyLevel:"CAUTION",provenance:[{sourceType:"COMMUNITY",confidence:"MEDIUM"}]}
 },{
   widthClass:width>=768?"TABLET":width>=420?"LARGE_PHONE":"SMALL_PHONE",
   orientation:width>height?"LANDSCAPE":"PORTRAIT",dynamicTypeScale:fontScale
 });
 return <View style={[styles.overlay,{paddingTop:insets.top+16,paddingBottom:insets.bottom+16}]}>
   <View accessibilityViewIsModal={sheet.container==="BOTTOM_SHEET"} style={[styles.panel, sheet.container==="SIDE_INSPECTOR"&&styles.side]}>
     <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết" onPress={()=>router.back()} style={styles.close}><Text>Đóng</Text></Pressable>
     <Text accessibilityRole="header" style={styles.title}>{sheet.presentation.headline}</Text>
     <Text style={styles.body}>{sheet.presentation.supportingText}</Text>
     <Text style={styles.meta}>Hiển thị: {sheet.container}</Text>
     <Text accessibilityRole="header" style={styles.section}>Bằng chứng</Text>
     {sheet.evidence.map((e,i)=><Text key={i} style={styles.body}>{e.sourceType} · {e.confidence??"chưa rõ"}</Text>)}
   </View>
 </View>;
}
const styles=StyleSheet.create({
 overlay:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(23,32,31,0.18)",padding:16},
 panel:{backgroundColor:theme.color.surface1,borderRadius:theme.radius.sheet,padding:20,gap:12,borderWidth:1,borderColor:theme.color.border},
 side:{alignSelf:"flex-end",width:"42%",minWidth:360,height:"100%",justifyContent:"center"},
 close:{minHeight:48,alignSelf:"flex-start",justifyContent:"center",paddingHorizontal:12},
 title:{...theme.typography.title1,color:theme.color.textPrimary},
 body:{...theme.typography.body,color:theme.color.textSecondary},
 meta:{...theme.typography.label,color:theme.color.unknown},
 section:{...theme.typography.headline,color:theme.color.textPrimary}
});
