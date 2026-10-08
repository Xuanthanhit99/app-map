import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RealityMap } from "../../infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../infrastructure/location/useForegroundLocationLifecycle";
import { buildRealityHomeViewModel, type RealityPulse } from "@core/features/reality-home/reality-home";
import { getWorldPulseDevelopmentFixtures } from "./worldPulseDevelopmentFixtures";

export function RealityHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const location = useForegroundLocationLifecycle();
  const reality = buildRealityHomeViewModel(getWorldPulseDevelopmentFixtures(), { widthClass: "SMALL_PHONE", orientation: "PORTRAIT", dynamicTypeScale: 1 });
  const pulses = [reality.pulse, ...reality.secondary].filter((pulse): pulse is RealityPulse => pulse !== null);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>WORLD PULSE</Text>
            <Text accessibilityRole="header" style={styles.title}>Ngay quanh bạn</Text>
            <Text style={styles.subtitle}>Điều gì đang thực sự xảy ra — và điều gì đáng chú ý với bạn.</Text>
          </View>
          <View style={styles.liveBadge}><Text style={styles.liveText}>DỮ LIỆU THỬ</Text></View>
        </View>

        <View style={styles.sectionHead}>
          <View><Text style={styles.sectionTitle}>Reality Pulse</Text><Text style={styles.sectionMeta}>Tín hiệu quan trọng được ưu tiên theo tác động</Text></View>
          <Text style={styles.freshness}>Minh họa</Text>
        </View>
        {pulses.length ? <View style={styles.pulseStack}>
          {pulses.map((pulse, index) => <View key={pulse.id} style={[styles.pulseCard, index === 0 ? styles.primaryPulse : styles.secondaryPulse]}>
            <View style={[styles.pulseCue, pulse.tone === "caution" && styles.cueCaution, pulse.tone === "uncertainty" && styles.cueUncertainty]}><Text style={styles.pulseCueText}>{pulse.kind === "ROAD" ? "R" : "P"}</Text></View>
            <View style={styles.flex}>
              <View style={styles.pulseTop}><Text style={styles.pulseTitle}>{pulse.headline}</Text><Text style={styles.pulseKind}>{pulse.kind === "ROAD" ? "ĐƯỜNG" : "ĐỖ XE"}</Text></View>
              {pulse.supportingText ? <Text style={styles.pulseBody}>{pulse.supportingText}</Text> : null}
              <View style={styles.evidenceRow}><Text style={styles.evidence}>DEV FIXTURE</Text><Text style={styles.evidenceMuted}>Qua Reality engine</Text></View>
            </View>
          </View>)}
        </View> : <View style={styles.pulseCard}>
          <View style={styles.unknownIcon}><Text style={styles.unknownMark}>?</Text></View>
          <View style={styles.flex}><Text style={styles.pulseTitle}>Chưa có đủ tín hiệu gần đây</Text><Text style={styles.pulseBody}>{reality.emptyMessage}</Text></View>
        </View>}

        <Pressable accessibilityRole="button" accessibilityLabel="Cập nhật tình hình quanh bạn" onPress={() => router.push("/report-action")} style={styles.reportCard}>
          <View style={styles.reportIcon}><Text style={styles.reportIconText}>+</Text></View>
          <View style={styles.flex}><Text style={styles.reportTitle}>Cập nhật tình hình quanh bạn</Text><Text style={styles.reportBody}>Một chạm để xác minh hoặc báo điều bạn đang thấy.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Không gian quanh bạn</Text><Text style={styles.sectionMeta}>Bản đồ chỉ là bằng chứng không gian</Text></View></View>
        <View style={styles.mapPreview}>
          <RealityMap mode="PREVIEW" location={location} camera={{ mode: "FOLLOW_USER", zoom: 14 }} accessibilityLabel="Bản đồ bằng chứng không gian quanh vị trí hiện tại." />
          {location.status !== "READY" ? <View style={styles.locationPill}><Text style={styles.locationText}>{location.status === "DENIED" ? "Vị trí đang tắt" : "Đang xác định vị trí"}</Text></View> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/map")} style={styles.mapAction}><Text style={styles.mapActionText}>Mở Bản đồ</Text></Pressable>
        </View>

        <View style={styles.decideCard}>
          <Text style={styles.eyebrow}>DECIDE</Text>
          <Text style={styles.decideTitle}>Bạn muốn làm gì lúc này?</Text>
          <Text style={styles.decideBody}>Nói tình huống của bạn. Reality sẽ được dùng để chọn ít phương án phù hợp thay vì đưa một danh sách địa điểm dài.</Text>
          <View style={styles.intentRow}>
            {["Ăn", "Thư giãn", "Hẹn hò", "Khám phá"].map((x) => <View key={x} style={styles.intent}><Text style={styles.intentText}>{x}</Text></View>)}
          </View>
          <View accessibilityLabel="Chọn giúp tôi sẽ mở ở Flow 06" style={styles.decideAction}><Text style={styles.decideActionText}>Chọn giúp tôi</Text><Text style={styles.locked}>Sắp mở</Text></View>
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Cơ hội phù hợp lúc này</Text><Text style={styles.sectionMeta}>Chỉ hiện khi có đủ ngữ cảnh đáng tin cậy</Text></View></View>
        <View style={styles.quietCard}><Text style={styles.quietTitle}>Chưa đủ ngữ cảnh để đề xuất</Text><Text style={styles.quietBody}>Ứng dụng sẽ không đoán khi thiếu vị trí, điều kiện thực tế hoặc tín hiệu phù hợp.</Text></View>

        <View style={styles.storyCard}>
          <View style={styles.storyLabel}><Text style={styles.storyLabelText}>STORY SIGNAL</Text></View>
          <Text style={styles.storyTitle}>Câu chuyện sẽ xuất hiện đúng nơi, đúng lúc</Text>
          <Text style={styles.storyBody}>Khi có nội dung gần bạn với nguồn gốc rõ ràng, tín hiệu lịch sử và văn hóa sẽ xuất hiện nhẹ nhàng tại đây.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFFFFF"},content:{paddingHorizontal:18,gap:12,backgroundColor:"#FFFFFF"},
  header:{paddingTop:10,flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:12},eyebrow:{fontSize:11,lineHeight:15,fontWeight:"800",letterSpacing:1.4,color:"#286F5A"},title:{fontSize:28,lineHeight:32,fontWeight:"800",letterSpacing:-.7,color:"#172C27",marginTop:4},subtitle:{fontSize:13,lineHeight:18,color:"#536A64",marginTop:5,maxWidth:290},
  liveBadge:{flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderColor:"rgba(24,75,55,.14)",borderRadius:16,paddingHorizontal:10,paddingVertical:7},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:"#63C89B"},liveText:{fontSize:10,fontWeight:"800",color:"#285C4B"},
  sectionHead:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",marginTop:6},sectionTitle:{fontSize:17,lineHeight:22,fontWeight:"700",color:"#172C27"},sectionMeta:{fontSize:11,lineHeight:16,color:"#667E76",marginTop:2},freshness:{fontSize:11,color:"#667E76"},
  pulseStack:{gap:5},pulseCard:{flexDirection:"row",gap:11,padding:13,borderRadius:17,borderWidth:1,borderColor:"rgba(24,75,55,.09)",backgroundColor:"#F5F8F6"},primaryPulse:{paddingVertical:15,borderColor:"rgba(40,111,90,.22)",backgroundColor:"#EDF6F1"},secondaryPulse:{paddingVertical:9,borderColor:"rgba(24,75,55,.07)",backgroundColor:"rgba(24,75,55,.025)"},pulseCue:{width:38,height:38,borderRadius:13,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(99,200,155,.13)"},cueCaution:{backgroundColor:"rgba(213,183,122,.16)"},cueUncertainty:{backgroundColor:"rgba(255,255,255,.10)"},pulseCueText:{fontSize:12,fontWeight:"800",color:"#214637"},pulseTop:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:8},pulseKind:{fontSize:8,fontWeight:"800",letterSpacing:.8,color:"#647C73"},unknownIcon:{width:42,height:42,borderRadius:14,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(24,75,55,.09)"},unknownMark:{fontSize:19,fontWeight:"800",color:"#172C27"},flex:{flex:1},pulseTitle:{fontSize:15,lineHeight:20,fontWeight:"700",color:"#172C27"},pulseBody:{fontSize:11,lineHeight:16,color:"#536B63",marginTop:4},evidenceRow:{flexDirection:"row",gap:7,alignItems:"center",marginTop:7},evidence:{fontSize:10,fontWeight:"800",color:"#286F5A",borderWidth:1,borderColor:"rgba(229,201,143,.32)",paddingHorizontal:7,paddingVertical:4,borderRadius:8},evidenceMuted:{fontSize:10,color:"#647C73"},
  reportCard:{minHeight:66,flexDirection:"row",alignItems:"center",gap:12,padding:12,borderRadius:18,backgroundColor:"#EAF5EE",borderWidth:1,borderColor:"rgba(99,200,155,.24)"},reportIcon:{width:36,height:36,borderRadius:12,backgroundColor:"rgba(99,200,155,.14)",alignItems:"center",justifyContent:"center"},reportIconText:{fontSize:23,color:"#23765A"},reportTitle:{fontSize:15,fontWeight:"700",color:"#172C27"},reportBody:{fontSize:11,lineHeight:16,color:"#536B63",marginTop:3},chevron:{fontSize:28,color:"#647C73"},
  mapPreview:{height:144,borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:"rgba(24,75,55,.12)",backgroundColor:"#E9F0EC"},locationPill:{position:"absolute",left:10,top:10,backgroundColor:"rgba(24,55,44,.88)",borderRadius:12,paddingHorizontal:9,paddingVertical:6},locationText:{fontSize:10,color:"#FFFFFF"},mapAction:{position:"absolute",right:10,bottom:10,borderRadius:13,paddingHorizontal:13,paddingVertical:9,backgroundColor:"rgba(255,255,255,.96)",borderWidth:1,borderColor:"rgba(255,255,255,.16)"},mapActionText:{fontSize:11,fontWeight:"700",color:"#172C27"},
  decideCard:{padding:15,borderRadius:20,backgroundColor:"#F2F8F4",borderWidth:1,borderColor:"rgba(40,111,90,.20)"},decideTitle:{fontSize:19,lineHeight:24,fontWeight:"800",color:"#172C27",marginTop:5},decideBody:{fontSize:11,lineHeight:17,color:"#536B63",marginTop:4},intentRow:{flexDirection:"row",gap:6,marginTop:11,flexWrap:"wrap"},intent:{borderRadius:14,borderWidth:1,borderColor:"rgba(24,75,55,.13)",paddingHorizontal:10,paddingVertical:6},intentText:{fontSize:11,color:"#254239"},decideAction:{minHeight:44,borderRadius:15,backgroundColor:"#286F5A",marginTop:12,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},decideActionText:{fontSize:13,fontWeight:"800",color:"#FFFFFF"},locked:{fontSize:10,fontWeight:"700",color:"#4D493B"},
  quietCard:{paddingHorizontal:13,paddingVertical:11,borderRadius:15,backgroundColor:"rgba(24,75,55,.025)",borderWidth:1,borderColor:"rgba(24,75,55,.06)"},quietTitle:{fontSize:14,fontWeight:"700",color:"#213D33"},quietBody:{fontSize:11,lineHeight:17,color:"#647C73",marginTop:4},
  storyCard:{paddingHorizontal:14,paddingVertical:13,borderRadius:17,backgroundColor:"#F5F8F6",borderWidth:1,borderColor:"rgba(40,111,90,.10)",marginBottom:4},storyLabel:{alignSelf:"flex-start",borderRadius:9,backgroundColor:"rgba(40,111,90,.12)",paddingHorizontal:8,paddingVertical:5},storyLabelText:{fontSize:9,fontWeight:"800",letterSpacing:1,color:"#286F5A"},storyTitle:{fontSize:17,lineHeight:22,fontWeight:"700",color:"#172C27",marginTop:10},storyBody:{fontSize:11,lineHeight:17,color:"#647C73",marginTop:4},
});