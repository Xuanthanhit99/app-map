import { useEffect, useState } from "react";
import { getRealityDecisionCollection, type ApiCollection } from "../../infrastructure/api/realityDecisionClient";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocationPreference } from "../../infrastructure/location/LocationPreferenceContext";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RealityMap } from "../../infrastructure/map/RealityMap";
import { useForegroundLocationLifecycle } from "../../infrastructure/location/useForegroundLocationLifecycle";

export function RealityHomeScreen() {
  const insets = useSafeAreaInsets();
  const [realityApi, setRealityApi] = useState<ApiCollection<{ id: string }>>({ status: "empty", items: [], reason: "API_NOT_CONFIGURED" });
  const [decisionApi, setDecisionApi] = useState<ApiCollection<{ id: string }>>({ status: "empty", items: [], reason: "API_NOT_CONFIGURED" });
  const [apiLoading, setApiLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const base = process.env.EXPO_PUBLIC_API_BASE_URL;
    Promise.all([getRealityDecisionCollection(base, "reality"), getRealityDecisionCollection(base, "decision")]).then(([reality, decision]) => {
      if (!active) return;
      setRealityApi(reality);
      setDecisionApi(decision);
      setApiLoading(false);
    });
    return () => { active = false; };
  }, []);
  const router = useRouter();
  const { choice: locationChoice, hydrated, setChoice: setLocationChoice } = useLocationPreference();
  const location = useForegroundLocationLifecycle(hydrated && locationChoice === "ENABLE");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>WORLD PULSE</Text>
            <Text accessibilityRole="header" style={styles.title}>Ngay quanh bạn</Text>
            <Text style={styles.subtitle}>Điều gì đang thực sự xảy ra — và điều gì đáng chú ý với bạn.</Text>
          </View>
          
        </View>
        <View style={styles.statusLine}><Text style={styles.statusText}>TRẠNG THÁI · CHƯA CÓ TÍN HIỆU XÁC MINH</Text></View>

        {hydrated && locationChoice === "ASK" ? <View style={styles.locationConsent}><Text style={styles.consentTitle}>Định vị là tùy chọn</Text><Text style={styles.consentBody}>Bật để xem ngữ cảnh quanh bạn. Bạn vẫn có thể khám phá khi không bật.</Text><View style={styles.consentActions}><Pressable accessibilityRole="button" onPress={() => setLocationChoice("ENABLE")} style={styles.consentPrimary}><Text style={styles.consentPrimaryText}>Bật định vị</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLocationChoice("SKIP")} style={styles.consentSecondary}><Text style={styles.consentSecondaryText}>Không bật</Text></Pressable></View></View> : hydrated && locationChoice === "ENABLE" && location.status === "DENIED" ? <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.locationConsent}><Text style={styles.consentTitle}>Định vị bị từ chối · Mở cài đặt</Text><Text style={styles.consentBody}>Không cấp quyền vẫn sử dụng được các tính năng khám phá.</Text></Pressable> : null}
        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Reality Pulse</Text><Text style={styles.sectionMeta}>Tín hiệu quan trọng được ưu tiên theo tác động</Text></View></View>
        <Text accessibilityRole="text" style={styles.sectionMeta}>{apiLoading ? "Đang kiểm tra tín hiệu từ API…" : realityApi.status === "error" ? "Không tải được tín hiệu. Hãy kiểm tra kết nối." : realityApi.status === "empty" ? "API chưa có tín hiệu đủ điều kiện hiển thị LIVE." : "API đã có tín hiệu; cần kiểm chứng provenance trước khi hiển thị."}</Text>
        <View style={styles.pulseCard} accessibilityLabel="Reality Pulse: trạng thái bằng chứng">
          <View style={styles.unknownIcon}><Text style={styles.unknownMark}>?</Text></View>
          <View style={styles.flex}>
            <Text style={styles.pulseTitle}>{apiLoading ? "Đang tải tín hiệu" : realityApi.status === "error" ? "Không tải được Reality Pulse" : realityApi.status === "empty" ? "Chưa có tín hiệu xác minh" : "Đang chờ kiểm chứng bằng chứng"}</Text>
            <Text style={styles.pulseBody}>Không hiển thị dữ liệu LIVE khi chưa kiểm tra provenance, TruthStatus và Freshness.</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Cập nhật tình hình quanh bạn" onPress={() => router.push("/report-action")} style={styles.reportCard}>
          <View style={styles.reportIcon}><Text style={styles.reportIconText}>+</Text></View>
          <View style={styles.flex}><Text style={styles.reportTitle}>Cập nhật tình hình quanh bạn</Text><Text style={styles.reportBody}>Một chạm để xác minh hoặc báo điều bạn đang thấy.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Không gian quanh bạn</Text><Text style={styles.sectionMeta}>Bản đồ chỉ là bằng chứng không gian</Text></View></View>
        <View style={styles.mapPreview}>
          <RealityMap mode="PREVIEW" location={location} camera={{ mode: "FOLLOW_USER", zoom: 14 }} accessibilityLabel="Bản đồ bằng chứng không gian quanh vị trí hiện tại." />
          {location.status !== "READY" ? <View style={styles.locationPill}><Text style={styles.locationText}>{!hydrated ? "Đang tải tùy chọn định vị" : locationChoice !== "ENABLE" ? "Định vị chưa bật" : location.status === "DENIED" ? "Chưa có quyền vị trí" : location.status === "IDLE" ? "Định vị chưa hoạt động" : location.status === "DEGRADED" ? "Vị trí có thể đã cũ" : location.status === "UNAVAILABLE" ? "Chưa lấy được vị trí" : "Đang xác định vị trí"}</Text></View> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/map")} style={styles.mapAction}><Text style={styles.mapActionText}>Mở Bản đồ</Text></Pressable>
        </View>

        <View style={styles.decideCard}>
          <Text style={styles.eyebrow}>DECIDE</Text>
          <Text style={styles.decideTitle}>Bạn muốn làm gì lúc này?</Text>
          <Text style={styles.decideBody}>{apiLoading ? "Đang kiểm tra phương án…" : decisionApi.status === "error" ? "Không kết nối được Decision API." : decisionApi.status === "empty" ? "Chưa có phương án được xác minh. Không tạo kế hoạch khi thiếu dữ liệu." : "Đã nhận dữ liệu API; chờ kiểm chứng điều kiện và provenance."}</Text>

          <Pressable accessibilityRole="button" accessibilityLabel="Xem các phương án hành trình" onPress={() => router.push("/(tabs)/journey")} style={styles.decideAction}><Text style={styles.decideActionText}>Xem phương án</Text><Text style={styles.decideActionText}>›</Text></Pressable>
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
  locationConsent:{padding:12,borderRadius:15,backgroundColor:"#102A3B",borderWidth:1,borderColor:"#36556A"},consentTitle:{fontSize:13,fontWeight:"800",color:"#F4F4F0"},consentBody:{fontSize:11,lineHeight:16,color:"#A9BFCE",marginTop:3},consentActions:{flexDirection:"row",gap:9,marginTop:9},consentPrimary:{minHeight:44,paddingHorizontal:14,justifyContent:"center",borderRadius:11,backgroundColor:"#C49649"},consentPrimaryText:{fontSize:12,fontWeight:"700",color:"#071C2C"},consentSecondary:{minHeight:44,paddingHorizontal:14,justifyContent:"center",borderRadius:11,borderWidth:1,borderColor:"#36556A"},consentSecondaryText:{fontSize:12,fontWeight:"700",color:"#F4C979"},
  statusLine:{paddingHorizontal:11,paddingVertical:9,borderRadius:10,backgroundColor:"#17364A",borderWidth:1,borderColor:"#36556A"},statusText:{fontSize:10,fontWeight:"800",letterSpacing:.7,color:"#F4C979"},
  root:{flex:1,backgroundColor:"#071C2C"},content:{paddingHorizontal:18,gap:12,backgroundColor:"#071C2C"},
  header:{paddingTop:16,flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:12},eyebrow:{fontSize:11,lineHeight:15,fontWeight:"800",letterSpacing:1.4,color:"#F4C979"},title:{fontSize:28,lineHeight:32,fontWeight:"800",letterSpacing:-.7,color:"#F4F4F0",marginTop:4},subtitle:{fontSize:13,lineHeight:18,color:"#A9BFCE",marginTop:5,maxWidth:290},
  liveBadge:{flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderColor:"rgba(24,75,55,.14)",borderRadius:16,paddingHorizontal:10,paddingVertical:7},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:"#63C89B"},liveText:{fontSize:10,fontWeight:"800",color:"#285C4B"},
  sectionHead:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",marginTop:6},sectionTitle:{fontSize:17,lineHeight:22,fontWeight:"700",color:"#F4F4F0"},sectionMeta:{fontSize:11,lineHeight:16,color:"#A9BFCE",marginTop:2},freshness:{fontSize:11,color:"#A9BFCE"},
  pulseStack:{gap:4},pulseCard:{flexDirection:"row",gap:11,padding:18,borderRadius:17,borderWidth:1,borderColor:"rgba(24,75,55,.09)",backgroundColor:"#102A3B"},primaryPulse:{paddingVertical:15,borderColor:"rgba(40,111,90,.22)",backgroundColor:"#17364A"},secondaryPulse:{paddingVertical:6,borderColor:"rgba(24,75,55,.07)",backgroundColor:"rgba(24,75,55,.025)"},pulseCue:{width:32,height:32,borderRadius:13,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(99,200,155,.13)"},cueCaution:{backgroundColor:"rgba(213,183,122,.16)"},cueUncertainty:{backgroundColor:"rgba(255,255,255,.10)"},pulseCueText:{fontSize:12,fontWeight:"800",color:"#214637"},pulseTop:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:8},pulseKind:{fontSize:8,fontWeight:"800",letterSpacing:.8,color:"#A9BFCE"},unknownIcon:{width:42,height:42,borderRadius:14,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(24,75,55,.09)"},unknownMark:{fontSize:19,fontWeight:"800",color:"#F4F4F0"},flex:{flex:1},pulseTitle:{fontSize:14,lineHeight:18,fontWeight:"700",color:"#F4F4F0"},pulseBody:{fontSize:11,lineHeight:16,color:"#A9BFCE",marginTop:4},evidenceRow:{flexDirection:"row",gap:7,alignItems:"center",marginTop:7},evidence:{fontSize:10,fontWeight:"800",color:"#F4C979",borderWidth:1,borderColor:"rgba(229,201,143,.32)",paddingHorizontal:7,paddingVertical:4,borderRadius:8},evidenceMuted:{fontSize:10,color:"#A9BFCE"},secondaryFixture:{fontSize:9,fontWeight:"700",color:"#657C72",marginTop:3},
  reportCard:{minHeight:66,flexDirection:"row",alignItems:"center",gap:12,padding:12,borderRadius:18,backgroundColor:"#17364A",borderWidth:1,borderColor:"rgba(99,200,155,.24)"},reportIcon:{width:36,height:36,borderRadius:12,backgroundColor:"rgba(99,200,155,.14)",alignItems:"center",justifyContent:"center"},reportIconText:{fontSize:23,color:"#F4C979"},reportTitle:{fontSize:15,fontWeight:"700",color:"#F4F4F0"},reportBody:{fontSize:11,lineHeight:16,color:"#A9BFCE",marginTop:3},chevron:{fontSize:28,color:"#A9BFCE"},
  mapPreview:{height:148,borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:"rgba(24,75,55,.12)",backgroundColor:"#102A3B"},locationPill:{position:"absolute",left:10,top:10,backgroundColor:"rgba(24,55,44,.88)",borderRadius:12,paddingHorizontal:9,paddingVertical:6},locationText:{fontSize:10,color:"#F4F4F0"},mapAction:{position:"absolute",right:10,bottom:10,borderRadius:13,paddingHorizontal:13,paddingVertical:9,backgroundColor:"#F4C979",borderWidth:1,borderColor:"rgba(255,255,255,.16)"},mapActionText:{fontSize:11,fontWeight:"700",color:"#071C2C"},
  decideCard:{padding:13,borderRadius:20,backgroundColor:"#102A3B",borderWidth:1,borderColor:"rgba(40,111,90,.20)"},decideTitle:{fontSize:19,lineHeight:24,fontWeight:"800",color:"#F4F4F0",marginTop:5},decideBody:{fontSize:11,lineHeight:17,color:"#A9BFCE",marginTop:4},intentRow:{flexDirection:"row",gap:6,marginTop:11,flexWrap:"wrap"},intent:{borderRadius:14,borderWidth:1,borderColor:"rgba(24,75,55,.13)",paddingHorizontal:10,paddingVertical:6},intentText:{fontSize:11,color:"#F4F4F0"},decideAction:{minHeight:44,borderRadius:15,backgroundColor:"#F4C979",marginTop:12,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},decideActionText:{fontSize:13,fontWeight:"800",color:"#071C2C"},locked:{fontSize:10,fontWeight:"700",color:"#4D493B"},
  quietCard:{paddingHorizontal:13,paddingVertical:11,borderRadius:15,backgroundColor:"rgba(24,75,55,.025)",borderWidth:1,borderColor:"rgba(24,75,55,.06)"},quietTitle:{fontSize:14,fontWeight:"700",color:"#F4F4F0"},quietBody:{fontSize:11,lineHeight:17,color:"#A9BFCE",marginTop:4},
  storyCard:{paddingHorizontal:14,paddingVertical:13,borderRadius:17,backgroundColor:"#102A3B",borderWidth:1,borderColor:"rgba(40,111,90,.10)",marginBottom:4},storyLabel:{alignSelf:"flex-start",borderRadius:9,backgroundColor:"rgba(40,111,90,.12)",paddingHorizontal:8,paddingVertical:5},storyLabelText:{fontSize:9,fontWeight:"800",letterSpacing:1,color:"#F4C979"},storyTitle:{fontSize:17,lineHeight:22,fontWeight:"700",color:"#F4F4F0",marginTop:10},storyBody:{fontSize:11,lineHeight:17,color:"#A9BFCE",marginTop:4},
});