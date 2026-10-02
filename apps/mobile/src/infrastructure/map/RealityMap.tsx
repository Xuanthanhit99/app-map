import { Camera, GeoJSONSource, Layer, Map, UserLocation } from "@maplibre/maplibre-react-native";
import { StyleSheet, View } from "react-native";
import type { CameraMode, MapMarker, MapSelection, RouteGeometry } from "@core/map/map-contract";
import { isRenderableRoute } from "@core/map/map-contract";
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

export function RealityMap({ location, camera, route, markers = [], selection, onSelectMarker, accessibilityLabel }: {
  location: LocationLifecycle;
  camera: CameraMode;
  route?: RouteGeometry;
  markers?: readonly MapMarker[];
  selection?: MapSelection;
  onSelectMarker?: (id: string) => void;
  accessibilityLabel: string;
}) {
  const view = initialView(camera, location);
  const routeFeature = route && isRenderableRoute(route) ? { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route.coordinates.map(([lng, lat]) => [lng, lat]) } } : undefined;
  const markerCollection = { type: "FeatureCollection" as const, features: markers.map((marker) => ({ type: "Feature" as const, id: marker.id, properties: { id: marker.id, selected: marker.id === selection?.selectedId }, geometry: { type: "Point" as const, coordinates: [...marker.coordinate] } })) };
  const routeSummary = routeFeature ? ` Tuyến đường có ${route!.coordinates.length} điểm hình học.` : "";
  const selectionSummary = selection?.selectedId ? ` Đang chọn ${selection.selectedId}.` : "";

  return (
    <View style={styles.root} accessible={false}>
      <Map style={styles.map} mapStyle={DEMO_STYLE}>
        <Camera initialViewState={view} />
        {routeFeature ? <GeoJSONSource id="active-route" data={routeFeature}><Layer id="active-route-line" type="line" paint={{ "line-width": 4 }} /></GeoJSONSource> : null}
        {markers.length ? <GeoJSONSource id="reality-markers" data={markerCollection} onPress={(event) => {
          const id = event.nativeEvent.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectMarker?.(id);
        }}><Layer id="reality-marker-dots" type="circle" paint={{ "circle-radius": 7 }} /></GeoJSONSource> : null}
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
