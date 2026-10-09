import { StyleSheet, Text, View } from "react-native";
import type { CameraMode, MapMarker, MapSelection, RouteGeometry } from "@core/map/map-contract";
import type { LocationLifecycle } from "@core/location/location-lifecycle";

/**
 * Web-only spatial fallback. Never imports MapLibre React Native native components.
 * A real web map provider may be added later; do not pretend this is live map data.
 */
export function RealityMap({ accessibilityLabel, mode = "FULL" }: {
  location: LocationLifecycle;
  camera: CameraMode;
  route?: RouteGeometry;
  markers?: readonly MapMarker[];
  selection?: MapSelection;
  onSelectMarker?: (id: string) => void;
  accessibilityLabel: string;
  onUserGesture?: () => void;
  followCamera?: boolean;
  mapStyleId?: string;
  mode?: "PREVIEW" | "FULL";
}) {
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel + " Bản đồ Native chưa hỗ trợ trong bản xem trước Web."} style={[styles.root, mode === "PREVIEW" && styles.preview]}>
      <Text style={styles.heading}>KHÔNG GIAN QUANH BẠN</Text>
      <Text style={styles.body}>Bản xem trước Web chưa hỗ trợ bản đồ Native.</Text>
      <Text style={styles.caption}>Không có vị trí, tuyến đường hoặc dữ liệu LIVE giả lập.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 190, justifyContent: "center", alignItems: "center", padding: 18, backgroundColor: "#102A3A", borderRadius: 14, gap: 9 },
  preview: { minHeight: 150 },
  heading: { fontSize: 12, fontWeight: "800", letterSpacing: 1, color: "#FFCF78" },
  body: { fontSize: 13, textAlign: "center", color: "#F7F7F4" },
  caption: { fontSize: 11, textAlign: "center", color: "#A5BAC9" },
});
