import { Camera, Map, UserLocation } from "@maplibre/maplibre-react-native";
import { StyleSheet, View } from "react-native";
import type { CameraMode, MapSelection, RouteGeometry } from "@core/map/map-contract";
import type { LocationLifecycle } from "@core/location/location-lifecycle";

const DEMO_STYLE = "https://demotiles.maplibre.org/style.json";
const DEFAULT_CENTER: [number, number] = [105.8342, 21.0278];

function initialView(camera: CameraMode, location: LocationLifecycle) {
  if (camera.mode === "INSPECT") return { center: [...camera.center] as [number, number], zoom: camera.zoom };
  if (camera.mode === "OVERVIEW" && camera.center) return { center: [...camera.center] as [number, number], zoom: 11 };
  if (camera.mode === "FOLLOW_USER" && location.status === "READY") return { center: [location.longitude, location.latitude] as [number, number], zoom: camera.zoom };
  if (location.status === "DEGRADED") return { center: [location.lastKnown.longitude, location.lastKnown.latitude] as [number, number], zoom: 12 };
  return { center: DEFAULT_CENTER, zoom: 11 };
}

export function RealityMap({ location, camera, route, selection, accessibilityLabel }: {
  location: LocationLifecycle;
  camera: CameraMode;
  route?: RouteGeometry;
  selection?: MapSelection;
  accessibilityLabel: string;
}) {
  const view = initialView(camera, location);
  const routeSummary = route && route.coordinates.length >= 2 ? ` Tuyến đường có ${route.coordinates.length} điểm hình học.` : "";
  const selectionSummary = selection?.selectedId ? ` Đang chọn ${selection.selectedId}.` : "";

  return (
    <View style={styles.root} accessible={false}>
      <Map style={styles.map} mapStyle={DEMO_STYLE}>
        <Camera initialViewState={view} />
        {location.status === "READY" ? <UserLocation accuracy /> : null}
      </Map>
      <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel + routeSummary + selectionSummary} style={styles.accessibleEquivalent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  accessibleEquivalent: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
